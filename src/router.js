// The brain: classify each finalized transcript segment and dispatch.
// Decision flow per design.md section 4. (R3, R4, R10, R36)
import { normalize } from './normalize.js';
import { matchCatalog, isPossibleCatalogPrefix } from './catalogs.js';
import { translatePtToEn } from './translate.js';

// How long the priest's speech has to go quiet (no new interim text for
// this segment) before we treat it as a pause and translate/speak
// whatever's accumulated since the last flush — mirrors how a human
// interpreter waits for a natural break rather than cutting mid-thought.
// Kept fairly generous (rather than reacting to every tiny gap) so noisy
// audio (background chatter, a second voice, a poor connection) doesn't
// fragment one sentence into several disjointed, sometimes-repeated
// translations — better to wait for a real pause than guess early.
const PAUSE_MS = 700;

// Safety net for a homily that runs on for a long stretch with no detected
// pause at all: force a flush after this many unflushed words so the
// worshipper isn't left waiting indefinitely for translation to start.
const MAX_UNFLUSHED_WORDS = 25;

// Never flush fewer than this many unflushed words, even on a detected
// pause/sentence-end — a 1-2 word fragment ("santo.", "vocês") is rarely
// translatable in isolation and is usually a sign of choppy/noisy
// recognition rather than an intentional short sentence.
const MIN_FLUSH_WORDS = 4;

// pt-BR SpeechRecognition punctuates its own hypothesis (periods, commas,
// colons) at natural clause/sentence breaks — a much more reliable pause
// signal than a fixed silence timeout, since real speech pauses (e.g.
// mid-liturgy) are often shorter than any timeout we could safely pick.
// When the *raw* (pre-normalize) hypothesis ends in one of these, flush
// immediately instead of waiting out the debounce (still subject to
// MIN_FLUSH_WORDS above).
const SENTENCE_END_RE = /[.!?:;]\s*$/;

// No API here (translation or otherwise) can detect "this is instrumental
// music" from audio — MyMemory/the native Translator only ever see text,
// never the audio itself. The only signal available is SpeechRecognition's
// own per-result confidence, and only on engines that actually fill it in
// (Chrome commonly reports 0 for every result, meaning "not provided" —
// that must NOT be treated as low confidence). When a real confidence value
// is present and very low, it's usually the engine guessing at gibberish
// over music/singing rather than transcribing real speech, so treat it as
// "not speech" and hold off instead of speaking a nonsense translation.
const LOW_CONFIDENCE_THRESHOLD = 0.3;

