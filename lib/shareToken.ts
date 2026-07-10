import { randomBytes } from "crypto";

// Share links are bearer credentials. Use 128 bits so they remain unguessable
// even with many active links; existing shorter tokens continue to resolve.
export function newShareToken() {
  return randomBytes(16).toString("base64url");
}
