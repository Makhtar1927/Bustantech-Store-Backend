const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // 1. Récupérer l'en-tête d'autorisation (Authorization: Bearer <token>)
    const authHeader = req.headers.authorization;

    // 2. Vérifier si l'en-tête existe et commence bien par "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Accès refusé. Token manquant ou mal formaté.' });
    }

    // 3. Extraire le token pur (en enlevant "Bearer ")
    const token = authHeader.split(' ')[1];

    try {
        // 4. Vérifier et décoder le token avec la clé secrète
        // Si le token est expiré ou falsifié, jwt.verify va déclencher une erreur (catch)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 5. Attacher les données décodées (ex: { id: 1, role: 'admin' }) à la requête
        req.user = decoded;
        
        // 6. Autoriser le passage vers le contrôleur (ex: createProduct)
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};

module.exports = authMiddleware;