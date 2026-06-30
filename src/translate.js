// Live PT->EN translation via MyMemory, used only on the unknown/fallback
// path. Never throws — degrades gracefully on failure/rate-limit. (R4, R9)
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

export async function translatePtToEn(text) {
  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=pt|en`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[translate] HTTP error', res.status);
      return null;
    }
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) {
      console.warn('[translate] empty response', data);
      return null;
    }
    return translated;
  } catch (err) {
    console.warn('[translate] failed, skipping segment', err);
    return null;
  }
}
