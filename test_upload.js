const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 1, full_name: 'Admin', role: 'admin' }, process.env.JWT_SECRET || 'BoustaneTech_Ultra_Secret_2024_Security_Key');
const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

let body = '';
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="name"\r\n\r\n';
body += 'Test Product\r\n';
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="base_price"\r\n\r\n';
body += '100\r\n';
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="image"; filename="dummy.png"\r\n';
body += 'Content-Type: image/png\r\n\r\n';
body += 'dummyimagebinarydata\r\n';
body += '--' + boundary + '--\r\n';

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/products',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${token}`
  }
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data));
});
req.on('error', e => console.log('REQ ERR:', e));
req.write(body);
req.end();
