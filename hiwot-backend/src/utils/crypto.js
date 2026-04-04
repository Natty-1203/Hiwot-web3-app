import crypto from 'crypto';

export function generateNullifier(biometricHash) {
  // For demo, we just hash the input. In reality, it's a cryptographic nullifier derived from biometric.
  return '0x' + crypto.createHash('sha256').update(biometricHash).digest('hex');
}
