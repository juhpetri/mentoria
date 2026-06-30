// Fetch + cache the day's readings/psalm/Gospel from Liturgia API v3.
// (R35, R37) Verify-before-trust matching, fail-open to live translation
// if nothing matches. (R36)
import { normalize } from './normalize.js';
import { translatePtToEn } from './translate.js';

const BASE_URL = 'https://liturgia.up.railway.app/v3/';
const OPENING_WORDS_COUNT = 6;

function todayPath(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function openingWords(text, count = OPENING_WORDS_COUNT) {
  return normalize(text).split(' ').slice(0, count).join(' ');
}

// The exact field names of the Liturgia API v3 response are assumed from
// its README, not yet confirmed against a live call — if they differ,
// readings just end up empty and the app fails open to live translation
// (same as a 404), never crashes. Needs real-API verification (T8.2).
function extractReadings(celebration) {
  if (!celebration) return [];
  const readings = [];
  const leituras = celebration.leituras ?? {};

  if (leituras.primeiraLeitura?.texto) {
    readings.push({
      id: 'primeira-leitura',
      ptOpening: openingWords(leituras.primeiraLeitura.texto),
      ptFull: leituras.primeiraLeitura.texto,
      en: null,
      sung: false,
    });
  }
  if (leituras.salmo) {
    readings.push({ id: 'salmo', sung: true }); // sung -> stay quiet (R20)
  }
  if (leituras.segundaLeitura?.texto) {
    readings.push({
      id: 'segunda-leitura',
      ptOpening: openingWords(leituras.segundaLeitura.texto),
      ptFull: leituras.segundaLeitura.texto,
      en: null,
      sung: false,
    });
  }
  if (leituras.evangelho?.texto) {
    readings.push({
      id: 'evangelho',
      ptOpening: openingWords(leituras.evangelho.texto),
      ptFull: leituras.evangelho.texto,
      en: null,
      sung: false,
    });
  }
  return readings;
}

export function createLiturgyCache() {
  let readings = [];

  async function fetchToday() {
    try {
      const res = await fetch(`${BASE_URL}${todayPath()}`);
      if (!res.ok) {
        readings = []; // 404/error -> run fully live, no crash (R37)
        return;
      }
      const data = await res.json();
      const celebration = Array.isArray(data) ? data[0] : data;
      readings = extractReadings(celebration);
    } catch (err) {
      console.warn('[liturgyApi] startup fetch failed, running fully live', err);
      readings = [];
    }
  }

  // Binary found-or-not match against the live transcript's opening words.
  // No similarity scoring (R36).
  function matchReading(normalizedText) {
    for (const reading of readings) {
      if (reading.sung || !reading.ptOpening) continue;
      if (normalizedText.includes(reading.ptOpening) || reading.ptOpening.includes(normalizedText)) {
        return reading;
      }
    }
    return null;
  }

  // Lazy translate-on-first-match + cache (design note 6.1).
  async function getEnglishFor(reading) {
    if (reading.en) return reading.en;
    const translated = await translatePtToEn(reading.ptFull);
    if (translated) reading.en = translated;
    return translated;
  }

  return { fetchToday, matchReading, getEnglishFor };
}
