// Avoid re-speaking duplicate/overlapping segments, except when the priest
// explicitly asks the assembly to repeat a phrase. (R10)

const RECENT_LIMIT = 5;

const REPEAT_CUE_KEYWORDS = [
  'repitam comigo',
  'repita comigo',
  'repitam',
  'todos juntos',
];

export function createDedupGuard() {
  const recent = [];
  let bypassNext = false;

  function remember(norm) {
    recent.push(norm);
    if (recent.length > RECENT_LIMIT) recent.shift();
  }

  return {
    // Returns true if this segment should be dropped (already spoken).
    isDuplicate(norm) {
      if (bypassNext) {
        bypassNext = false;
        return false;
      }
      return recent.some((seen) => seen === norm || seen.includes(norm) || norm.includes(seen));
    },
    remember,
    // Call on every segment; if it contains a repeat cue, the *next*
    // segment bypasses the dedup check even if it looks like a repeat.
    noteIfRepeatCue(norm) {
      if (REPEAT_CUE_KEYWORDS.some((kw) => norm.includes(kw))) {
        bypassNext = true;
      }
    },
  };
}
