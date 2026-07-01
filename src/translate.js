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
// Guards against Translator.create() hanging (e.g. stuck waiting on a
// language-pack download or a permission prompt that never resolves) —
// without this, a stuck native setup would silently block the MyMemory
// fallback forever too, since translatePtToEn awaits the same promise.
const NATIVE_SETUP_TIMEOUT_MS = 4000;

let nativeTranslator = null; // cached Translator instance once ready
let nativeTranslatorPromise = null; // in-flight setup, so callers share it

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function setupNativeTranslator() {
  try {
    if (typeof Translator === 'undefined') {
      console.info('[translate] no native Translator API in this browser, using MyMemory');
      return null;
    }
    const availability = await withTimeout(
      Translator.availability({ sourceLanguage: SOURCE_LANG, targetLanguage: TARGET_LANG }),
      NATIVE_SETUP_TIMEOUT_MS,
    );
    if (!availability || availability === 'unavailable') return null;
    // 'downloadable'/'downloading' still resolves once the language pack is
    // ready; create() awaits that. Doing this at startup (via warmUpTranslator)
    // keeps the download off the critical path of the first live segment —
    // but cap the wait so a slow/stuck download can't block indefinitely.
    const translator = await withTimeout(
      Translator.create({ sourceLanguage: SOURCE_LANG, targetLanguage: TARGET_LANG }),
      NATIVE_SETUP_TIMEOUT_MS,
    );
    if (!translator) {
      console.warn('[translate] native Translator setup timed out, using MyMemory');
    }
    return translator;
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
      const result = await withTimeout(translator.translate(text), NATIVE_SETUP_TIMEOUT_MS);
      if (result) return result;
      console.warn('[translate] native translation timed out, falling back to MyMemory');
    } catch (err) {
      console.warn('[translate] native translation failed, falling back to MyMemory', err);
      // fall through to MyMemory below
    }
  }
  return translateWithMyMemory(text);
}
