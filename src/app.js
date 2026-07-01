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

function setStatus(text) {
  statusEl.textContent = text;
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
    onSpeak: (text) => logTranscript(`EN: ${text}`),
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
    },
  });

  let stt;
  try {
    stt = createSpeechToText({
      onFinalSegment: (text, segmentId) => router.handleSegment(text, segmentId),
      onInterim: (text, segmentId) => router.handleInterim(text, segmentId),
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
    setStatus('Stopped.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });
}

main();
