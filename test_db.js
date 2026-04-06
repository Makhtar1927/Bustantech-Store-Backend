const { Pool } = require('pg');

const poolerHosts = [
    'aws-0-eu-central-1.pooler.supabase.com',
    'aws-0-eu-west-1.pooler.supabase.com',
    'aws-0-eu-west-2.pooler.supabase.com',
    'aws-0-eu-west-3.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-us-west-1.pooler.supabase.com'
];

(async () => {
    let connected = false;
    for (const host of poolerHosts) {
        console.log('Trying', host);
        const pool = new Pool({
            connectionString: `postgresql://postgres.laxibyijwcccwhyioric:%40Bust%40n_Store-Tech%40@${host}:6543/postgres`,
            ssl: { rejectUnauthorized: false }
        });
        try {
            const res = await pool.query('SELECT NOW()');
            console.log('SUCCESS with', host, res.rows);
            connected = true;
            break; // found the right host
        } catch (err) {
            console.error(host, err.message);
        }
        await pool.end();
    }
    
    // Also try direct IPv6
    if (!connected) {
        console.log("Trying direct IPv6 without pooler");
        const pool2 = new Pool({
            host: '2a05:d018:135e:1608:4c69:3993:7600:d2ac',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: '@Bust@n_Store-Tech@',
            ssl: { rejectUnauthorized: false }
        });
        try {
            const res = await pool2.query('SELECT NOW()');
            console.log('SUCCESS direct IPv6', res.rows);
            connected = true;
        } catch (err) {
            console.error('IPv6 failed', err.message);
        }
        await pool2.end();
    }

    process.exit(connected ? 0 : 1);
})();
