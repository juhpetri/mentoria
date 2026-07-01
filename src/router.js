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
  // How many words of the *current* utterance have already been streamed
  // out via interim chunks, so the eventual final segment only speaks the
  // still-unspoken tail instead of repeating everything from the start.
  let streamedWordCount = 0;

  // Called on every interim (not-yet-final) STT result. Fires live
  // translation early, in word-count chunks, so long continuous speech
  // doesn't go silent until the priest pauses.
  async function handleInterim(rawText) {
    const norm = normalize(rawText);
    if (!norm) return;
    const words = norm.split(' ');

    // Shorter than last time -> the engine started a new utterance before
    // we ever saw the previous one's final event (e.g. after a restart).
    if (words.length < streamedWordCount) streamedWordCount = 0;

    if (words.length - streamedWordCount < INTERIM_CHUNK_WORDS) return;

    // Cheap short-circuit: if this looks like a fixed/catalog phrase, let
    // handleSegment's precise matching handle it on the final event instead
    // of live-translating a partial match here.
    if (matchCatalog(catalogEntries, norm)) return;

    const chunkWords = words.slice(streamedWordCount);
    streamedWordCount = words.length;
    const chunkText = chunkWords.join(' ');

    const liveEn = await translatePtToEn(chunkText);
    if (liveEn) {
      speechQueue.speak(liveEn);
      onSegmentClassified?.({ rawText: chunkText, norm: chunkText, kind: 'live-translate-interim', en: liveEn });
    }
  }

  async function handleSegment(rawText) {
    const norm = normalize(rawText);
    if (!norm) return;

    // If part of this utterance was already streamed live via interim
    // chunks above, only the still-unspoken tail remains to handle here —
    // skip dedup/catalog/reading matching, which already happened (or
    // deliberately didn't apply) during streaming.
    if (streamedWordCount > 0) {
      const words = norm.split(' ');
      const tail = words.slice(streamedWordCount).join(' ');
      streamedWordCount = 0;
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
  // from an interrupted utterance doesn't leak into the next session.
  function reset() {
    streamedWordCount = 0;
  }

  return { handleSegment, handleInterim, reset };
}
