import crypto from 'crypto';

/**
 * Decrypt PulsePoint webapp AES-CBC payloads (community-documented key derivation).
 * @param {{ ct: string, iv: string, s: string }} payload
 */
export function decryptPulsePointPayload(payload) {
  const ct = Buffer.from(payload.ct, 'base64');
  const iv = Buffer.from(payload.iv, 'hex');
  const salt = Buffer.from(payload.s, 'hex');
  const e = 'CommonIncidents';
  const password = e[13] + e[1] + e[2] + 'brady' + '5' + 'r' + e.toLowerCase()[6] + e[5] + 'gs';

  let key = Buffer.alloc(0);
  let block = null;
  while (key.length < 32) {
    const hasher = crypto.createHash('md5');
    if (block) hasher.update(block);
    hasher.update(password);
    hasher.update(salt);
    block = hasher.digest();
    key = Buffer.concat([key, block]);
  }
  key = key.subarray(0, 32);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  const jsonText = decrypted.slice(1, decrypted.lastIndexOf('"')).replace(/\\"/g, '"');
  return JSON.parse(jsonText);
}
