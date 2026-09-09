import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

// VAPID uses a 65-byte uncompressed P-256 public key and a 32-byte private key,
// both encoded as URL-safe base64 without padding. Never commit generated output.
process.stdout.write(JSON.stringify({
  publicKey: ecdh.getPublicKey(undefined, 'uncompressed').toString('base64url'),
  privateKey: ecdh.getPrivateKey().toString('base64url'),
}));
