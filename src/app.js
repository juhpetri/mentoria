import { createSpeechToText } from './stt.js';
import { createSpeechQueue } from './speech.js';
import { createDedupGuard } from './dedup.js';
import { loadCatalog } from './catalogs.js';
import { createLiturgyCache } from './liturgyApi.js';
import { createRouter } from './router.js';
import { warmUpTranslator } from './translate.js';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const liveCaptionPtEl = document.getElementById('liveCaptionPt');
const liveCaptionEnEl = document.getElementById('liveCaptionEn');
const historyEl = document.getElementById('history');

// Kinds from router.js that actually produce (or attempt) a spoken
// translation — everything else (dropped duplicates, continuations of a
// known text already spoken, sung/quiet moments, errors) has nothing new
// to show in the permanent history.
const HISTORY_KINDS = new Set(['catalog', 'reading', 'live-translate', 'live-translate-interim', 'live-translate-tail']);

// Full running history of everything heard (PT) and translated (EN), shown
// permanently on screen — unlike the live caption above, which is
// overwritten as new speech comes in, this keeps every entry. Each PT
// classification opens an entry; the next EN spoken fills it in, since
// translation happens asynchronously after classification.
const pendingHistoryEnEls = [];

function appendHistoryPt(text) {
  const entry = document.createElement('div');
  entry.className = 'history-entry';
  const ptLine = document.createElement('div');
  ptLine.className = 'history-pt';
  ptLine.textContent = text;
  const enLine = document.createElement('div');
  enLine.className = 'history-en';
  entry.appendChild(ptLine);
  entry.appendChild(enLine);
  historyEl.appendChild(entry);
  historyEl.scrollTop = historyEl.scrollHeight;
  pendingHistoryEnEls.push(enLine);
}

function fillNextHistoryEn(text) {
  let enLine = pendingHistoryEnEls.shift();
  if (!enLine) {
    // Spoken without a matching pending PT entry (shouldn't normally
    // happen) — still show it rather than silently dropping it.
    appendHistoryPt('');
    enLine = pendingHistoryEnEls.shift();
  }
  enLine.textContent = text;
  historyEl.scrollTop = historyEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

// Mirrors how this chat's own voice dictation works: show the Portuguese
// text as it's being recognized (updates live, in place), then show the
// English translation once a piece of it is actually spoken — separate
// from the collapsible debug transcript below, which keeps the full log.
function setLiveCaptionPt(text) {
  liveCaptionPtEl.textContent = text;
}
function setLiveCaptionEn(text) {
  liveCaptionEnEl.textContent = text;
}

function logTranscript(line) {
  const entry = document.createElement('div');
  entry.textContent = line;
  transcriptEl.appendChild(entry);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// Anything that slips through (an exception nobody caught, a rejected
// promise nobody awaited) still shows up in the debug transcript instead of
// silently dying in the console where the priest/worshipper can't see it.
window.addEventListener('error', (event) => {
  logTranscript(`ERROR: ${event.message}`);
});
window.addEventListener('unhandledrejection', (event) => {
  logTranscript(`ERROR (unhandled): ${event.reason?.message ?? event.reason}`);
});

async function main() {
  setStatus('Loading...');

  const speechQueue = createSpeechQueue({
    onSpeak: (text) => {
      logTranscript(`EN: ${text}`);
      setLiveCaptionEn(text);
      fillNextHistoryEn(text);
    },
  });
  const dedupGuard = createDedupGuard();
  const liturgyCache = createLiturgyCache();

  const [catalogEntries] = await Promise.all([
    loadCatalog(),
    liturgyCache.fetchToday(),
    warmUpTranslator(), // any on-device language-pack download happens now
  ]);

  const router = createRouter({
    catalogEntries,
    liturgyCache,
    dedupGuard,
    speechQueue,
    onSegmentClassified: ({ rawText, kind, reason }) => {
      logTranscript(reason ? `PT (${kind}): ${rawText} — ${reason}` : `PT (${kind}): ${rawText}`);
      if (HISTORY_KINDS.has(kind)) {
        appendHistoryPt(rawText);
      }
    },
  });

  let stt;
  try {
    stt = createSpeechToText({
      onFinalSegment: (text, segmentId) => {
        setLiveCaptionPt(text);
        router.handleSegment(text, segmentId);
      },
      onInterim: (text, segmentId) => {
        setLiveCaptionPt(text);
        router.handleInterim(text, segmentId);
      },
      onError: (err) => {
        setStatus(`Error: ${err}`);
        logTranscript(`ERROR (speech recognition): ${err}`);
      },
    });
  } catch (err) {
    setStatus(err.message);
    startBtn.disabled = true;
    return;
  }

  setStatus('Idle. Tap Start to begin.');
  startBtn.disabled = false;

  startBtn.addEventListener('click', () => {
    stt.start();
    setStatus('Listening...');
    startBtn.disabled = true;
    stopBtn.disabled = false;
  });

  stopBtn.addEventListener('click', () => {
    // Stop capturing AND immediately silence any queued/in-progress
    // speech — not "after the current sentence finishes." (R9b)
    stt.stop();
    speechQueue.stop();
    router.reset();
    setLiveCaptionPt('');
    setLiveCaptionEn('');
    setStatus('Stopped.');
    // History (unlike the live caption) intentionally stays on screen after
    // Stop — it's the record of what was heard/translated this session.
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });
}

main();
