// Serialized speech queue + SpeechSynthesis (en-US) playback. (R5, R9b)

// Male en-US/en-GB voices tend to be named consistently across browsers;
// match by name first (covers Chrome desktop/Android), then fall back to
// any voice whose exposed metadata says male (some engines set this).
const MALE_VOICE_NAME_HINTS = [
  'Google UK English Male',
  'Microsoft David',
  'Microsoft Guy',
  'Microsoft Ryan',
  'Daniel',
  'Alex',
  'Fred',
];

function pickMaleVoice() {
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  for (const hint of MALE_VOICE_NAME_HINTS) {
    const hit = enVoices.find((v) => v.name.includes(hint));
    if (hit) return hit;
  }
  const byMeta = enVoices.find((v) => /male/i.test(v.name) && !/female/i.test(v.name));
  if (byMeta) return byMeta;
  return enVoices[0] ?? null;
}

export function createSpeechQueue({ onSpeak } = {}) {
  const queue = [];
  let speaking = false;
  let maleVoice = pickMaleVoice();

  // getVoices() can return [] until the browser finishes loading its voice
  // list asynchronously; re-pick once it fires so playback isn't stuck with
  // no explicit voice (and thus an unpredictable default) for the whole Mass.
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      maleVoice = pickMaleVoice();
    });
  }

  function pump() {
    if (speaking || queue.length === 0) return;
    const text = queue.shift();
    speaking = true;
    onSpeak?.(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (maleVoice) utterance.voice = maleVoice;
    utterance.onend = () => {
      speaking = false;
      pump();
    };
    utterance.onerror = () => {
      speaking = false;
      pump();
    };
    window.speechSynthesis.speak(utterance);
  }

  return {
    speak(text) {
      if (!text) return;
      queue.push(text);
      pump();
    },
    // Immediately silences anything queued or currently playing — not
    // "after the current sentence finishes." (R9b)
    stop() {
      queue.length = 0;
      speaking = false;
      window.speechSynthesis.cancel();
    },
  };
}
