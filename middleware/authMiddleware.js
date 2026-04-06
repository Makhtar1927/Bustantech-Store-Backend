const jwt = require('jsonwebtoken');
const db = require('../config/db');

const authMiddleware = async (req, res, next) => {
    // 1. Récupérer l'en-tête d'autorisation (Authorization: Bearer <token>)
    const authHeader = req.headers.authorization;

    // 2. Vérifier si l'en-tête existe et commence bien par "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Accès refusé. Token manquant ou mal formaté.' });
    }

    // 3. Extraire le token pur (en enlevant "Bearer ")
    const token = authHeader.split(' ')[1];

    try {
        // 4. Vérifier et décoder le token avec la clé secrète
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // --- SÉCURITÉ : Vérification de la version du token (Invalidation forcée) ---
        const userRes = await db.query('SELECT token_version FROM admins WHERE id = $1', [decoded.id]);
        
        if (userRes.rows.length === 0) {
            return res.status(401).json({ message: 'Utilisateur introuvable.' });
        }

        const currentVersion = userRes.rows[0].token_version || 0;
        if (decoded.version !== currentVersion) {
            return res.status(401).json({ message: 'Session expirée suite à une mise à jour de sécurité. Veuillez vous reconnecter.' });
        }
        
        // 5. Attacher les données décodées à la requête
        req.user = decoded;
        
        // 6. Autoriser le passage
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};

module.exports = authMiddleware;