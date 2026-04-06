const db = require('../config/db');

exports.logActivity = async (userId, userName, action, details) => {
    try {
        await db.query(
            'INSERT INTO audit_logs (user_id, user_name, action, details) VALUES ($1, $2, $3, $4)',
            [userId, userName, action, details]
        );
    } catch (err) {
        console.error("Erreur lors de l'enregistrement du log d'audit :", err);
    }
};