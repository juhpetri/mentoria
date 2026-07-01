// Loads catalog.ordinary + catalog.missal JSON files into one flat, sorted
// list for matching. (R2, R30, R38)
import { normalize } from './normalize.js';
//
// Coleta and Pós-Comunhão are NOT here — those are day-specific and now
// sourced live from the Liturgia API (see liturgyApi.js, R39a/R39f), not
// transcribed from the Missal PDF. Files listed here that don't exist yet
// (the remaining Missal catalogs are still pending transcription) are
// skipped silently — the app runs fine with a partial catalog.
const CATALOG_FILES = [
  { path: 'data/ordinary.json', source: 'ordinary' },
  { path: 'data/missal/credo.json', source: 'missal:credo' },
  { path: 'data/missal/prefacio.json', source: 'missal:prefacio' },
  { path: 'data/missal/oracao-eucaristica.json', source: 'missal:oracao-eucaristica' },
  { path: 'data/missal/rito-comunhao.json', source: 'missal:rito-comunhao' },
];

async function loadOneCatalog({ path, source }) {
  try {
    const res = await fetch(path);
    if (!res.ok) return [];
    const data = await res.json();
    return Object.values(data).map((entry) => ({
      id: entry.id,
      keywords: entry.keywords ?? [],
      pt: entry.pt,
      ptNorm: entry.pt ? normalize(entry.pt) : null,
      en: entry.textEn ?? entry.en,
      source,
    }));
  } catch {
    return []; // file missing or unreadable — skip, not fatal
  }
}

export async function loadCatalog() {
  const lists = await Promise.all(CATALOG_FILES.map(loadOneCatalog));
  const entries = lists.flat();
  // Longest-keyword-match priority (design.md 6.5): sort entries by their
  // longest keyword, descending, so e.g. "misterio da fe e do amor" is
  // checked before the shorter "misterio da fe".
  entries.sort((a, b) => {
    const maxLenA = Math.max(0, ...a.keywords.map((k) => k.length));
    const maxLenB = Math.max(0, ...b.keywords.map((k) => k.length));
    return maxLenB - maxLenA;
  });
  return entries;
}

// Finds the first (highest-priority) catalog entry whose keyword appears
// in the normalized live segment. (R3)
export function matchCatalog(entries, normalizedText) {
  for (const entry of entries) {
    if (entry.keywords.some((kw) => normalizedText.includes(kw))) {
      return entry;
    }
  }
  return null;
}

// True if `normalizedText` is consistent with being the still-incomplete
// start of some catalog entry's full Portuguese text — i.e. everything
// recognized so far exactly matches that entry's opening. Used to hold off
// live-translating a fragment (e.g. "deus pai todo pode" before the STT
// engine finishes recognizing "poderoso") while it might still resolve
// into a known/fixed prayer a moment later. (R2, R3)
export function isPossibleCatalogPrefix(entries, normalizedText) {
  if (!normalizedText) return false;
  return entries.some((entry) => entry.ptNorm && entry.ptNorm.startsWith(normalizedText));
}
