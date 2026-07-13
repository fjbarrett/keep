const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;

export type AllowedImageType = keyof typeof IMAGE_TYPES;

export function imageExtension(contentType: AllowedImageType): string {
  return IMAGE_TYPES[contentType];
}

export function isAllowedImageType(value: string): value is AllowedImageType {
  return value in IMAGE_TYPES;
}

export function hasValidImageSignature(bytes: Uint8Array, type: AllowedImageType): boolean {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value);
  }
  if (type === "image/gif") {
    if (bytes.length < 6) return false;
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
}
