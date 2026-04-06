const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Charge les variables d'environnement
const db = require('./config/db');

const initializeDatabase = async () => {
    try {
        console.log('⏳ Lecture du fichier init.sql...');
        const sqlFilePath = path.join(__dirname, 'init.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('⏳ Exécution des requêtes SQL (Création des tables et données de base)...');
        await db.query(sqlScript);

        console.log('✅ Base de données initialisée avec succès !');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur critique lors de l\'initialisation de la base de données :', err);
        process.exit(1);
    }
};

// Lancement de la fonction
initializeDatabase();