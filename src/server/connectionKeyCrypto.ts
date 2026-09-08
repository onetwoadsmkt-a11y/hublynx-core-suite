// Server-only — nunca importar no browser.
// Criptografia AES-256-GCM para senhas de contas IMAP/SMTP.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENV_KEY = "MAIL_PASSWORD_ENCRYPTION_KEY";

function key(): Buffer {
  const raw = process.env[ENV_KEY];
  if (!raw) throw new Error(`${ENV_KEY} is not set`);
  return Buffer.from(raw, "base64");
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
