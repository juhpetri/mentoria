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
// Registering an email with MyMemory raises the free daily quota from
// 5,000 to 50,000 words/day (per MyMemory's own docs) — matters a lot on
// a device where the native Translator API isn't available, since every
// live-translation call then goes through MyMemory.
const MYMEMORY_EMAIL = 'juliana.a.petri@gmail.com';
// MyMemory also rate-limits *bursts* (HTTP 429), independent of the daily
// quota — punctuation-triggered flushing can fire several short requests
// within the same second. Space consecutive requests out and retry once
// on 429 instead of dropping the segment outright.
const MYMEMORY_MIN_GAP_MS = 400;
const MYMEMORY_RETRY_DELAY_MS = 1200;

let lastMyMemoryRequestAt = 0;
let myMemoryQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serializes MyMemory calls so concurrent flushes (multiple segments
// pausing around the same time) can't burst past the rate limit together.
function throttleMyMemory(fn) {
  const run = async () => {
    const wait = MYMEMORY_MIN_GAP_MS - (Date.now() - lastMyMemoryRequestAt);
    if (wait > 0) await sleep(wait);
    lastMyMemoryRequestAt = Date.now();
    return fn();
  };
  const result = myMemoryQueue.then(run, run);
  // Keep the queue alive even if this call fails, so later calls aren't
  // stuck behind a rejected promise.
  myMemoryQueue = result.catch(() => {});
  return result;
}
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

// Returns { text: null, reason: string } on failure so callers can surface
// *why* nothing was spoken (network error, HTTP status, empty response,
// etc.) in the debug transcript instead of a bare "translation failed".
async function fetchMyMemory(text) {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${SOURCE_LANG}|${TARGET_LANG}&de=${encodeURIComponent(MYMEMORY_EMAIL)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { text: null, reason: `MyMemory HTTP ${res.status}`, status: res.status };
  }
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) {
    return { text: null, reason: `MyMemory empty response (${data?.responseStatus ?? 'unknown status'})`, status: null };
  }
  return { text: translated, reason: null, status: null };
}

async function translateWithMyMemory(text) {
  try {
    return await throttleMyMemory(async () => {
      const first = await fetchMyMemory(text);
      if (first.text || first.status !== 429) return first;
      // Rate-limited -> back off once and retry rather than dropping the
      // segment (which would otherwise go untranslated during the Mass).
      console.warn('[translate] MyMemory 429, retrying once after backoff');
      await sleep(MYMEMORY_RETRY_DELAY_MS);
      return fetchMyMemory(text);
    });
  } catch (err) {
    const reason = `MyMemory request failed: ${err?.message ?? err}`;
    console.warn('[translate]', reason, err);
    return { text: null, reason };
  }
}

// Resolves to { text: string, reason: null } on success, or
// { text: null, reason: string } describing why nothing could be spoken.
export async function translatePtToEn(text) {
  const translator = nativeTranslator ?? (await getNativeTranslator());
  if (translator) {
    try {
      const result = await withTimeout(translator.translate(text), NATIVE_SETUP_TIMEOUT_MS);
      if (result) return { text: result, reason: null };
      console.warn('[translate] native translation timed out, falling back to MyMemory');
    } catch (err) {
      console.warn('[translate] native translation failed, falling back to MyMemory', err);
      // fall through to MyMemory below
    }
  }
  return translateWithMyMemory(text);
}
