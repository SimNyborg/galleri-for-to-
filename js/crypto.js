// Dekryptering i browseren. Svarer til tools/gallery.py:
// PBKDF2-SHA256 -> AES-256-GCM, filformat = 12 bytes IV + ciphertext + tag.

export function normalize(code) {
  return String(code).trim().toLowerCase().replace(/[\s_\-]+/g, '_');
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function loadMeta() {
  const res = await fetch('assets/enc/meta.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('meta.json mangler');
  return res.json();
}

export async function deriveKey(code, meta) {
  if (!globalThis.crypto?.subtle) throw new Error('Browseren understøtter ikke kryptering (kræver https).');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalize(code)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(meta.salt), iterations: meta.iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

export async function decryptBytes(key, buf) {
  const bytes = new Uint8Array(buf);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  return new Uint8Array(plain);
}

export async function fetchDecrypted(key, name) {
  const res = await fetch('assets/enc/' + name);
  if (!res.ok) throw new Error('Kunne ikke hente ' + name);
  return decryptBytes(key, await res.arrayBuffer());
}

// Returnerer manifestet, eller null hvis koden er forkert.
export async function openManifest(key) {
  const res = await fetch('assets/enc/manifest.bin', { cache: 'no-cache' });
  if (!res.ok) throw new Error('manifest mangler');
  const buf = await res.arrayBuffer();
  try {
    const plain = await decryptBytes(key, buf);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export async function blobUrl(key, name, type) {
  const bytes = await fetchDecrypted(key, name);
  return URL.createObjectURL(new Blob([bytes], { type }));
}
