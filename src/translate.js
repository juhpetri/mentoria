// Live PT->EN translation, used on the unknown/fallback path and for every
// interim homily chunk. Prefers the browser's on-device Translator API (no
// network call, no rate limit — matters a lot given the volume: ~40min of
// continuous homily per Mass, 4 Masses/week chunked every 6 words easily
// exceeds MyMemory's free daily quota). Falls back to MyMemory when the
// native API is unavailable/unsupported. Never throws — degrades
// gracefully on failure. (R4, R9)
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const SOURCE_LANG = 'pt';
const TARGET_LANG = 'en';

let nativeTranslator = null; // cached Translator instance once ready
let nativeTranslatorPromise = null; // in-flight setup, so callers share it

async function setupNativeTranslator() {
  try {
    if (typeof Translator === 'undefined') return null; // unsupported browser
    const availability = await Translator.availability({
      sourceLanguage: SOURCE_LANG,
      targetLanguage: TARGET_LANG,
    });
    if (availability === 'unavailable') return null;
    // 'downloadable'/'downloading' still resolves once the language pack is
    // ready; create() awaits that. Doing this at startup (via warmUpTranslator)
    // keeps the download off the critical path of the first live segment.
    return await Translator.create({ sourceLanguage: SOURCE_LANG, targetLanguage: TARGET_LANG });
  } catch (err) {
    console.warn('[translate] native Translator API unavailable, will use MyMemory', err);
    return null;
  }
}

function getNativeTranslator() {
  if (!nativeTranslatorPromise) {
    nativeTranslatorPromise = setupNativeTranslator().then((t) => {
      nativeTranslator = t;
      return t;
    });
  }
  return nativeTranslatorPromise;
}

// Call once at app startup so any on-device language-pack download happens
// before Mass starts, not on the first live translation of the homily.
export async function warmUpTranslator() {
  await getNativeTranslator();
}

async function translateWithMyMemory(text) {
  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${SOURCE_LANG}|${TARGET_LANG}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[translate] MyMemory HTTP error', res.status);
      return null;
    }
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) {
      console.warn('[translate] MyMemory empty response', data);
      return null;
    }
    return translated;
  } catch (err) {
    console.warn('[translate] MyMemory failed, skipping segment', err);
    return null;
  }
}

export async function translatePtToEn(text) {
  const translator = nativeTranslator ?? (await getNativeTranslator());
  if (translator) {
    try {
      return await translator.translate(text);
    } catch (err) {
      console.warn('[translate] native translation failed, falling back to MyMemory', err);
      // fall through to MyMemory below
    }
  }
  return translateWithMyMemory(text);
}
