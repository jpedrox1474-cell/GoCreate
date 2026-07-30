// Cliente POST /api/upload (Multer → Cloudinary). Auth Bearer obrigatório.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * @param {{ file: File, idToken: string, signal?: AbortSignal }} opts
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, originalName: string, bytes: number }>}
 */
export async function uploadFile({ file, idToken, signal }) {
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
    throw new Error(data?.error || `Upload falhou (HTTP ${res.status})`);
  }

  return data;
}

export default uploadFile;
