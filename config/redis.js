const redis = require('redis');

// Configuration du client Redis
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 3) {
                console.log("ℹ️ Serveur Cache Redis non détecté. BoustaneTech Store fonctionne parfaitement en mode requêtes directes via PostgreSQL.");
                return new Error("Redis connection failed");
            }
            return 1000; // Réessayer après 1s
        }
    }
});

redisClient.on('error', (err) => {
    // On logue l'erreur mais on ne fait pas crasher le serveur
});

redisClient.on('connect', () => console.log('✅ Connecté au serveur de cache Redis'));

// Connexion asynchrone (Requise pour Redis v4+)
(async () => {
    try {
        await redisClient.connect();
    } catch (err) {
        // L'erreur est déjà gérée par l'événement 'error'
    }
})();

module.exports = redisClient;