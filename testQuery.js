const db = require('./config/db');
require('dotenv').config();
const q = `SELECT o.*, COALESCE(json_agg(json_build_object('product_name', p.name, 'variant', pv.attribute_value, 'quantity', oi.quantity, 'unit_price', oi.unit_price)) FILTER (WHERE oi.id IS NOT NULL), '[]') as items FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id LEFT JOIN products p ON oi.product_id = p.id LEFT JOIN product_variants pv ON oi.variant_id = pv.id GROUP BY o.id ORDER BY o.created_at DESC`;
db.query(q)
.then(res => { console.log('SUCCESS', res.rows); process.exit(0); })
.catch(err => { require('fs').writeFileSync('dbErr.txt', String(err)); process.exit(1); });
