// Lowercase + strip accents/punctuation to a comparable matching form. (R3, R36)
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accent marks
    .replace(/[^a-z0-9\s]/g, ' ')    // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}
