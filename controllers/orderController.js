const db = require('../config/db');
const { logActivity } = require('../utils/auditLogger');

// --- 1. CRÉER UNE NOUVELLE COMMANDE ---
exports.createOrder = async (req, res) => {
    const { customer_name, customer_phone, customer_address, payment_method, total_amount, items, promo_code } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Le panier est vide ou invalide." });
    }

    try {
        // DÉBUT DE LA TRANSACTION
        await db.query('BEGIN');

        // Étape 1 : Calculer le total sécurisé depuis la base de données (Prévention Fraude)
        let secureTotalAmount = 0;
        const secureItems = [];

        // Estimation des frais de port basée sur l'adresse sauvegardée (Sécurisée contre les nulls)
        const safeAddress = customer_address || '';
        const shippingCost = safeAddress.includes('Dakar') ? 2000 : 
                             safeAddress.includes('Rufisque') ? 3000 : 
                             safeAddress.includes('Régions') ? 5000 : 0;
        secureTotalAmount += shippingCost;

        for (let item of items) {
            // Validation robuste pour éviter les crashs PostgreSQL si l'ID n'est pas un nombre valide
            const productId = parseInt(item.id);
            if (isNaN(productId) || productId <= 0) {
                throw new Error(`Le produit ajouté (ID: ${item.id}) est un produit de démonstration. Videz votre panier et choisissez de vrais produits.`);
            }
            if (item.quantity <= 0) throw new Error("La quantité d'un article est invalide.");

            const prodRes = await db.query('SELECT base_price, name FROM products WHERE id = $1', [productId]);
            if (prodRes.rows.length === 0) throw new Error(`Le produit n'existe plus dans le catalogue.`);
            
            let unitPrice = parseFloat(prodRes.rows[0].base_price);

            if (item.variant_id) {
                const variantId = parseInt(item.variant_id);
                if (!isNaN(variantId)) {
                    const varRes = await db.query('SELECT price_modifier, stock_quantity FROM product_variants WHERE id = $1 AND product_id = $2', [variantId, productId]);
                    if (varRes.rows.length > 0) {
                        // Vérification stricte anti sur-vente
                        if (varRes.rows[0].stock_quantity < item.quantity) {
                            throw new Error(`Stock insuffisant pour le produit : ${prodRes.rows[0].name}. Quantité disponible : ${varRes.rows[0].stock_quantity}`);
                        }
                        unitPrice += parseFloat(varRes.rows[0].price_modifier);
                    } else {
                        throw new Error(`La variante sélectionnée pour le produit ${prodRes.rows[0].name} n'existe pas.`);
                    }
                }
            }
            secureTotalAmount += (unitPrice * item.quantity);
            secureItems.push({ ...item, secure_price: unitPrice, product_name: prodRes.rows[0].name });
        }

        // Étape 1.5 : Appliquer le code promo sur le total sécurisé
        let discountAmount = 0;
        const subtotal = secureTotalAmount - shippingCost; // La remise s'applique hors frais de port
        
        if (promo_code === 'VIP10') {
            discountAmount = subtotal * 0.10;
        } else if (promo_code === 'WELCOME5') {
            discountAmount = 5000;
        }
        
        // On s'assure que la remise ne dépasse pas le sous-total (ne pas déduire les frais de port)
        const finalSubtotal = Math.max(0, subtotal - discountAmount);
        secureTotalAmount = finalSubtotal + shippingCost;

        // Étape 2 : Insérer la commande générale
        const orderResult = await db.query(
            `INSERT INTO orders (customer_name, customer_phone, customer_address, total_amount, payment_method) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [customer_name, customer_phone, customer_address, secureTotalAmount, payment_method]
        );

        const newOrderId = orderResult.rows[0].id;

        // Étape 3 : Boucler sur les articles sécurisés du panier et les insérer un par un
        for (let item of secureItems) {
            // Note : si le produit n'a pas de variante, item.variant_id sera null.
            await db.query(
                `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [newOrderId, item.id, item.variant_id || null, item.quantity, item.secure_price]
            );
            
            // Déduction automatique du stock et alerte
            if (item.variant_id) {
                const stockRes = await db.query(
                    `UPDATE product_variants SET stock_quantity = GREATEST(stock_quantity - $1, 0) WHERE id = $2 RETURNING stock_quantity, attribute_value`,
                    [item.quantity, item.variant_id]
                );
                if (stockRes.rows.length > 0 && stockRes.rows[0].stock_quantity <= 5) {
                    req.app.get('notificationEmitter')?.emit('push', {
                        type: 'LOW_STOCK',
                        message: `⚠️ Stock critique : ${item.product_name} (${stockRes.rows[0].attribute_value}) - Il ne reste que ${stockRes.rows[0].stock_quantity} unité(s).`
                    });
                }
            }
        }

        // TOUT S'EST BIEN PASSÉ : ON VALIDE LA TRANSACTION
        await db.query('COMMIT');

        // Notification temps réel à l'Admin pour la nouvelle commande
        req.app.get('notificationEmitter')?.emit('push', {
            type: 'NEW_ORDER',
            message: `🛒 Nouvelle commande (#${newOrderId}) validée par ${customer_name} !`
        });

        res.status(201).json({ 
            message: "Commande enregistrée avec succès !", 
            orderId: newOrderId 
        });

    } catch (err) {
        // EN CAS D'ERREUR : ON ANNULE TOUT POUR GARDER LA BASE PROPRE
        await db.query('ROLLBACK');
        console.error("Erreur lors de la création de la commande :", err);
        // Renvoie l'erreur spécifique (ex: produit de démo) pour informer clairement le client
        res.status(500).json({ error: err.message || "Impossible d'enregistrer la commande." });
    }
};

// --- 2. RÉCUPÉRER TOUTES LES COMMANDES (Pour l'Admin) ---
exports.getAllOrders = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT o.*,
            COALESCE(
                json_agg(
                    json_build_object(
                        'product_name', p.name,
                        'variant', pv.attribute_value,
                        'quantity', oi.quantity,
                        'unit_price', oi.unit_price
                    )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
            ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN product_variants pv ON oi.variant_id = pv.id
            GROUP BY o.id
            ORDER BY o.created_at DESC;
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des commandes" });
    }
};

// --- 3. METTRE À JOUR LE STATUT D'UNE COMMANDE ---
exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const updatedOrder = await db.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (updatedOrder.rows.length === 0) return res.status(404).json({ message: "Commande introuvable." });

        await logActivity(req.user.id, req.user.name || 'Admin', 'UPDATE_ORDER_STATUS', `A passé la commande #${id} au statut : ${status}`);

        res.status(200).json({ message: "Statut mis à jour", order: updatedOrder.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la mise à jour du statut" });
    }
};

// --- 4. RÉCUPÉRER LE STATUT D'UNE COMMANDE (PUBLIC) ---
exports.getOrderStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            'SELECT id, total_amount, status, created_at FROM orders WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Commande introuvable. Veuillez vérifier le numéro." });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la recherche de la commande" });
    }
};