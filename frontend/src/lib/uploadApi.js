// Upload de anexos do chat — preferência: assinatura → Cloudinary directo
// (evita "Unexpected end of form" no rewrite Hosting → gocreateApi).
// Fallback: POST /api/upload multipart.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const MAX_BYTES = 25 * 1024 * 1024;

function detectResourceType(mimetype = '', cloudinaryType) {
  if (cloudinaryType === 'image' || cloudinaryType === 'video' || cloudinaryType === 'raw') {
    return cloudinaryType;
  }
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) return 'video';
  return 'raw';
}

function mapUploadError(status, data, fallback) {
  const code = data?.code;
  const msg = data?.error || data?.message;
  if (code === 'CLOUDINARY_NOT_CONFIGURED' || status === 503) {
    return 'Upload indisponível: Cloudinary não configurado no servidor.';
  }
  if (code === 'FILE_TOO_LARGE' || status === 413) {
    return 'Arquivo demasiado grande (máx. 25MB).';
  }
  if (status === 401) {
    return 'Sessão expirada. Entra novamente para anexar ficheiros.';
  }
  if (status === 403) {
    return msg || 'Sem permissão para fazer upload.';
  }
  return msg || fallback || `Upload falhou (HTTP ${status})`;
}

async function fetchSignature(idToken, signal) {
  const res = await fetch(`${API_URL}/api/upload/sign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new Error(mapUploadError(res.status, data, 'Falha ao preparar upload.'));
  }

  return data;
}

/**
 * Upload directo ao Cloudinary com assinatura do backend (resource_type=auto).
 */
async function uploadDirectToCloudinary({ file, sign, signal }) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sign.apiKey);
  form.append('timestamp', String(sign.timestamp));
  form.append('signature', sign.signature);
  form.append('folder', sign.folder);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(sign.cloudName)}/auto/upload`;
  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const errMsg =
      data?.error?.message ||
      data?.error ||
      `Cloudinary recusou o ficheiro (HTTP ${res.status})`;
    throw new Error(String(errMsg));
  }

  return {
    url: data.secure_url || data.url,
    publicId: data.public_id,
    resourceType: detectResourceType(file.type, data.resource_type),
    originalName: file.name,
    bytes: data.bytes ?? file.size,
    mimeType: file.type || null,
  };
}

/**
 * Fallback: multipart via /api/upload (localhost / se sign falhar).
 */
async function uploadViaBackend({ file, idToken, signal }) {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: form,
    signal,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new Error(mapUploadError(res.status, data, `Upload falhou (HTTP ${res.status})`));
  }

  return {
    url: data.url,
    publicId: data.publicId,
    resourceType: detectResourceType(file.type, data.resourceType),
    originalName: data.originalName || file.name,
    bytes: data.bytes ?? file.size,
    mimeType: data.mimeType || file.type || null,
  };
}

/**
 * @param {{ file: File, idToken: string, signal?: AbortSignal }} opts
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, originalName: string, bytes: number, mimeType?: string|null }>}
 */
export async function uploadFile({ file, idToken, signal }) {
  if (!file) {
    throw new Error('Nenhum ficheiro seleccionado.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Arquivo demasiado grande (máx. 25MB).');
  }

  // 1) Preferência: upload directo ao Cloudinary (freemium, sem Pro)
  try {
    const sign = await fetchSignature(idToken, signal);
    return await uploadDirectToCloudinary({ file, sign, signal });
  } catch (directErr) {
    // Se a assinatura/Cloudinary falhar por rede, tenta o proxy do backend
    console.warn('[uploadApi] directo falhou, a tentar /api/upload:', directErr?.message);
    try {
      return await uploadViaBackend({ file, idToken, signal });
    } catch (backendErr) {
      // Preferir mensagem do caminho directo se o backend só ecoar multipart quebrado
      const msg = backendErr?.message || directErr?.message || 'Falha no upload.';
      throw new Error(msg);
    }
  }
}

export default uploadFile;
