// Fetch + cache the day's readings/psalm/Gospel AND the day-specific Coleta,
// Oração sobre as Oferendas, and Oração Pós-Comunhão from Liturgia API v3 —
// no Missal-photo transcription needed for these, the API already supplies
// them per day. (R35, R37, R39a, R39e, R39f) Verify-before-trust matching,
// fail-open to live translation if nothing matches. (R36)
import { normalize } from './normalize.js';
import { translatePtToEn } from './translate.js';

const BASE_URL = 'https://liturgia.up.railway.app/v3/';
const OPENING_WORDS_COUNT = 6;

// The API has no structured liturgical-rank field; rank (Solenidade/Festa/
// Memória vs. an ordinary weekday) only shows up as free text inside the
// celebration's `liturgia` name, e.g. "Santíssimo Nome de Jesus. Memória
// Facultativa". This keyword check is a heuristic over that text.
const RANK_KEYWORDS = ['solenidade', 'festa', 'memoria'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function datePath(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function openingWords(text, count = OPENING_WORDS_COUNT) {
  return normalize(text).split(' ').slice(0, count).join(' ');
}

// On days with more than one celebration, only one has principal: true
// (the others are optional alternatives, e.g. an optional memorial).
function pickPrincipal(celebracoes) {
  if (!Array.isArray(celebracoes) || celebracoes.length === 0) return null;
  return celebracoes.find((c) => c.principal) ?? celebracoes[0];
}

function hasSpecialRank(celebration) {
  const name = normalize(celebration?.liturgia ?? '');
  return RANK_KEYWORDS.some((kw) => name.includes(kw));
}

function pushDayText(list, id, text) {
  if (!text) return;
  list.push({ id, ptOpening: openingWords(text), ptFull: text, ptFullNorm: normalize(text), en: null, sung: false });
}

// celebration.leituras is an ordered array of { tipo, rotulo, opcoes }; each
// reading's actual text lives in opcoes[0].texto (opcoes can hold more than
// one option for days with alternate readings — we only need the one
// actually proclaimed, so the first/default option is enough for R36).
// celebration.oracoes.{coleta,oferendas,comunhao} are added the same way
// (R39a/R39e/R39f).
function extractDayTexts(celebration) {
  if (!celebration) return [];
  const items = [];

  for (const item of celebration.leituras ?? []) {
    const opcao = item.opcoes?.[0];
    if (!opcao?.texto) continue;

    if (item.tipo === 'salmo') {
      items.push({ id: 'salmo', sung: true }); // sung -> stay quiet (R20)
      continue;
    }
    if (item.tipo === 'leitura') {
      const isSecond = normalize(item.rotulo ?? '').includes('segunda');
      pushDayText(items, isSecond ? 'segunda-leitura' : 'primeira-leitura', opcao.texto);
      continue;
    }
    if (item.tipo === 'evangelho') {
      pushDayText(items, 'evangelho', opcao.texto);
    }
    // 'extra' readings (alternate options) intentionally skipped — R36
    // only needs to identify what's actually proclaimed at this Mass.
  }

  pushDayText(items, 'coleta', celebration.oracoes?.coleta);
  pushDayText(items, 'oferendas', celebration.oracoes?.oferendas);
  pushDayText(items, 'pos-comunhao', celebration.oracoes?.comunhao);

  return items;
}

export function createLiturgyCache() {
  let dayTexts = [];

  async function fetchCelebration(date) {
    const res = await fetch(`${BASE_URL}${datePath(date)}`);
    if (!res.ok) return null; // 404/error -> caller decides fallback
    const data = await res.json();
    return pickPrincipal(data?.celebracoes);
  }

  // Saturday Vigil rule: this parish's Saturday Mass anticipates Sunday, so
  // a plain/ferial Saturday borrows Sunday's readings. A Saturday that is
  // itself a Solemnity/Feast/Memorial keeps its own day's readings instead.
  async function fetchToday() {
    try {
      const today = new Date();
      let celebration = await fetchCelebration(today);

      if (today.getDay() === 6 && (!celebration || !hasSpecialRank(celebration))) {
        celebration = await fetchCelebration(addDays(today, 1)); // Sunday
      }

      dayTexts = extractDayTexts(celebration);
    } catch (err) {
      console.warn('[liturgyApi] startup fetch failed, running fully live', err);
      dayTexts = [];
    }
  }

  // Binary found-or-not match against the live transcript's opening words.
  // No similarity scoring (R36). Covers readings, Coleta, Oferendas, and
  // Pós-Comunhão alike — they're all just { ptOpening, ptFull } entries here.
  function matchReading(normalizedText) {
    for (const item of dayTexts) {
      if (item.sung || !item.ptOpening) continue;
      if (normalizedText.includes(item.ptOpening) || item.ptOpening.includes(normalizedText)) {
        return item;
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

  // Mirrors catalogs.js's isPossibleCatalogPrefix: true if normalizedText
  // is consistent with being the still-incomplete start of a day-specific
  // reading, so live translation can hold off instead of speaking broken
  // fragments while the recognizer is still finishing the opening words.
  function isPossibleReadingPrefix(normalizedText) {
    if (!normalizedText) return false;
    return dayTexts.some((item) => !item.sung && item.ptFullNorm && item.ptFullNorm.startsWith(normalizedText));
  }

  return { fetchToday, matchReading, getEnglishFor, isPossibleReadingPrefix };
}
