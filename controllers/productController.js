const db = require('../config/db');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../utils/auditLogger');
const redisClient = require('../config/redis');

// Configuration de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- GESTION DU CACHE REDIS ---
const CACHE_TTL = 300; // Expiration automatique par Redis après 5 minutes (en secondes)

// Fonction utilitaire pour invalider le cache lié aux produits
const clearProductCache = async () => {
    if (!redisClient.isReady) return;
    try {
        // Trouve et supprime dynamiquement toutes les clés de l'espace 'cache:products'
        const keys = await redisClient.keys('cache:products:*');
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
    } catch (err) {
        console.error("Erreur lors de l'invalidation du cache Redis :", err);
    }
};

// Fonction utilitaire pour supprimer un fichier Cloudinary
const deleteCloudinaryFile = async (imageUrl) => {
    if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
    try {
        const uploadIndex = imageUrl.indexOf('upload/');
        if (uploadIndex === -1) return;
        
        let pathAfterUpload = imageUrl.substring(uploadIndex + 7);
        pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, ''); // Retire la version
        const publicId = pathAfterUpload.substring(0, pathAfterUpload.lastIndexOf('.')); // Retire l'extension
        
        const isVideo = imageUrl.match(/\.(mp4|mov|webm)$/i);
        await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? 'video' : 'image' });
    } catch (err) {
        console.error("Erreur lors de la suppression sur Cloudinary :", err);
    }
};

