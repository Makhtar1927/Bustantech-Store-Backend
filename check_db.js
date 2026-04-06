const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.laxibyijwcccwhyioric:%40Bust%40n_Store-Tech%40@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = res.rows.map(r => r.table_name);
    
    console.log("=== ÉTAT DE LA BASE DE DONNÉES SUPABASE ===");
    console.log("Nombre total de tables:", tables.length);
    for(const table of tables) {
        const cRes = await pool.query(`SELECT count(*) FROM "${table}"`);
        console.log(`- Table [${table}] : ${cRes.rows[0].count} lignes`);
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
