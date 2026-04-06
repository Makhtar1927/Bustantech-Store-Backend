const db = require('../config/db');

/**
 * Récupère les paramètres du site.
 * GET /api/settings
 */
exports.getSettings = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM site_settings WHERE id = 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Paramètres non trouvés." });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Erreur settings:", err);
        res.status(500).json({ error: "Erreur serveur lors de la récupération des paramètres." });
    }
};

/**
 * Met à jour les paramètres du site (Admin uniquement).
 * PATCH /api/settings
 */
exports.updateSettings = async (req, res) => {
    const fields = [
        'store_name', 'contact_phone', 'contact_email', 'contact_address', 
        'maps_link', 'whatsapp_number', 'facebook_link', 'instagram_link', 
        'tiktok_link', 'maintenance_mode', 'delivery_cost_dakar', 
        'delivery_cost_suburbs', 'delivery_cost_regions'
    ];

    const updates = [];
    const values = [];
    let idx = 1;

    fields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = $${idx}`);
            values.push(req.body[field]);
            idx++;
        }
    });

    if (updates.length === 0) {
        return res.status(400).json({ error: "Aucun champ à mettre à jour." });
    }

    try {
        // Ajout de la date de mise à jour
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        
        const query = `UPDATE site_settings SET ${updates.join(', ')} WHERE id = 1 RETURNING *`;
        const result = await db.query(query, values);

        // Journalisation de l'action (Audit)
        await db.query(
            'INSERT INTO audit_logs (user_name, action, details) VALUES ($1, $2, $3)',
            [req.user?.full_name || 'Admin', 'UPDATE_SETTINGS', `Mise à jour des paramètres : ${Object.keys(req.body).join(', ')}`]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Erreur update settings:", err);
        res.status(500).json({ error: "Erreur serveur lors de la mise à jour des paramètres." });
    }
};
