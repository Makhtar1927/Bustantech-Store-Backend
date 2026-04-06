/**
 * Middleware pour vérifier les permissions basées sur les rôles.
 * Doit toujours être placé APRÈS authMiddleware.
 * 
 * @param {Array} allowedRoles - Tableau des rôles autorisés (ex: ['admin', 'moderator'])
 */
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        // req.user est injecté par authMiddleware au préalable
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: "Non autorisé. Profil introuvable." });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Accès refusé. Vous n'avez pas les privilèges nécessaires pour cette action." });
        }

        next();
    };
};

module.exports = checkRole;