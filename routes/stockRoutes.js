const express = require('express');
const router = express.Router();
const stockCtrl = require('../controllers/stockController');
const auth = require('../middleware/authMiddleware');

// Toutes les routes de stock sont protégées par "auth"
router.post('/variant/add', auth, stockCtrl.addVariant);
router.patch('/update', auth, stockCtrl.updateStock);
router.get('/low-alerts', auth, stockCtrl.getLowStockAlerts);

module.exports = router;