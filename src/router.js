// The brain: classify each finalized transcript segment and dispatch.
// Decision flow per design.md section 4. (R3, R4, R10, R36)
import { normalize } from './normalize.js';
import { matchCatalog } from './catalogs.js';
import { translatePtToEn } from './translate.js';

// How long the priest's speech has to go quiet (no new interim text for
// this segment) before we treat it as a pause and translate/speak
// whatever's accumulated since the last flush — mirrors how a human
// interpreter waits for a natural break rather than cutting mid-thought.
const PAUSE_MS = 400;

// Safety net for a homily that runs on for a long stretch with no detected
// pause at all: force a flush after this many unflushed words so the
// worshipper isn't left waiting indefinitely for translation to start.
const MAX_UNFLUSHED_WORDS = 25;

// pt-BR SpeechRecognition punctuates its own hypothesis (periods, commas,
// colons) at natural clause/sentence breaks — a much more reliable pause
// signal than a fixed silence timeout, since real speech pauses (e.g.
// mid-liturgy) are often shorter than any timeout we could safely pick.
// When the *raw* (pre-normalize) hypothesis ends in one of these, flush
// immediately instead of waiting out the debounce.
const SENTENCE_END_RE = /[.!?:;]\s*$/;

export function createRouter({ catalogEntries, liturgyCache, dedupGuard, speechQueue, onSegmentClassified }) {
  // SpeechRecognition's result list holds several independent segments at
  // once (it splits continuous speech on detected pauses), each identified
  // by a stable `segmentId` (event.resultIndex) until it finalizes. Per
  // segment we track: how many words have already been flushed
  // (translated/spoken), and the pending pause-detection timer.
  const flushedWordCountBySegment = new Map();
  const pauseTimerBySegment = new Map();

  // A known text (Credo, a day-specific reading, etc.) gets its *entire*
  // English translation spoken all at once the moment it's recognized. But
  // the priest keeps reciting it out loud across several more STT segments
  // (each new pause starts a fresh segment with no keyword match of its
  // own), which used to fall through to word-by-word live translation —
  // producing broken, context-free fragments of text that was *already*
  // fully translated. While `activeKnownTextNorm` is set, any segment whose
  // text is still contained in it is a continuation of the same known
  // recitation and is silently ignored instead of live-translated.
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

  // Called on every interim (not-yet-final) STT result. Debounces on
  // PAUSE_MS of silence for this segment before translating what's
  // accumulated so far — so long continuous speech (a homily) still gets
  // spoken at natural breaks instead of staying silent until isFinal fires,
  // but without chopping mid-sentence every few words.
  async function handleInterim(rawText, segmentId) {
    try {
      const norm = normalize(rawText);
      if (!norm) return;

      // Still reciting a known text (Credo, a reading, ...) that was
      // already translated and spoken in full -> nothing new to say.
      if (isKnownContinuation(norm)) return;

      const words = norm.split(' ');

      // Cheap short-circuit: if this looks like a fixed/catalog phrase, let
      // handleSegment's precise matching handle it on the final event instead
      // of live-translating a partial match here.
      if (matchCatalog(catalogEntries, norm)) return;

      clearPauseTimer(segmentId);

      const flushedCount = getFlushedCount(segmentId);
      if (
        words.length - flushedCount >= MAX_UNFLUSHED_WORDS ||
        SENTENCE_END_RE.test(rawText.trim())
      ) {
        await flushSegment(segmentId, norm);
        return;
      }

      const timer = setTimeout(() => {
        pauseTimerBySegment.delete(segmentId);
        flushSegment(segmentId, norm).catch((err) => {
          onSegmentClassified?.({ rawText, norm, kind: 'error', reason: `handleInterim (debounced flush): ${err?.message ?? err}` });
        });
      }, PAUSE_MS);
      pauseTimerBySegment.set(segmentId, timer);
    } catch (err) {
      onSegmentClassified?.({ rawText, norm: rawText, kind: 'error', reason: `handleInterim: ${err?.message ?? err}` });
    }
  }

  async function handleSegment(rawText, segmentId) {
    let norm;
    try {
    norm = normalize(rawText);
    if (!norm) return;

    clearPauseTimer(segmentId);
    const flushedCount = getFlushedCount(segmentId);
    flushedWordCountBySegment.delete(segmentId);

    // Still reciting a known text -> nothing new to say. Once the segment's
    // text stops matching (the recitation moved on to something else),
    // isKnownContinuation naturally returns false and normal routing below
    // takes over, including a fresh catalog/reading match if applicable.
    if (isKnownContinuation(norm)) {
      dedupGuard.remember(norm);
      onSegmentClassified?.({ rawText, norm, kind: 'catalog-continuation' });
      return;
    }
    activeKnownTextNorm = null;

    // If part of this segment was already streamed live (a pause was
    // detected mid-segment) only the still-unspoken tail remains to handle
    // here — skip dedup/catalog/reading matching, which already happened
    // (or deliberately didn't apply) during streaming.
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

    // Checked after isDuplicate so a cue segment ("repitam comigo...") never
    // consumes its own bypass — the bypass is reserved for the *next*
    // segment, i.e. the actual repeated phrase. (R10)
    dedupGuard.noteIfRepeatCue(norm);

    // 1 & 2. Ordinary fixed parts + Missal variants — instant, no network.
    const catalogHit = matchCatalog(catalogEntries, norm);
    if (catalogHit) {
      speechQueue.speak(catalogHit.en);
      dedupGuard.remember(norm);
      if (catalogHit.pt) activeKnownTextNorm = normalize(catalogHit.pt);
      onSegmentClassified?.({ rawText, norm, kind: 'catalog', entry: catalogHit });
      return;
    }

    // 3. Day-specific readings/psalm/gospel, verify-before-trust (R36).
    if (liturgyCache) {
      const reading = liturgyCache.matchReading(norm);
      if (reading) {
        if (reading.sung) {
          dedupGuard.remember(norm);
          onSegmentClassified?.({ rawText, norm, kind: 'sung-quiet' });
          return; // psalm sung -> stay quiet (R20)
        }
        const en = await liturgyCache.getEnglishFor(reading);
        if (en) {
          speechQueue.speak(en);
          dedupGuard.remember(norm);
          if (reading.ptFull) activeKnownTextNorm = normalize(reading.ptFull);
          onSegmentClassified?.({ rawText, norm, kind: 'reading', reading });
          return;
        }
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
    activeKnownTextNorm = null;
  }

  return { handleSegment, handleInterim, reset };
}
