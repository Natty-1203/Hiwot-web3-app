import crypto from 'crypto';

export function generateNullifier(biometricHash) {
  // SHA256 hash as nullifier placeholder
  return '0x' + crypto.createHash('sha256').update(biometricHash).digest('hex');
}
