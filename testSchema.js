const db = require('./config/db');
require('dotenv').config();

db.query(`
  SELECT column_name, is_nullable, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'products'
`).then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
