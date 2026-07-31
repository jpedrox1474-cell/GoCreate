// Rota POST /api/upload (+ assinatura para upload direto)
//
// Preferência: frontend sobe direto ao Cloudinary com assinatura (evita
// "Unexpected end of form" no proxy Hosting → Cloud Function).
// Fallback: POST /api/upload com multipart (útil em localhost).

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import cloudinary from '../config/cloudinary.js';

const router = Router();

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const FOLDER = 'gocreate/uploads';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function detectResourceType(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'video'; // Cloudinary trata áudio como video
  return 'raw';
}

function uploadBufferToCloudinary(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType === 'raw' ? 'raw' : 'auto',
        folder: FOLDER,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

function mapCloudinaryError(err) {
  const msg = String(err?.message || err || '');
  if (/Invalid api_key|Must supply api_key|unknown api_key/i.test(msg)) {
    return 'Cloudinary não configurado no servidor (credenciais em falta).';
  }
  if (/File size too large|maximum is/i.test(msg)) {
    return 'Arquivo demasiado grande para o Cloudinary.';
  }
  if (/Timeout|ETIMEDOUT|ECONNRESET/i.test(msg)) {
    return 'Timeout ao enviar para o Cloudinary. Tenta um ficheiro mais pequeno.';
  }
  return msg || 'Falha ao fazer upload do arquivo.';
}

/**
 * GET/POST /api/upload/sign
 * Devolve assinatura para upload direto no browser → Cloudinary (resource_type auto).
 * Freemium: só exige auth (sem Pro).
 */
router.post('/sign', requireAuth, (req, res) => {
  try {
    if (!cloudinaryConfigured()) {
      return res.status(503).json({
        error: 'Cloudinary não configurado no servidor.',
        code: 'CLOUDINARY_NOT_CONFIGURED',
      });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = FOLDER;
    // Params assinados devem coincidir exactamente com o FormData do cliente
    // (exceto file, api_key, resource_type, cloud_name).
    const paramsToSign = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      maxBytes: MAX_BYTES,
    });
  } catch (err) {
    console.error('[api/upload/sign]', err);
    res.status(500).json({ error: 'Falha ao gerar assinatura de upload.' });
  }
});

/**
 * POST /api/upload — multipart via servidor (fallback / localhost).
 */
router.post('/', requireAuth, (req, res) => {
  if (!cloudinaryConfigured()) {
    return res.status(503).json({
      error: 'Cloudinary não configurado no servidor.',
      code: 'CLOUDINARY_NOT_CONFIGURED',
    });
  }

  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'Arquivo demasiado grande (máx. 25MB).',
          code: 'FILE_TOO_LARGE',
        });
      }
      console.error('[api/upload] multer:', err);
      return res.status(400).json({
        error: 'Falha ao ler o ficheiro enviado. Tenta novamente.',
        code: 'MULTIPART_ERROR',
      });
    }
    if (err) {
      // Ex.: "Unexpected end of form" no proxy Hosting → Function
      console.error('[api/upload] form:', err);
      return res.status(400).json({
        error:
          'Upload incompleto pelo proxy. Recarrega a página — o cliente usa upload direto ao Cloudinary.',
        code: 'MULTIPART_INCOMPLETE',
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Nenhum arquivo enviado (campo "file" ausente).',
          code: 'NO_FILE',
        });
      }

      const resourceType = detectResourceType(req.file.mimetype);
      const result = await uploadBufferToCloudinary(req.file.buffer, resourceType);

      res.json({
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type || resourceType,
        originalName: req.file.originalname,
        bytes: result.bytes,
        mimeType: req.file.mimetype || null,
      });
    } catch (uploadErr) {
      console.error('[api/upload] Cloudinary:', uploadErr);
      res.status(500).json({
        error: mapCloudinaryError(uploadErr),
        code: 'CLOUDINARY_UPLOAD_FAILED',
      });
    }
  });
});

export default router;
