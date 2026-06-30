function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // remove accents so matching is robust
}

const NORMALIZED_LITURGY = LITURGY.map((part) => ({
  ...part,
  normalizedKeywords: part.keywords.map(normalize),
}));

function findMatchingPart(spokenText) {
  const normalizedSpoken = normalize(spokenText);
  for (const part of NORMALIZED_LITURGY) {
    if (part.normalizedKeywords.some((kw) => normalizedSpoken.includes(kw))) {
      return part;
    }
  }
  return null;
}

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const currentPartEl = document.getElementById("currentPart");
const partTitleEnEl = document.getElementById("partTitleEn");
const partTitlePtEl = document.getElementById("partTitlePt");
const responseEnEl = document.getElementById("responseEn");
const explanationEl = document.getElementById("explanation");

let recognition = null;
let lastPartId = null;

// Fixed parts are known in advance, so we speak the English text immediately —
// no translation round-trip needed, which keeps latency near zero.
function showAndSpeakPart(part) {
  if (part.id === lastPartId) return;
  lastPartId = part.id;
  currentPartEl.classList.remove("hidden");
  partTitleEnEl.textContent = part.titleEn;
  partTitlePtEl.textContent = part.titlePt;
  responseEnEl.textContent = part.responseEn;
  explanationEl.textContent = part.explanationEn;
  speakEnglish(`${part.titleEn}. ${part.responseEn}`);
}

// --- Text-to-speech queue (so overlapping segments don't talk over each other) ---
const speechQueue = [];
let isSpeaking = false;

function speakEnglish(text) {
  speechQueue.push(text);
  pumpSpeechQueue();
}

function pumpSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return;
  isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(speechQueue.shift());
  utterance.lang = "en-US";
  utterance.onend = utterance.onerror = () => {
    isSpeaking = false;
    pumpSpeechQueue();
  };
  speechSynthesis.speak(utterance);
}

// --- Translation for the parts that change every week (readings, homily) ---
// Free, no-key API suited for short/medium texts; good enough for a prototype.
async function translatePtToEn(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=pt|en`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.responseData?.translatedText || null;
}

const MIN_WORDS_TO_TRANSLATE = 4; // skip very short noise fragments

async function handleFreeSpeech(finalText) {
  if (finalText.split(/\s+/).length < MIN_WORDS_TO_TRANSLATE) return;
  try {
    const translated = await translatePtToEn(finalText);
    if (translated) speakEnglish(translated);
  } catch (err) {
    console.error("Translation failed", err);
  }
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusEl.textContent = "Speech recognition not supported in this browser. Try Chrome.";
    startBtn.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript + " ";
      } else {
        interimText += transcript;
      }
    }
    const combined = (finalText + interimText).trim();
    if (combined) {
      transcriptEl.textContent = combined;
      const match = findMatchingPart(combined);
      if (match) showAndSpeakPart(match);
    }

    // Final (settled) phrases that didn't match a known fixed part are
    // treated as free speech (readings/homily) and sent to be translated.
    if (finalText.trim() && !findMatchingPart(finalText)) {
      handleFreeSpeech(finalText.trim());
    }
  };

  rec.onerror = (event) => {
    statusEl.textContent = `Error: ${event.error}`;
  };

  rec.onend = () => {
    // Mass is long — keep listening until the user explicitly stops.
    if (stopBtn.disabled === false) {
      rec.start();
    }
  };

  return rec;
}

startBtn.addEventListener("click", () => {
  if (!recognition) recognition = setupRecognition();
  if (!recognition) return;
  recognition.start();
  statusEl.textContent = "Listening…";
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  stopBtn.disabled = true;
  startBtn.disabled = false;
  statusEl.textContent = "Idle";
  if (recognition) recognition.stop();
});
