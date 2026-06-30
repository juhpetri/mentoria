import { createSpeechToText } from './stt.js';
import { createSpeechQueue } from './speech.js';
import { createDedupGuard } from './dedup.js';
import { loadCatalog } from './catalogs.js';
import { createLiturgyCache } from './liturgyApi.js';
import { createRouter } from './router.js';

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
  ]);

  const router = createRouter({
    catalogEntries,
    liturgyCache,
    dedupGuard,
    speechQueue,
    onSegmentClassified: ({ rawText, kind }) => {
      logTranscript(`PT (${kind}): ${rawText}`);
    },
  });

  let stt;
  try {
    stt = createSpeechToText({
      onFinalSegment: (text) => router.handleSegment(text),
      onError: (err) => setStatus(`Error: ${err}`),
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
    setStatus('Stopped.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });
}

main();
