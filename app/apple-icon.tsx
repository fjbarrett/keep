import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <svg width="180" height="180" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#2563eb" />
      <rect x="20" y="19" width="24" height="26" rx="2" stroke="#fff" strokeWidth="3" fill="none" />
      <rect x="30" y="19" width="14" height="9" rx="1" fill="#fff" />
      <rect x="22" y="31" width="20" height="12" rx="1" stroke="#fff" strokeWidth="2.5" fill="none" />
    </svg>, size,
  );
}