function isLikelyNonSpeech(confidence) {
  return typeof confidence === 'number' && confidence > 0 && confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function createRouter({ catalogEntries, liturgyCache, dedupGuard, speechQueue, onSegmentClassified }) {
  // SpeechRecognition's result list holds several independent segments at
  // once (it splits continuous speech on detected pauses), each identified
  // by a stable `segmentId` (event.resultIndex) until it finalizes. Per
  // segment we track: how many words have already been flushed
  // (translated/spoken), and the pending pause-detection timer.
  const flushedWordCountBySegment = new Map();
  const pauseTimerBySegment = new Map();
  // Segments whose *entire* content was already handled by an immediate
  // catalog/reading commit fired from an interim event (see below) — when
  // that segment eventually finalizes there's nothing left to do.
  const committedSegments = new Set();

  // A known text (Credo, a day-specific reading, etc.) gets its *entire*
  // pre-written English translation spoken all at once, the moment it's
  // recognized — never live-translated word by word. The priest keeps
  // reciting it out loud across several more STT segments (each new pause
  // starts a fresh segment with no keyword of its own), so while
  // `activeKnownTextNorm` is set, any segment whose text is still contained
  // in it is a continuation of the same known recitation and is silently
  // ignored — the app "goes back to listening" for what comes after the
  // known text only once the recitation actually moves past it.
  let activeKnownTextNorm = null;

  function isKnownContinuation(norm) {
    return !!activeKnownTextNorm && norm.length > 0 && activeKnownTextNorm.includes(norm);
  }

  function getFlushedCount(segmentId) {
    return flushedWordCountBySegment.get(segmentId) ?? 0;
  }

  function clearPauseTimer(segmentId) {
    const timer = pauseTimerBySegment.get(segmentId);
    if (timer) {
      clearTimeout(timer);
      pauseTimerBySegment.delete(segmentId);
    }
  }

  // Speaks a catalog entry's full pre-written translation immediately (used
  // from both interim and final paths) and locks in "known text" mode so
  // the rest of the recitation is silently skipped instead of live-
  // translated. (R2, R3)
  function commitCatalogHit(catalogHit, rawText, norm, segmentId) {
    speechQueue.speak(catalogHit.en);
    dedupGuard.remember(norm);
    if (catalogHit.pt) activeKnownTextNorm = normalize(catalogHit.pt);
    if (segmentId !== undefined) {
      committedSegments.add(segmentId);
      clearPauseTimer(segmentId);
    }
    onSegmentClassified?.({ rawText, norm, kind: 'catalog', entry: catalogHit });
  }

  // Same idea for a day-specific reading (R36).
  async function commitReadingHit(reading, rawText, norm, segmentId) {
    if (reading.sung) {
      dedupGuard.remember(norm);
      if (segmentId !== undefined) {
        committedSegments.add(segmentId);
        clearPauseTimer(segmentId);
      }
      onSegmentClassified?.({ rawText, norm, kind: 'sung-quiet' });
      return true; // psalm sung -> stay quiet (R20)
    }
    const en = await liturgyCache.getEnglishFor(reading);
    if (!en) return false; // translation failed -> let caller fall through to live path
    speechQueue.speak(en);
    dedupGuard.remember(norm);
    if (reading.ptFull) activeKnownTextNorm = normalize(reading.ptFull);
    if (segmentId !== undefined) {
      committedSegments.add(segmentId);
      clearPauseTimer(segmentId);
    }
    onSegmentClassified?.({ rawText, norm, kind: 'reading', reading });
    return true;
  }

  // Translates/speaks whatever new words this segment has accumulated
  // since its last flush, and advances its flushed-word cursor.
  async function flushSegment(segmentId, norm) {
    const words = norm.split(' ');
    const flushedCount = getFlushedCount(segmentId);
    if (words.length <= flushedCount) return;

    const chunkWords = words.slice(flushedCount);
    flushedWordCountBySegment.set(segmentId, words.length);
    const chunkText = chunkWords.join(' ');

    const { text: liveEn, reason } = await translatePtToEn(chunkText);
    if (liveEn) {
      speechQueue.speak(liveEn);
      onSegmentClassified?.({ rawText: chunkText, norm: chunkText, kind: 'live-translate-interim', en: liveEn });
    } else {
      onSegmentClassified?.({ rawText: chunkText, norm: chunkText, kind: 'translate-failed', reason });
    }
  }

  // Called on every interim (not-yet-final) STT result.
  //   1. If it's still building toward a known catalog/reading match, hold
  //      off entirely (no live translation of a fragment that might turn
  //      out to be the Credo, a reading, etc a moment later).
  //   2. The instant it *becomes* a confirmed match, commit it immediately
  //      (speak the correct pre-written translation) instead of waiting for
  //      the segment to finalize.
  //   3. Otherwise, debounce on PAUSE_MS of silence for this segment before
  //      translating what's accumulated so far — so long continuous speech
  //      (a homily) still gets spoken at natural breaks instead of staying
  //      silent until isFinal fires, but without chopping mid-sentence.
  async function handleInterim(rawText, segmentId, confidence) {
    try {
      const norm = normalize(rawText);
      if (!norm) return;

      if (isKnownContinuation(norm) || committedSegments.has(segmentId)) return;

      if (isLikelyNonSpeech(confidence)) {
        clearPauseTimer(segmentId);
        onSegmentClassified?.({ rawText, norm, kind: 'non-speech-skip', reason: `confidence ${confidence.toFixed(2)} — likely instrumental/non-speech audio` });
        return;
      }

      const catalogHit = matchCatalog(catalogEntries, norm);
      if (catalogHit) {
        commitCatalogHit(catalogHit, rawText, norm, segmentId);
        return;
      }

      const reading = liturgyCache?.matchReading(norm);
      if (reading) {
        clearPauseTimer(segmentId);
        const handled = await commitReadingHit(reading, rawText, norm, segmentId);
        if (handled) return;
        // translation failed -> fall through to normal live-translate flow
      }

      // Text so far is consistent with the *start* of a known catalog
      // entry or reading — wait for either a confirmed match above (next
      // interim event) or segment finalization, rather than risking a
      // broken live-translated fragment of what might be a fixed prayer.
      if (
        isPossibleCatalogPrefix(catalogEntries, norm) ||
        liturgyCache?.isPossibleReadingPrefix(norm)
      ) {
        clearPauseTimer(segmentId);
        return;
      }

      const words = norm.split(' ');
      clearPauseTimer(segmentId);

      const flushedCount = getFlushedCount(segmentId);
      const unflushedCount = words.length - flushedCount;
      if (unflushedCount >= MAX_UNFLUSHED_WORDS) {
        await flushSegment(segmentId, norm);
        return;
      }
      if (unflushedCount >= MIN_FLUSH_WORDS && SENTENCE_END_RE.test(rawText.trim())) {
        await flushSegment(segmentId, norm);
        return;
      }

      const timer = setTimeout(() => {
        pauseTimerBySegment.delete(segmentId);
        if (words.length - getFlushedCount(segmentId) < MIN_FLUSH_WORDS) return;
        flushSegment(segmentId, norm).catch((err) => {
          onSegmentClassified?.({ rawText, norm, kind: 'error', reason: `handleInterim (debounced flush): ${err?.message ?? err}` });
        });
      }, PAUSE_MS);
      pauseTimerBySegment.set(segmentId, timer);
    } catch (err) {
      onSegmentClassified?.({ rawText, norm: rawText, kind: 'error', reason: `handleInterim: ${err?.message ?? err}` });
    }
  }

  async function handleSegment(rawText, segmentId, confidence) {
    let norm;
    try {
      norm = normalize(rawText);
      if (!norm) return;

      clearPauseTimer(segmentId);
      const flushedCount = getFlushedCount(segmentId);
      flushedWordCountBySegment.delete(segmentId);

      // Nothing was already flushed for this segment and the engine itself
      // is unsure it heard real speech -> most likely instrumental
      // music/singing picked up as noise. Drop it silently rather than
      // speaking a garbled "translation" of gibberish text.
      if (flushedCount === 0 && isLikelyNonSpeech(confidence)) {
        committedSegments.delete(segmentId);
        onSegmentClassified?.({ rawText, norm, kind: 'non-speech-skip', reason: `confidence ${confidence.toFixed(2)} — likely instrumental/non-speech audio` });
        return;
      }

      // Already fully handled by an interim commit -> nothing left to do.
      if (committedSegments.has(segmentId)) {
        committedSegments.delete(segmentId);
        return;
      }

      // Still reciting a known text -> nothing new to say. Once the
      // segment's text stops matching (the recitation moved on), this
      // naturally returns false and normal routing below takes over,
      // including a fresh catalog/reading match -> the app is effectively
      // "listening again" for the next part of the Mass.
      if (isKnownContinuation(norm)) {
        dedupGuard.remember(norm);
        onSegmentClassified?.({ rawText, norm, kind: 'catalog-continuation' });
        return;
      }
      activeKnownTextNorm = null;

      // If part of this segment was already streamed live (a pause was
      // detected mid-segment) only the still-unspoken tail remains to
      // handle here — skip dedup/catalog/reading matching, which already
      // happened (or deliberately didn't apply) during streaming.
      if (flushedCount > 0) {
        const words = norm.split(' ');
        const tail = words.slice(Math.min(flushedCount, words.length)).join(' ');
        dedupGuard.remember(norm);
        if (tail) {
          const { text: liveEn, reason } = await translatePtToEn(tail);
          if (liveEn) {
            speechQueue.speak(liveEn);
            onSegmentClassified?.({ rawText: tail, norm, kind: 'live-translate-tail', en: liveEn });
          } else {
            onSegmentClassified?.({ rawText: tail, norm, kind: 'translate-failed', reason });
          }
        }
        return;
      }

      if (dedupGuard.isDuplicate(norm)) {
        onSegmentClassified?.({ rawText, norm, kind: 'dropped-duplicate' });
        return;
      }

      // Checked after isDuplicate so a cue segment ("repitam comigo...")
      // never consumes its own bypass — the bypass is reserved for the
      // *next* segment, i.e. the actual repeated phrase. (R10)
      dedupGuard.noteIfRepeatCue(norm);

      // 1 & 2. Ordinary fixed parts + Missal variants — instant, no network.
      const catalogHit = matchCatalog(catalogEntries, norm);
      if (catalogHit) {
        commitCatalogHit(catalogHit, rawText, norm);
        return;
      }

      // 3. Day-specific readings/psalm/gospel, verify-before-trust (R36).
      if (liturgyCache) {
        const reading = liturgyCache.matchReading(norm);
        if (reading) {
          const handled = await commitReadingHit(reading, rawText, norm);
          if (handled) return;
          // translation failed -> fall through to live path below
        }
      }

      // 4. Sung/hymn moments have no spoken trigger -> nothing reaches here
      //    for them; handled implicitly by absence of a match.

      // 5. Unknown -> live translation fallback (R4), graceful on failure (R9).
      const { text: liveEn, reason } = await translatePtToEn(rawText);
      dedupGuard.remember(norm);
      if (liveEn) {
        speechQueue.speak(liveEn);
        onSegmentClassified?.({ rawText, norm, kind: 'live-translate', en: liveEn });
      } else {
        onSegmentClassified?.({ rawText, norm, kind: 'translate-failed', reason });
      }
    } catch (err) {
      onSegmentClassified?.({ rawText, norm: norm ?? rawText, kind: 'error', reason: `handleSegment: ${err?.message ?? err}` });
    }
  }

  // Called when the user manually stops (R9b) so leftover streaming state
  // from interrupted segments doesn't leak into the next session.
  function reset() {
    for (const timer of pauseTimerBySegment.values()) clearTimeout(timer);
    pauseTimerBySegment.clear();
    flushedWordCountBySegment.clear();
    committedSegments.clear();
    activeKnownTextNorm = null;
  }

  return { handleSegment, handleInterim, reset };
}
