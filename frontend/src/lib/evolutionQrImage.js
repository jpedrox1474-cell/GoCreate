/** Converte payload QR WhatsApp (base64 ou string) em src de <img>. */
const QR_API = 'https://api.qrserver.com/v1/create-qr-code';

export function evolutionQrToImageSrc(code) {
  const raw = String(code || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image')) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 100) {
    return `data:image/png;base64,${raw}`;
  }
  return `${QR_API}?data=${encodeURIComponent(raw)}&size=280x280`;
}

export default evolutionQrToImageSrc;
