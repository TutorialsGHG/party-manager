import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';

let cachedPrivateKey: crypto.KeyObject | null = null;
let cachedPublicKeyPem: string | null = null;

function ensureKeysDir() {
  if (!fs.existsSync(config.keysDir)) {
    fs.mkdirSync(config.keysDir, { recursive: true });
  }
}

function derivePassphraseKey(passphrase: string, salt: Buffer): Buffer {
  // Derive 256-bit AES key using scrypt (standard OpenSSL primitive)
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function initMasterKeys(): { publicKeyPem: string; hasPassphrase: boolean } {
  ensureKeysDir();

  const pubKeyPath = path.join(config.keysDir, 'master_pub.pem');
  const encPrivKeyPath = path.join(config.keysDir, 'master_priv.pem.enc');
  const unencPrivKeyPath = path.join(config.keysDir, 'master_priv.pem');

  if (cachedPrivateKey && cachedPublicKeyPem) {
    return { publicKeyPem: cachedPublicKeyPem, hasPassphrase: !!config.passphrase };
  }

  // 1. Check if keys already exist
  if (fs.existsSync(pubKeyPath) && (fs.existsSync(encPrivKeyPath) || fs.existsSync(unencPrivKeyPath))) {
    const pubPem = fs.readFileSync(pubKeyPath, 'utf8');
    cachedPublicKeyPem = pubPem;

    if (fs.existsSync(encPrivKeyPath)) {
      if (!config.passphrase) {
        throw new Error('Master private key is encrypted, but ENCRYPTION_PASSPHRASE is not set in environment!');
      }
      const fileData = fs.readFileSync(encPrivKeyPath);
      // Format: [16B salt][12B iv][16B authTag][ciphertext]
      const salt = fileData.subarray(0, 16);
      const iv = fileData.subarray(16, 28);
      const tag = fileData.subarray(28, 44);
      const ciphertext = fileData.subarray(44);

      const key = derivePassphraseKey(config.passphrase, salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const privPem = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

      cachedPrivateKey = crypto.createPrivateKey(privPem);
      return { publicKeyPem: pubPem, hasPassphrase: true };
    } else {
      if (config.passphrase) {
        console.warn('WARN: Unencrypted private key found but passphrase was provided. Consider encrypting.');
      }
      const privPem = fs.readFileSync(unencPrivKeyPath, 'utf8');
      cachedPrivateKey = crypto.createPrivateKey(privPem);
      return { publicKeyPem: pubPem, hasPassphrase: false };
    }
  }

  // 2. Generate new RSA-4096 key pair
  console.log('Generating fresh RSA-4096 Master Key Pair...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(pubKeyPath, publicKey, { mode: 0o644 });

  if (config.passphrase) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = derivePassphraseKey(config.passphrase, salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(privateKey, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();

    const output = Buffer.concat([salt, iv, tag, encrypted]);
    fs.writeFileSync(encPrivKeyPath, output, { mode: 0o600 });
  } else {
    console.warn('⚠️ WARNING: ENCRYPTION_PASSPHRASE not set. Master private key saved unencrypted (reduced protection).');
    fs.writeFileSync(unencPrivKeyPath, privateKey, { mode: 0o600 });
  }

  cachedPublicKeyPem = publicKey;
  cachedPrivateKey = crypto.createPrivateKey(privateKey);

  return { publicKeyPem: publicKey, hasPassphrase: !!config.passphrase };
}

export function getMasterPublicKey(): string {
  if (!cachedPublicKeyPem) {
    initMasterKeys();
  }
  return cachedPublicKeyPem!;
}

export function decryptWithMasterKey(encryptedData: Buffer): Buffer {
  if (!cachedPrivateKey) {
    initMasterKeys();
  }
  return crypto.privateDecrypt(
    {
      key: cachedPrivateKey!,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    encryptedData
  );
}

export function encryptWithMasterPublicKey(data: Buffer): Buffer {
  const pubKey = getMasterPublicKey();
  return crypto.publicEncrypt(
    {
      key: pubKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    data
  );
}