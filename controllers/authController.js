const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { logActivity } = require('../utils/auditLogger');

// --- 1. INSCRIPTION ADMIN (À utiliser une seule fois pour vous créer) ---
exports.register = async (req, res) => {
    const { full_name, email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis." });

    try {
        // Hacher le mot de passe (10 tours de sécurité)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await db.query(
            `INSERT INTO admins (full_name, email, password_hash) 
             VALUES ($1, $2, $3) RETURNING id, full_name, email`,
            [full_name, email, hashedPassword]
        );

        res.status(201).json({ message: "Admin créé avec succès", user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "L'email existe déjà ou erreur serveur" });
    }
};

// --- 2. CONNEXION (Login) ---
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis." });

    try {
        // Vérifier si l'admin existe
        const user = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ error: "Identifiants invalides" });

        // Vérifier le mot de passe
        const isMatch = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!isMatch) return res.status(401).json({ error: "Identifiants invalides" });

        // Générer le Token JWT (Valable 24h)
        const token = jwt.sign(
            { id: user.rows[0].id, role: user.rows[0].role, name: user.rows[0].full_name, version: user.rows[0].token_version || 0 },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: "Connexion réussie",
            token: token,
            admin: { name: user.rows[0].full_name, email: user.rows[0].email }
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la connexion" });
    }
};

// --- 3. MOT DE PASSE OUBLIÉ (Envoi de l'e-mail) ---
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: "Aucun compte trouvé avec cet e-mail." });
        }

        // Générer un token aléatoire
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 3600000); // Valable 1 heure

        await db.query(
            'UPDATE admins SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
            [resetToken, resetTokenExpires, email]
        );

        // Configurer l'expéditeur d'e-mail (Nodemailer avec Gmail)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

        await transporter.sendMail({
            from: `"BoustaneTech Store" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Réinitialisation de votre mot de passe Admin',
            html: `
                <h2>BoustaneTech Store - Sécurité</h2>
                <p>Vous (ou quelqu'un d'autre) avez demandé la réinitialisation de votre mot de passe d'administration.</p>
                <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
                <a href="${resetUrl}" style="display:inline-block; padding:10px 20px; background-color:#d4af37; color:white; text-decoration:none; font-weight:bold; margin-top:10px; border-radius:4px;">Réinitialiser mon mot de passe</a>
                <p><i>Ce lien est valable pendant 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</i></p>
            `
        });

        res.json({ message: "E-mail de réinitialisation envoyé avec succès." });
    } catch (err) {
        console.error(err);
        // En cas d'erreur d'envoi, on nettoie le token pour des raisons de sécurité
        await db.query('UPDATE admins SET reset_token = NULL, reset_token_expires = NULL WHERE email = $1', [email]);
        res.status(500).json({ error: "Erreur lors de la demande de réinitialisation." });
    }
};

// --- 4. RÉINITIALISER LE MOT DE PASSE (Vérification et mise à jour) ---
exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        // On cherche un utilisateur avec ce token ET on vérifie que la date d'expiration n'est pas passée
        const user = await db.query(
            'SELECT * FROM admins WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Ce lien de réinitialisation est invalide ou a expiré." });
        }

        // On crypte le nouveau mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // On met à jour le mot de passe, on efface le token ET on incrémente la version du JWT
        await db.query(
            'UPDATE admins SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, token_version = COALESCE(token_version, 0) + 1 WHERE id = $2',
            [hashedPassword, user.rows[0].id]
        );

        res.json({ message: "Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la réinitialisation du mot de passe." });
    }
};

// --- 5. RÉCUPÉRER LA LISTE DES EMPLOYÉS (Admin uniquement) ---
exports.getEmployees = async (req, res) => {
    try {
        // On ne renvoie pas les mots de passe hachés par sécurité
        const users = await db.query('SELECT id, full_name, email, role, created_at FROM admins ORDER BY created_at DESC');
        res.json(users.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des employés." });
    }
};

// --- 6. CRÉER UN NOUVEL EMPLOYÉ (Admin uniquement) ---
exports.createEmployee = async (req, res) => {
    // Vérification stricte du rôle
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });

    const { full_name, email, password, role } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: "Tous les champs sont requis." });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = await db.query(
            `INSERT INTO admins (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role, created_at`,
            [full_name, email, hashedPassword, role || 'moderator']
        );
        
        // Log de l'action
        await logActivity(req.user.id, req.user.name || 'Admin', 'CREATE_EMPLOYEE', `A ajouté l'employé : ${full_name} (${role})`);

        res.status(201).json({ message: "Employé créé avec succès.", user: newUser.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Cet e-mail est déjà utilisé par un autre compte." });
        res.status(500).json({ error: "Erreur lors de la création du compte." });
    }
};

// --- 7. SUPPRIMER UN EMPLOYÉ (Admin uniquement) ---
exports.deleteEmployee = async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });
    
    const { id } = req.params;
    // Empêcher l'administrateur de supprimer son propre compte par erreur
    if (req.user.id === parseInt(id)) return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });

    try {
        await db.query('DELETE FROM admins WHERE id = $1', [id]);

        await logActivity(req.user.id, req.user.name || 'Admin', 'DELETE_EMPLOYEE', `A révoqué l'accès de l'employé #${id}`);

        res.json({ message: "Compte employé supprimé avec succès." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression." });
    }
};