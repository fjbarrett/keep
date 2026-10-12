import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const nativeCodeHash = (value: string) => createHash("sha256").update(value).digest("base64url");
function key() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for native sign-in");
  return createHash("sha256").update("keep-native-cookie\0" + process.env.AUTH_SECRET).digest();
}
export function sealNativeCookie(value: string, name: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(name));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function openNativeCookie(value: string, name: string) {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(name));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
}
