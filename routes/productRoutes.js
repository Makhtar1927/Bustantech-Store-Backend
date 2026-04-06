const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware'); // Sécurité
const checkRole = require('../middleware/roleMiddleware'); // Gestion des rôles
const upload = require('../middleware/uploadMiddleware'); // Image
const rateLimit = require('express-rate-limit');

// Limiteur pour éviter le spam d'avis (Max 5 avis par heure par adresse IP)
const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 5,
    message: { error: "Vous avez publié trop d'avis récemment. Veuillez réessayer plus tard." }
});

// --- ROUTES PUBLIQUES ---
// Récupérer tous les produits
router.get('/', productController.getAllProducts);

// --- ROUTES PROTÉGÉES (ADMIN) ---
// Récupérer les statistiques pour le tableau de bord (doit être avant /:id)
router.get('/stats', authMiddleware, productController.getDashboardStats);

// Récupérer tous les avis pour la modération (doit être avant /:id)
router.get('/all-reviews', authMiddleware, productController.getAllReviewsAdmin);

// --- ROUTES PUBLIQUES (suite) ---
// Route temporaire pour mettre à jour les anciennes images avec le filigrane
router.get('/migrate-watermarks', productController.migrateExistingImages);

// Récupérer les 4 meilleures ventes
router.get('/best-sellers', productController.getBestSellers);

// Récupérer toutes les catégories (doit être avant /:id)
router.get('/categories', productController.getAllCategories);

// Récupérer un produit par son ID (Doit être après les routes spécifiques comme /stats)
router.get('/:id', productController.getProductById);

// Récupérer et ajouter des avis pour un produit
router.get('/:id/reviews', productController.getProductReviews);
router.post('/:id/reviews', reviewLimiter, productController.addProductReview);

// --- ROUTES PROTÉGÉES (ADMIN) ---
// Ajouter un nouveau produit
router.post('/', authMiddleware, checkRole(['admin', 'moderator']), upload.single('image'), productController.createProduct);
// Modifier un produit
router.put('/:id', authMiddleware, checkRole(['admin', 'moderator']), upload.single('image'), productController.updateProduct);
// Supprimer un produit (RÉSERVÉ À L'ADMIN)
router.delete('/:id', authMiddleware, checkRole(['admin']), productController.deleteProduct);
// Supprimer un avis (RÉSERVÉ À L'ADMIN)
router.delete('/reviews/:reviewId', authMiddleware, checkRole(['admin']), productController.deleteReview);

module.exports = router;