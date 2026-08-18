// Utilidad de firma y validación de tokens de sesión para el panel admin

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fhl_default_secret_key_change_me';
const COOKIE_NAME = 'fhl_admin_session';

async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(ADMIN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function firmarToken(payload: { user: string; timestamp: number }): Promise<string> {
  const enc = new TextEncoder();
  const dataStr = JSON.stringify(payload);
  const dataBytes = enc.encode(dataStr);
  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign('HMAC', key, dataBytes);
  
  const b64Data = Buffer.from(dataBytes).toString('base64url');
  const b64Sig = Buffer.from(signature).toString('base64url');
  return `${b64Data}.${b64Sig}`;
}

export async function verificarToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [b64Data, b64Sig] = parts;
    const dataBytes = Buffer.from(b64Data, 'base64url');
    const signatureBytes = Buffer.from(b64Sig, 'base64url');
    const key = await getCryptoKey();

    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(dataBytes));
    // Validez de sesión: 30 días
    const ahora = Date.now();
    if (ahora - payload.timestamp > 30 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
