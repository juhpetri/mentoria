// The brain: classify each finalized transcript segment and dispatch.
// Decision flow per design.md section 4. (R3, R4, R10, R36)
import { normalize } from './normalize.js';
import { matchCatalog } from './catalogs.js';
import { translatePtToEn } from './translate.js';

// Continuous speech (e.g. a homily) can run many seconds without a pause,
// and the STT engine's `isFinal` result only fires on a pause — waiting for
// it means the worshipper hears nothing the whole time the priest is
// talking. Fix: chunk the *interim* (not-yet-final) transcript by word
// count and translate/speak each new chunk as it arrives, instead of
// waiting for isFinal. Short utterances (greetings, responses, fixed parts)
// finalize before ever reaching this threshold, so they're unaffected and
// still go through the precise catalog/reading matching in handleSegment.
const INTERIM_CHUNK_WORDS = 6;

export function createRouter({ catalogEntries, liturgyCache, dedupGuard, speechQueue, onSegmentClassified }) {
  // SpeechRecognition's result list holds several independent segments at
  // once (it splits continuous speech on detected pauses), each identified
  // by a stable `segmentId` (event.resultIndex) until it finalizes. Each
  // segment gets its own fixed, monotonically-advancing word window: words
  // 0-5 translated/spoken once, then 6-11, then 12-17, etc, committed
  // permanently the first time available and never revisited — even if a
  // later interim revision changes those words — so segments never
  // interleave into each other and no window is ever spoken twice.
  const nextWordIndexBySegment = new Map();

  function getNextWordIndex(segmentId) {
    return nextWordIndexBySegment.get(segmentId) ?? 0;
  }

  // Called on every interim (not-yet-final) STT result. Fires live
  // translation early, in fixed word windows, so long continuous speech
  // doesn't go silent until the priest pauses.
  async function handleInterim(rawText, segmentId) {
    const norm = normalize(rawText);
    if (!norm) return;
    const words = norm.split(' ');
    let nextWordIndex = getNextWordIndex(segmentId);

    // Hypothesis got shorter than what we already committed for this
    // segment -> resync forward rather than rewinding into already-spoken
    // territory.
    if (words.length < nextWordIndex) nextWordIndex = words.length;

    if (words.length - nextWordIndex < INTERIM_CHUNK_WORDS) {
      nextWordIndexBySegment.set(segmentId, nextWordIndex);
      return;
    }

    // Cheap short-circuit: if this looks like a fixed/catalog phrase, let
    // handleSegment's precise matching handle it on the final event instead
    // of live-translating a partial match here.
    if (matchCatalog(catalogEntries, norm)) return;

    const windowEnd = nextWordIndex + INTERIM_CHUNK_WORDS;
    const chunkWords = words.slice(nextWordIndex, windowEnd);
    nextWordIndexBySegment.set(segmentId, windowEnd);
    const chunkText = chunkWords.join(' ');

    const liveEn = await translatePtToEn(chunkText);
    if (liveEn) {
      speechQueue.speak(liveEn);
      onSegmentClassified?.({ rawText: chunkText, norm: chunkText, kind: 'live-translate-interim', en: liveEn });
    }
  }

  async function handleSegment(rawText, segmentId) {
    const norm = normalize(rawText);
    if (!norm) return;

    const nextWordIndex = getNextWordIndex(segmentId);
    nextWordIndexBySegment.delete(segmentId);

    // If part of this segment was already streamed live via interim
    // chunks above, only the still-unspoken tail remains to handle here —
    // skip dedup/catalog/reading matching, which already happened (or
    // deliberately didn't apply) during streaming.
    if (nextWordIndex > 0) {
      const words = norm.split(' ');
      const tail = words.slice(Math.min(nextWordIndex, words.length)).join(' ');
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
    nextWordIndexBySegment.clear();
  }

  return { handleSegment, handleInterim, reset };
}