// --- 1. RÉCUPÉRER TOUS LES PRODUITS (Pour la page d'accueil) ---
exports.getAllProducts = async (req, res) => {
    // 1. Vérifier si la réponse est déjà dans le cache
    const cacheKey = `cache:products:${req.originalUrl}`;
    if (redisClient.isReady) {
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached) return res.status(200).json(JSON.parse(cached));
        } catch (err) {
            console.error("Erreur de lecture du cache Redis :", err);
        }
    }

    try {
        // Récupération des paramètres de pagination et de filtres
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const categoryId = req.query.categoryId || ''; // NOUVEAU : Filtre par catégorie
        const sort = req.query.sort || 'newest'; // NOUVEAU : Paramètre de tri
        const inStock = req.query.inStock === 'true'; // NOUVEAU : Filtre "En stock"
        const onSale = req.query.onSale === 'true'; // NOUVEAU : Filtre "En promotion"
        const brand = req.query.brand || ''; // NOUVEAU : Filtre par marque
        const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
        const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;

        // Construction dynamique de la clause WHERE et des valeurs
        const whereConditions = [];
        const queryValues = [];
        let paramIndex = 1;

        if (search) {
            whereConditions.push(`p.name ILIKE $${paramIndex++}`);
            queryValues.push(`%${search}%`);
        }
        if (categoryId) {
            whereConditions.push(`p.category_id = $${paramIndex++}`);
            queryValues.push(categoryId);
        }
        if (brand) {
            whereConditions.push(`p.brand ILIKE $${paramIndex++}`);
            queryValues.push(`%${brand}%`);
        }
        if (inStock) {
            // Vérifie qu'il existe au moins une variante de ce produit avec un stock > 0
            // Cela évite d'exclure les produits dont 1 seule variante est en rupture de stock
            whereConditions.push(`EXISTS (SELECT 1 FROM product_variants v_stock WHERE v_stock.product_id = p.id AND v_stock.stock_quantity > 0)`);
        }
        if (onSale) {
            // NOTE : Ceci suppose que vous avez créé une colonne "is_on_sale" (BOOLEAN) dans la table "products".
            // Si vous utilisez plutôt un système de prix de comparaison, la condition pourrait être : `p.compare_at_price IS NOT NULL`
            whereConditions.push(`p.is_on_sale = true`);
        }
        if (minPrice !== null && !isNaN(minPrice)) {
            whereConditions.push(`p.base_price >= $${paramIndex++}`);
            queryValues.push(minPrice);
        }
        if (maxPrice !== null && !isNaN(maxPrice)) {
            whereConditions.push(`p.base_price <= $${paramIndex++}`);
            queryValues.push(maxPrice);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Construction dynamique de la clause ORDER BY
        let orderByClause = 'ORDER BY p.created_at DESC'; // Par défaut : les plus récents
        if (sort === 'price_asc') {
            orderByClause = 'ORDER BY p.base_price ASC'; // Prix croissant
        } else if (sort === 'price_desc') {
            orderByClause = 'ORDER BY p.base_price DESC'; // Prix décroissant
        }

        // Requête principale pour récupérer les produits
        const mainQueryValues = [...queryValues, limit, offset];
        const query = `
            SELECT 
                p.*, 
                c.name as category_name, 
                c.name as category,
                COALESCE(json_agg(pv.*) FILTER (WHERE pv.id IS NOT NULL), '[]') as variants,
                COALESCE((SELECT ROUND(AVG(rating), 1) FROM product_reviews WHERE product_id = p.id), 0) as average_rating,
                (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) as review_count
            FROM products p
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            ${whereClause}
            GROUP BY p.id, c.name
            ${orderByClause}
            LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;
        
        const result = await db.query(query, mainQueryValues);

        // Requête pour obtenir le nombre total de produits (en tenant compte des mêmes filtres)
        const countQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
        
        const countResult = await db.query(countQuery, queryValues); // Utilise seulement les valeurs de filtre
        const totalItems = parseInt(countResult.rows[0].count);

        const responseData = {
            products: result.rows,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems: totalItems
        };

        // 2. Sauvegarder dans le cache avant de répondre au client
        if (redisClient.isReady) {
            try {
                await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(responseData));
            } catch (err) {
                console.error("Erreur d'écriture dans le cache Redis :", err);
            }
        }

        res.status(200).json(responseData);
    } catch (err) {
        console.error(err); // Mieux pour le débuggage
        res.status(500).json({ error: "Erreur lors de la récupération des produits" });
    }
};

// --- 2. RÉCUPÉRER UN PRODUIT SEUL (Pour la page détails) ---
exports.getProductById = async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(404).json({ message: "Produit introuvable" });
    try {
        const product = await db.query('SELECT p.*, c.name as category_name, c.name as category FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = $1', [id]);
        const variants = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [id]);

        if (product.rows.length === 0) {
            return res.status(404).json({ message: "Produit introuvable" });
        }

        res.json({
            ...product.rows[0],
            variants: variants.rows
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
};

// --- 3. AJOUTER UN PRODUIT (Réservé à l'Admin Bustantech) ---
exports.createProduct = async (req, res) => {
    const { name, description, brand, base_price, category_id, variants, is_on_sale, compare_at_price } = req.body;
    const imageUrl = req.file ? req.file.path : null; // L'URL Cloudinary de l'image
    const isOnSale = is_on_sale === 'true' || is_on_sale === true;
    const compareAtPrice = compare_at_price ? parseFloat(compare_at_price) : null; // null si non renseigné

    try {
        await db.query('BEGIN'); // Début de la transaction

        // Conversion du nom de la catégorie (ex: 'tech') en ID (ex: 1) pour la base de données
        let finalCategoryId = parseInt(category_id);
        if (category_id && isNaN(finalCategoryId)) {
            const catRes = await db.query('SELECT id FROM categories WHERE name = $1', [category_id]);
            if (catRes.rows.length > 0) finalCategoryId = catRes.rows[0].id;
            else {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Catégorie introuvable." });
            }
        }

        const newProduct = await db.query(
            `INSERT INTO products (name, description, brand, base_price, category_id, image_url, is_on_sale, compare_at_price) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [name, description, brand, base_price, finalCategoryId, imageUrl, isOnSale, compareAtPrice]
        );
        
        const productId = newProduct.rows[0].id;

        // Insérer les variantes (si elles existent)
        if (variants) {
            let parsedVariants = [];
            try {
                parsedVariants = JSON.parse(variants);
                if (!Array.isArray(parsedVariants)) throw new Error("Doit être un tableau");
            } catch (e) {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Format des variantes invalide (Tableau JSON attendu)." });
            }
            for (let v of parsedVariants) {
                await db.query(
                    `INSERT INTO product_variants (product_id, sku, attribute_value, price_modifier, stock_quantity) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [productId, v.sku || `SKU-${Date.now()}-${Math.floor(Math.random()*1000)}`, v.attribute_value, v.price_modifier || 0, v.stock_quantity || 0]
                );
            }
        }
        
        const variantsRes = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [productId]);
        await db.query('COMMIT'); // Validation

        await clearProductCache(); // Invalider le cache car le catalogue a changé

        await logActivity(req.user.id, req.user.name || 'Admin', 'CREATE_PRODUCT', `A ajouté le produit : ${name}`);

        res.status(201).json({
            message: "Produit créé avec succès",
            product: { ...newProduct.rows[0], category: category_id, variants: variantsRes.rows }
        });
    } catch (err) {
        await db.query('ROLLBACK'); // Annulation en cas d'erreur
        res.status(500).json({ error: "Erreur lors de la création du produit" });
    }
};

// --- 4. METTRE À JOUR UN PRODUIT (Modification Admin) ---
exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(400).json({ error: "ID invalide (Produit démo)." });

    const { name, brand, base_price, category_id, variants, is_on_sale, compare_at_price } = req.body;
    const newImageUrl = req.file ? req.file.path : null; // URL Cloudinary si nouveau fichier
    const isOnSale = is_on_sale === 'true' || is_on_sale === true;
    const compareAtPrice = compare_at_price ? parseFloat(compare_at_price) : null; // null si effacé

    try {
        await db.query('BEGIN');
        
        // Résolution de l'identifiant de la catégorie (manquant précédemment)
        let finalCategoryId = parseInt(category_id);
        if (category_id && isNaN(finalCategoryId)) {
            const catRes = await db.query('SELECT id FROM categories WHERE name = $1', [category_id]);
            if (catRes.rows.length > 0) finalCategoryId = catRes.rows[0].id;
            else {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Catégorie introuvable." });
            }
        }

        let query;
        let values;

        // Si l'admin a uploadé une nouvelle image/vidéo, on met à jour image_url
        if (newImageUrl) {
            // Récupérer l'ancienne image pour la supprimer de Cloudinary et libérer de l'espace
            const oldProduct = await db.query('SELECT image_url FROM products WHERE id = $1', [id]);
            if (oldProduct.rows.length > 0 && oldProduct.rows[0].image_url) {
                await deleteCloudinaryFile(oldProduct.rows[0].image_url);
            }

            query = `UPDATE products SET name = $1, brand = $2, base_price = $3, category_id = $4, image_url = $5, is_on_sale = $6, compare_at_price = $7 WHERE id = $8 RETURNING *`;
            values = [name, brand, base_price, finalCategoryId, newImageUrl, isOnSale, compareAtPrice, id];
        } else {
            // Sinon, on ne touche pas à l'image existante
            query = `UPDATE products SET name = $1, brand = $2, base_price = $3, category_id = $4, is_on_sale = $5, compare_at_price = $6 WHERE id = $7 RETURNING *`;
            values = [name, brand, base_price, finalCategoryId, isOnSale, compareAtPrice, id];
        }

        const updatedProduct = await db.query(query, values);

        if (updatedProduct.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ message: "Produit introuvable lors de la mise à jour." });
        }

        // Gestion de la modification des variantes
        if (variants) {
            let parsedVariants = [];
            try {
                parsedVariants = JSON.parse(variants);
                if (!Array.isArray(parsedVariants)) throw new Error("Doit être un tableau");
            } catch (e) {
                await db.query('ROLLBACK');
                return res.status(400).json({ error: "Format des variantes invalide (Tableau JSON attendu)." });
            }

            const variantIdsToKeep = parsedVariants.filter(v => v.id).map(v => v.id);
            
            // Désactiver les variantes supprimées (On met le stock à 0 pour ne pas casser l'historique des commandes)
            if (variantIdsToKeep.length > 0) {
                await db.query(`UPDATE product_variants SET stock_quantity = 0 WHERE product_id = $1 AND id != ALL($2::int[])`, [id, variantIdsToKeep]);
            } else {
                await db.query(`UPDATE product_variants SET stock_quantity = 0 WHERE product_id = $1`, [id]);
            }

            // Ajouter ou mettre à jour les variantes envoyées
            for (let v of parsedVariants) {
                if (v.id) {
                    await db.query(
                        `UPDATE product_variants SET sku = $1, attribute_value = $2, price_modifier = $3, stock_quantity = $4 WHERE id = $5`,
                        [v.sku, v.attribute_value, v.price_modifier || 0, v.stock_quantity || 0, v.id]
                    );
                } else {
                    await db.query(
                        `INSERT INTO product_variants (product_id, sku, attribute_value, price_modifier, stock_quantity) VALUES ($1, $2, $3, $4, $5)`,
                        [id, v.sku || `SKU-${Date.now()}-${Math.floor(Math.random()*1000)}`, v.attribute_value, v.price_modifier || 0, v.stock_quantity || 0]
                    );
                }
            }
        }

        const variantsRes = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [id]);
        await db.query('COMMIT');

        await clearProductCache(); // Invalider le cache car un produit a été modifié

        await logActivity(req.user.id, req.user.name || 'Admin', 'UPDATE_PRODUCT', `A modifié le produit : ${name}`);

        res.status(200).json({
            message: "Produit mis à jour avec succès",
            product: { ...updatedProduct.rows[0], category: category_id, variants: variantsRes.rows }
        });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: "Erreur lors de la mise à jour du produit" });
    }
};

// --- 5. SUPPRIMER UN PRODUIT (Action Admin) ---
exports.deleteProduct = async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(400).json({ error: "Impossible de supprimer un produit de démonstration (ID invalide)." });

    try {
        const deletedProduct = await db.query(
            'DELETE FROM products WHERE id = $1 RETURNING *',
            [id]
        );

        if (deletedProduct.rows.length === 0) {
            return res.status(404).json({ message: "Produit introuvable lors de la suppression." });
        }

        // Suppression de l'image/vidéo associée sur Cloudinary
        await deleteCloudinaryFile(deletedProduct.rows[0].image_url);

        await clearProductCache(); // Invalider le cache car un produit a été supprimé

        await logActivity(req.user.id, req.user.name || 'Admin', 'DELETE_PRODUCT', `A supprimé le produit : ${deletedProduct.rows[0].name}`);

        res.status(200).json({ message: "Produit supprimé avec succès" });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression du produit" });
    }
};

// --- 6. STATISTIQUES DU TABLEAU DE BORD ---
exports.getDashboardStats = async (req, res) => {
    try {
        const cacheKey = 'cache:dashboard:stats';
        
        // 1. Vérification dans le cache Redis
        if (redisClient.isReady) {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) return res.status(200).json(JSON.parse(cached));
            } catch (redisErr) {
                console.error("Ignoré : Redis indisponible, lecture depuis la BDD.");
            }
        }

        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
        
        // 1. Récupérer les ventes des 6 derniers mois depuis PostgreSQL
        const result = await db.query(`
            SELECT 
                EXTRACT(MONTH FROM created_at) as mois,
                SUM(total_amount) as ventes,
                COUNT(id) as nb_commandes
            FROM orders
            WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
            GROUP BY EXTRACT(MONTH FROM created_at)
        `);

        // 2. Construire un tableau pour les 6 derniers mois continus
        const graphData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setDate(1); // Évite le bug de saut de mois si on est le 31
            d.setMonth(d.getMonth() - i);
            const monthIndex = d.getMonth();
            
            const monthData = result.rows.find(r => parseInt(r.mois) === monthIndex + 1);
            
            graphData.push({
                name: months[monthIndex],
                ventes: monthData ? parseFloat(monthData.ventes) : 0,
                commandes: monthData ? parseInt(monthData.nb_commandes) : 0
            });
        }

        // 3. Renvoyer le graphique et les KPIs du mois courant (le dernier élément du tableau)
        const currentMonthData = (graphData && graphData.length > 0) ? graphData[graphData.length - 1] : null; 

        // 4. Récupérer la répartition des ventes par catégorie
        const categoryResult = await db.query(`
            SELECT c.name, COALESCE(SUM(oi.quantity), 0) as value
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY c.name
            HAVING SUM(oi.quantity) > 0
        `);

        const responseData = {
            graph: graphData,
            categorySales: categoryResult.rows.map(r => ({ name: r.name, value: parseInt(r.value) })),
            kpi: {
                revenusMois: currentMonthData ? parseFloat(currentMonthData.ventes) : 0,
                commandesMois: currentMonthData ? parseInt(currentMonthData.commandes) : 0
            }
        };

        // 2. Sauvegarde asynchrone dans Redis pour les 5 prochaines minutes
        if (redisClient.isReady) {
            try {
                await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(responseData));
            } catch (redisErr) {
                console.error("Ignoré : Écriture Redis impossible.");
            }
        }

        res.status(200).json(responseData);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
    }
};

// --- 7. RÉCUPÉRER TOUTES LES CATÉGORIES ---
exports.getAllCategories = async (req, res) => {
    try {
        const cacheKey = `cache:products:${req.originalUrl}`;
        
        if (redisClient.isReady) {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) return res.status(200).json(JSON.parse(cached));
            } catch (redisErr) {
                // Ignorer l'erreur Redis
            }
        }

        const result = await db.query('SELECT * FROM categories ORDER BY name ASC');
        
        if (redisClient.isReady) {
            try {
                await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result.rows));
            } catch (redisErr) {}
        }
        
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération des catégories" });
    }
};

// --- 8. RÉCUPÉRER LES AVIS D'UN PRODUIT ---
exports.getProductReviews = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT * FROM product_reviews WHERE product_id = $1 ORDER BY created_at DESC', [id]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Erreur lors de la récupération des avis:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des avis." });
    }
};

// --- 9. AJOUTER UN AVIS ---
exports.addProductReview = async (req, res) => {
    const { id } = req.params;
    const { customer_name, rating, comment } = req.body;

    if (!customer_name || !rating || !comment) {
        return res.status(400).json({ error: "Tous les champs (nom, note, commentaire) sont requis." });
    }

    // --- SÉCURITÉ : SANITIZATION XSS ---
    // Remplace les caractères spéciaux par leurs équivalents HTML inoffensifs
    const escapeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
    };

    const safeName = escapeHTML(customer_name);
    const safeComment = escapeHTML(comment);

    try {
        const newReview = await db.query(
            'INSERT INTO product_reviews (product_id, customer_name, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, safeName, parseInt(rating), safeComment]
        );
        res.status(201).json(newReview.rows[0]);
    } catch (err) {
        console.error("Erreur lors de l'ajout de l'avis:", err);
        res.status(500).json({ error: "Erreur lors de l'ajout de l'avis." });
    }
};

// --- 10. RÉCUPÉRER TOUS LES AVIS POUR L'ADMINISTRATION ---
exports.getAllReviewsAdmin = async (req, res) => {
    try {
        const cacheKey = `cache:products:${req.originalUrl}`;
        
        if (redisClient.isReady) {
            try {
                const cached = await redisClient.get(cacheKey);
                if (cached) return res.status(200).json(JSON.parse(cached));
            } catch (redisErr) {}
        }

        const query = `
            SELECT pr.*, p.name as product_name
            FROM product_reviews pr
            JOIN products p ON pr.product_id = p.id
            ORDER BY pr.created_at DESC
        `;
        const result = await db.query(query);
        
        if (redisClient.isReady) {
            try {
                await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result.rows));
            } catch (redisErr) {}
        }
        
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Erreur lors de la récupération de tous les avis:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des avis." });
    }
};

// --- 11. SUPPRIMER UN AVIS (ACTION ADMIN) ---
exports.deleteReview = async (req, res) => {
    const { reviewId } = req.params;
    try {
        const deletedReview = await db.query('DELETE FROM product_reviews WHERE id = $1 RETURNING *', [reviewId]);
        if (deletedReview.rows.length === 0) {
            return res.status(404).json({ message: "Avis introuvable lors de la suppression." });
        }
        res.status(200).json({ message: "Avis supprimé avec succès" });
    } catch (err) {
        console.error("Erreur lors de la suppression de l'avis:", err);
        res.status(500).json({ error: "Erreur lors de la suppression de l'avis." });
    }
};

// --- 12. TEMPORAIRE : MIGRER LES ANCIENNES IMAGES (FILIGRANE) ---
exports.migrateExistingImages = async (req, res) => {
    try {
        // On cherche uniquement les produits avec des images Cloudinary
        const products = await db.query("SELECT id, image_url FROM products WHERE image_url LIKE '%cloudinary.com%'");
        let updatedCount = 0;

        for (const p of products.rows) {
            const url = p.image_url;

            // Ignore les vidéos ou les images qui ont déjà le logo
            if (!url || url.match(/\.(mp4|mov|webm)$/i) || url.includes('bustantech_logo')) {
                continue;
            }

            // 1. Extraction propre du Public ID depuis l'URL
            const uploadIndex = url.indexOf('upload/');
            if (uploadIndex === -1) continue;
            
            let pathAfterUpload = url.substring(uploadIndex + 7);
            pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, ''); // Retire la version (v1234567/)
            const publicId = pathAfterUpload.substring(0, pathAfterUpload.lastIndexOf('.')); // Retire l'extension

            // 2. Demande à Cloudinary d'appliquer la transformation
            const result = await cloudinary.uploader.explicit(publicId, {
                type: "upload",
                resource_type: "image",
                eager: [
                    {
                        transformation: [
                            { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
                            { overlay: { public_id: 'bustantech_store/bustantech_logo' }, flags: 'relative', width: '0.15', gravity: 'south_east', x: 25, y: 25, opacity: 80, crop: 'scale' }
                        ]
                    }
                ]
            });

            // 3. Mise à jour de la base de données avec la nouvelle URL générée
            if (result && result.eager && result.eager.length > 0) {
                const newUrl = result.eager[0].secure_url;
                await db.query("UPDATE products SET image_url = $1 WHERE id = $2", [newUrl, p.id]);
                updatedCount++;
            }
        }

        res.status(200).json({ message: `Succès : ${updatedCount} ancienne(s) image(s) mise(s) à jour avec le filigrane.` });
    } catch (err) {
        console.error("Erreur de migration :", err);
        res.status(500).json({ error: "Erreur lors de la migration des filigranes." });
    }
};

// --- 13. RÉCUPÉRER LES MEILLEURES VENTES ---
exports.getBestSellers = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.*, 
                c.name as category_name, 
                c.name as category,
                COALESCE(json_agg(pv.*) FILTER (WHERE pv.id IS NOT NULL), '[]') as variants,
                COALESCE((SELECT ROUND(AVG(rating), 1) FROM product_reviews WHERE product_id = p.id), 0) as average_rating,
                (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) as review_count,
                COALESCE((SELECT SUM(quantity) FROM order_items WHERE product_id = p.id), 0) as total_sold
            FROM products p
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_variants pv ON p.id = pv.product_id
            GROUP BY p.id, c.name
            ORDER BY total_sold DESC
            LIMIT 4;
        `;
        
        const result = await db.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Erreur lors de la récupération des meilleures ventes :", err);
        res.status(500).json({ error: "Erreur lors de la récupération des meilleures ventes." });
    }
};