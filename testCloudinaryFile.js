const fs = require('fs');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
cloudinary.api.ping()
  .then(res => fs.writeFileSync('cloudinary_result.json', JSON.stringify({status: 'OK', data: res})))
  .catch(err => fs.writeFileSync('cloudinary_result.json', JSON.stringify({status: 'ERROR', error: err})));
