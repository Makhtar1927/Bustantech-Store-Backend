const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');

// Route PUBLIQUE (les clients normaux peuvent créer des commandes sans être connectés)
router.post('/', orderController.createOrder);

// Route PROTÉGÉE (Seul l'admin peut voir toutes les commandes)
router.get('/', authMiddleware, orderController.getAllOrders);

// Route PROTÉGÉE (Mise à jour du statut de la commande)
router.put('/:id/status', authMiddleware, orderController.updateOrderStatus);

// Route PUBLIQUE (Suivi de commande par le client)
router.get('/:id/status', orderController.getOrderStatus);

module.exports = router;