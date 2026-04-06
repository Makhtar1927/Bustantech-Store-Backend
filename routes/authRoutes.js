const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Inscription (Privé : vous pouvez désactiver cette route après votre création)
router.post('/register', authCtrl.register);

// Connexion (Public pour l'admin)
router.post('/login', authCtrl.login);

// Demande de réinitialisation (Génère le lien)
router.post('/forgot-password', authCtrl.forgotPassword);

// Exécution de la réinitialisation (Enregistre le nouveau mot de passe)
router.post('/reset-password', authCtrl.resetPassword);

// Gestion de l'équipe (Routes protégées)
router.get('/employees', authMiddleware, authCtrl.getEmployees);
router.post('/employees', authMiddleware, authCtrl.createEmployee);
router.delete('/employees/:id', authMiddleware, authCtrl.deleteEmployee);

module.exports = router;