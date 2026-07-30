// Rota POST /api/upload
//
// Recebe um arquivo (imagem, vídeo ou documento) via multipart/form-data,
// envia para o Cloudinary e devolve a URL pública. Essa URL é usada pelo
// frontend para: (1) mostrar uma prévia do anexo no chat e (2) mandar junto
// da próxima chamada a /api/chat, para a IA usar no código gerado.

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import cloudinary from '../config/cloudinary.js';

const router = Router();

// Mantém o arquivo em memória (buffer) — não precisamos gravar em disco,
// já que ele vai direto pro Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

function uploadBufferToCloudinary(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType, // 'image' | 'video' | 'raw' (docs)
        folder: 'gocreate/uploads',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

function detectResourceType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw'; // PDFs, docs, etc.
}

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado (campo "file" ausente).' });
    }

    const resourceType = detectResourceType(req.file.mimetype);
    const result = await uploadBufferToCloudinary(req.file.buffer, resourceType);

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType,
      originalName: req.file.originalname,
      bytes: result.bytes,
    });
  } catch (err) {
    console.error('[api/upload] Erro ao subir arquivo:', err);
    res.status(500).json({ error: 'Falha ao fazer upload do arquivo.' });
  }
});

export default router;
