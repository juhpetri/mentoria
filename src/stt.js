// Wraps SpeechRecognition (pt-BR, continuous), emits finalized segments. (R1)
export function createSpeechToText({ onFinalSegment, onInterim, onError } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('SpeechRecognition not supported in this browser.');
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = true;

  let listening = false;
  let stoppedByUser = false;

  recognition.onresult = (event) => {
    // event.results is cumulative and can hold several independent segments
    // at once (the engine splits continuous speech on detected pauses/VAD),
    // each growing on its own. `i` is that segment's stable id until it
    // finalizes, so callers can track per-segment state instead of treating
    // every interim callback as one single growing utterance.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        onFinalSegment?.(transcript.trim(), i);
      } else {
        onInterim?.(transcript.trim(), i);
      }
    }
  };

  recognition.onerror = (event) => {
    onError?.(event.error);
  };

  // Chrome's continuous mode still stops on silence; restart unless the
  // user explicitly asked to stop. (R1 — "capture continuously")
  recognition.onend = () => {
    if (listening && !stoppedByUser) {
      try {
        recognition.start();
      } catch {
        // already starting/started — ignore
      }
    }
  };

  return {
    start() {
      stoppedByUser = false;
      listening = true;
      recognition.start();
    },
    stop() {
      stoppedByUser = true;
      listening = false;
      recognition.stop();
    },
    isListening() {
      return listening;
    },
  };
}
