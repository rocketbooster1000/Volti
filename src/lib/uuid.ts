const HEX = "0123456789abcdef";

function hex(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return text;
}

function uuidFromRandomValues(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = hex(bytes);
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // A secure-context-only implementation can throw on plain HTTP.
    }
  }
  return uuidFromRandomValues();
}
