const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

/**
 * @route   GET /api/settings
 * @desc    Récupérer les réglages du site (Public)
 */
router.get('/', settingsController.getSettings);

/**
 * @route   PATCH /api/settings
 * @desc    Mettre à jour les réglages du site (Admin Only)
 */
router.patch('/', authMiddleware, checkRole(['admin']), settingsController.updateSettings);

module.exports = router;
