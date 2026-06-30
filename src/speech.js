// Serialized speech queue + SpeechSynthesis (en-US) playback. (R5, R9b)
export function createSpeechQueue({ onSpeak } = {}) {
  const queue = [];
  let speaking = false;

  function pump() {
    if (speaking || queue.length === 0) return;
    const text = queue.shift();
    speaking = true;
    onSpeak?.(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
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
