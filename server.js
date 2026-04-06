const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // Sécurité contre les attaques HTTP
const morgan = require('morgan'); // Affiche les requêtes dans la console (pratique pour débugger)
require('dotenv').config();
const fs = require('fs'); // Pour écrire dans un fichier
const path = require('path'); // Pour gérer les chemins de fichiers
const bcrypt = require('bcrypt'); // Pour crypter le mot de passe de l'admin par défaut
const rateLimit = require('express-rate-limit'); // Limitation de débit
const EventEmitter = require('events'); // Pour les notifications temps réel

// Importation de la connexion DB et des routes
const db = require('./config/db');
const redisClient = require('./config/redis'); // Initialisation de Redis
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const stockRoutes = require('./routes/stockRoutes');
const orderRoutes = require('./routes/orderRoutes');
const authMiddleware = require('./middleware/authMiddleware'); // Importation de la sécurité
const checkRole = require('./middleware/roleMiddleware'); // Gestion des rôles

const app = express();

// --- NGINX REVERSE PROXY CONFIGURATION ---
// Indispensable pour que 'express-rate-limit' lise la vraie adresse IP du client transmise par Nginx
app.set('trust proxy', 1);

// --- Configuration du canal de notifications temps réel (SSE) ---
const notificationEmitter = new EventEmitter();
app.set('notificationEmitter', notificationEmitter); // Le rend accessible partout via req.app.get()

// --- 1. MIDDLEWARES DE BASE ---
app.use(cors());   // Le CORS DOIT toujours être appelé en premier pour ne pas être bloqué
app.use(helmet({ crossOriginResourcePolicy: false })); // Protège votre site des failles XSS
app.use(express.json()); // Permet de lire les données JSON envoyées (ex: prix, nom d'iPhone)
app.use(morgan('dev'));  // Affiche "GET /api/products 200" dans votre terminal

// --- 1.5 SÉCURITÉ : LIMITATION DE DÉBIT (Rate Limiting) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Augmenté pour éviter les blocages pendant le dev
    message: { error: "Trop de requêtes." }
});
app.use('/api', apiLimiter);

// --- 2.5 NOTIFICATIONS TEMPS RÉEL (SSE) ---
app.get('/api/notifications/stream', authMiddleware, (req, res) => {
    // Garder la connexion HTTP ouverte et empêcher le cache
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // À chaque nouvel événement 'push', on l'envoie au navigateur du client
    const listener = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    notificationEmitter.on('push', listener);

    // Nettoyer la mémoire si l'Admin ferme son onglet
    req.on('close', () => notificationEmitter.off('push', listener));
});

// --- 2. ROUTES API (Les Portes d'Entrée) ---

// Route racine (Health check / Message de bienvenue)
app.get('/', (req, res) => {
    res.status(200).send("🚀 Bienvenue sur l'API Bustantech Store. Le serveur fonctionne parfaitement !");
});

// Authentification (Login Admin)
// Note : On pourrait appliquer un authLimiter très strict (ex: 5 tentatives par heure) directement sur authRoutes
app.use('/api/auth', authRoutes);

// Produits (iPhones, Parfums, Café)
app.use('/api/products', productRoutes);

// Gestion des Stocks
app.use('/api/stock', stockRoutes);

// Commandes des clients
app.use('/api/orders', orderRoutes);

// --- NEWSLETTER ---
app.post('/api/newsletter', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "L'email est requis." });
    try {
        await db.query('INSERT INTO newsletter_subscribers (email) VALUES ($1)', [email]);
        res.status(201).json({ message: "Abonnement réussi ! Merci." });
    } catch (err) {
        if (err.code === '23505') { // Erreur de doublon PostgreSQL
            return res.status(400).json({ error: "Cet e-mail est déjà inscrit." });
        }
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// --- RÉCUPÉRER LES ABONNÉS (Protégé - Réservé à l'Admin) ---
app.get('/api/newsletter', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM newsletter_subscribers ORDER BY subscribed_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur lors de la récupération des abonnés." });
    }
});

// --- ROUTE : JOURNAL D'ACTIVITÉ (AUDIT LOGS) ---
app.get('/api/audit', authMiddleware, checkRole(['admin']), async (req, res) => {
    try {
        const logs = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
        res.status(200).json(logs.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des logs d'audit." });
    }
});

// --- 3. GESTION DES ERREURS (Le filet de sécurité) ---
// Si une route n'existe pas
app.use((req, res, next) => {
    res.status(404).json({ message: "Désolé, cette route n'existe pas sur Bustantech API" });
});

// Erreur globale du serveur
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Une erreur interne est survenue sur le serveur.", stack: err.stack, details: err.message });
});

// --- CRÉATION AUTOMATIQUE DE L'ADMINISTRATEUR PAR DÉFAUT ---
const seedAdmin = async () => {
    try {
        // 1. Création de la table des logs d'audit si elle n'existe pas
        await db.query(`CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INT,
            user_name VARCHAR(255),
            action VARCHAR(255),
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        const email = 'bustanstoretech@gmail.com';
        const password = '@Bust@n.tech-store@';
        
        // Vérifie si l'administrateur existe déjà dans la base
        const userCheck = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (userCheck.rows.length === 0) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            await db.query(
                'INSERT INTO admins (full_name, email, password_hash) VALUES ($1, $2, $3)',
                ['Admin Bustantech', email, hashedPassword]
            );
            console.log(`\n✅ Compte Administrateur créé avec succès : ${email}`);
        }
    } catch (err) {
        console.error("Erreur lors de la vérification/création de l'admin:", err.message);
    }
};
seedAdmin();

// --- 4. LANCEMENT DU SERVEUR ---
const PORT = process.env.PORT || 5000;

// On n'écoute le port que si le fichier est exécuté directement (pas lors des tests)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
        🚀 ============================================
        ✨ BUSTANTECH STORE - BACKEND ACTIF
        📡 Port      : ${PORT}
        🟢 Statut    : Opérationnel
        🏛️ DB Status : Connectée via Pool PostgreSQL
        ============================================
        `);
    });
}

// Export de l'application pour que Supertest puisse l'utiliser
module.exports = app;