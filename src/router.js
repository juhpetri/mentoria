// The brain: classify each finalized transcript segment and dispatch.
// Decision flow per design.md section 4. (R3, R4, R10, R36)
import { normalize } from './normalize.js';
import { matchCatalog } from './catalogs.js';
import { translatePtToEn } from './translate.js';

// How long the priest's speech has to go quiet (no new interim text for
// this segment) before we treat it as a pause and translate/speak
// whatever's accumulated since the last flush — mirrors how a human
// interpreter waits for a natural break rather than cutting mid-thought.
const PAUSE_MS = 900;

// Safety net for a homily that runs on for a long stretch with no detected
// pause at all: force a flush after this many unflushed words so the
// worshipper isn't left waiting indefinitely for translation to start.
const MAX_UNFLUSHED_WORDS = 25;

export function createRouter({ catalogEntries, liturgyCache, dedupGuard, speechQueue, onSegmentClassified }) {
  // SpeechRecognition's result list holds several independent segments at
  // once (it splits continuous speech on detected pauses), each identified
  // by a stable `segmentId` (event.resultIndex) until it finalizes. Per
  // segment we track: how many words have already been flushed
  // (translated/spoken), and the pending pause-detection timer.
  const flushedWordCountBySegment = new Map();
  const pauseTimerBySegment = new Map();

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

    const liveEn = await translatePtToEn(chunkText);
    if (liveEn) {
      speechQueue.speak(liveEn);
      onSegmentClassified?.({ rawText: chunkText, norm: chunkText, kind: 'live-translate-interim', en: liveEn });
    }
  }

  // Called on every interim (not-yet-final) STT result. Debounces on
  // PAUSE_MS of silence for this segment before translating what's
  // accumulated so far — so long continuous speech (a homily) still gets
  // spoken at natural breaks instead of staying silent until isFinal fires,
  // but without chopping mid-sentence every few words.
  async function handleInterim(rawText, segmentId) {
    const norm = normalize(rawText);
    if (!norm) return;
    const words = norm.split(' ');

    // Cheap short-circuit: if this looks like a fixed/catalog phrase, let
    // handleSegment's precise matching handle it on the final event instead
    // of live-translating a partial match here.
    if (matchCatalog(catalogEntries, norm)) return;

    clearPauseTimer(segmentId);

    const flushedCount = getFlushedCount(segmentId);
    if (words.length - flushedCount >= MAX_UNFLUSHED_WORDS) {
      await flushSegment(segmentId, norm);
      return;
    }

    const timer = setTimeout(() => {
      pauseTimerBySegment.delete(segmentId);
      flushSegment(segmentId, norm);
    }, PAUSE_MS);
    pauseTimerBySegment.set(segmentId, timer);
  }

  async function handleSegment(rawText, segmentId) {
    const norm = normalize(rawText);
    if (!norm) return;

    clearPauseTimer(segmentId);
    const flushedCount = getFlushedCount(segmentId);
    flushedWordCountBySegment.delete(segmentId);

    // If part of this segment was already streamed live (a pause was
    // detected mid-segment) only the still-unspoken tail remains to handle
    // here — skip dedup/catalog/reading matching, which already happened
    // (or deliberately didn't apply) during streaming.
    if (flushedCount > 0) {
      const words = norm.split(' ');
      const tail = words.slice(Math.min(flushedCount, words.length)).join(' ');
      dedupGuard.remember(norm);
      if (tail) {
        const liveEn = await translatePtToEn(tail);
        if (liveEn) {
          speechQueue.speak(liveEn);
          onSegmentClassified?.({ rawText: tail, norm, kind: 'live-translate-tail', en: liveEn });
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
          onSegmentClassified?.({ rawText, norm, kind: 'reading', reading });
          return;
        }
        // translation failed -> fall through to live path below
      }
    }

    // 4. Sung/hymn moments have no spoken trigger -> nothing reaches here
    //    for them; handled implicitly by absence of a match.

    // 5. Unknown -> live translation fallback (R4), graceful on failure (R9).
    const liveEn = await translatePtToEn(rawText);
    dedupGuard.remember(norm);
    if (liveEn) {
      speechQueue.speak(liveEn);
      onSegmentClassified?.({ rawText, norm, kind: 'live-translate', en: liveEn });
    } else {
      onSegmentClassified?.({ rawText, norm, kind: 'translate-failed' });
    }
  }

  // Called when the user manually stops (R9b) so leftover streaming state
  // from interrupted segments doesn't leak into the next session.
  function reset() {
    for (const timer of pauseTimerBySegment.values()) clearTimeout(timer);
    pauseTimerBySegment.clear();
    flushedWordCountBySegment.clear();
  }

  return { handleSegment, handleInterim, reset };
}
