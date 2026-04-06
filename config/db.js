const { Pool } = require('pg');
require('dotenv').config(); // Pour lire les accès secrets dans le fichier .env

// Configuration du Pool de connexion
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Sécurité indispensable pour Supabase (connexion distante)
  ssl: { rejectUnauthorized: false }
});

// Test de la connexion au démarrage
pool.on('connect', () => {
  console.log('✅ Bustantech Store est connecté à la base de données PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur le client PostgreSQL', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};