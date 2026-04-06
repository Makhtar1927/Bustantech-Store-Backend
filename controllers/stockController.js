const db = require('../config/db');

// --- 1. CRÉER UNE VARIANTE (ex: iPhone 15 + Noir + 128Go) ---
exports.addVariant = async (req, res) => {
    const { product_id, sku, attribute_name, attribute_value, price_modifier, stock_quantity } = req.body;

    try {
        const newVariant = await db.query(
            `INSERT INTO product_variants (product_id, sku, attribute_name, attribute_value, price_modifier, stock_quantity) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [product_id, sku, attribute_name, attribute_value, price_modifier, stock_quantity]
        );

        res.status(201).json({ message: "Variante ajoutée", variant: newVariant.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la création de la variante (SKU peut-être déjà utilisé)" });
    }
};

// --- 2. METTRE À JOUR LE STOCK (Entrée/Sortie) ---
exports.updateStock = async (req, res) => {
    const { variant_id, change_amount, reason } = req.body; 
    // change_amount peut être positif (+10 café) ou négatif (-1 vente iPhone)

    try {
        // Début d'une transaction (pour être sûr que tout se passe bien)
        await db.query('BEGIN');

        const updated = await db.query(
            `UPDATE product_variants 
             SET stock_quantity = NG stock_quantity`,
            [change_amount, variant_id]
        );

        if (updated.rows.length === 0) {
            throw new Error("Variante introuvable");
        }

        // Enregistrement dans l'historique (Stock Logs)
        await db.query(
            `INSERT INTO stock_logs (variant_id, change_amount, reason) 
             VALUES ($1, $2, $3)`,
            [variant_id, change_amount, reason]
        );

        await db.query('COMMIT');

        res.json({ 
            message: "Stock mis à jour", 
            new_quantity: updated.rows[0].stock_quantity 
        });

    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
};

// --- 3. ALERTES DE STOCK BAS (Pour le Dashboard Admin) ---
exports.getLowStockAlerts = async (req, res) => {
    try {
        const lowStock = await db.query(
            `SELECT p.name, pv.sku, pv.attribute_value, pv.stock_quantity 
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.stock_quantity < 5` // Seuil d'alerte à 5 unités
        );
        res.json(lowStock.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des alertes" });
    }
};