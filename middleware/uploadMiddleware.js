const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// 1. Configuration de Cloudinary avec vos identifiants
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configuration du moteur de stockage Multer pour rediriger vers Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // On vérifie dynamiquement s'il s'agit d'une vidéo ou d'une image
    const isVideo = file.mimetype.includes('video');

    if (isVideo) {
      return {
        folder: 'bustantech_store',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'webm']
      };
    } else {
      return {
        folder: 'bustantech_store',
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
      };
    }
  }
});

// 3. Exportation du middleware configuré
const upload = multer({ storage: storage });

module.exports = upload;