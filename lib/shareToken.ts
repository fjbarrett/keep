import { randomBytes } from "crypto";

// Share links are bearer credentials. 128 bits, rendered as 32 hex chars so
// /p/<token> reads like /note/<id>; existing base64url tokens still resolve.
export function newShareToken() {
  return randomBytes(16).toString("hex");
}
