// RFC4122-ish v4 UUID via Math.random(). Good enough for a client-side
// idempotency key (uniqueness across a single device's local records) — not
// intended for anything security-sensitive.
export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
