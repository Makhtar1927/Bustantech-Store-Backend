const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, full_name: 'Admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
let body = '';

const addField = (name, value) => {
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
  body += `${value}\r\n`;
};

// Simulate Admin.jsx create product data
addField('name', 'Test Product');
addField('brand', 'Test Brand');
addField('category_id', 'tech'); // frontend sends slug apparently? 'tech'
addField('base_price', '5000');
addField('compare_at_price', '');
addField('variants', JSON.stringify([]));

body += `--${boundary}--\r\n`;

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/products',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
     console.log('HTTP', res.statusCode);
     console.log('RESPONSE:', data);
  });
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
