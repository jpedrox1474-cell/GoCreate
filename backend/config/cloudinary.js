// Configuração do Cloudinary — usado para upload de imagens, vídeos e documentos
// que o usuário anexa no chat (ex: um logo para o projeto sendo gerado).

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
