# Design: Live Mass Interpreter

Design phase for the `live-mass-interpreter` feature. Translates the resolved
requirements (see `spec.md`, R1–R41) into an architecture, module breakdown, data
shapes, and the live-flow control logic. No application code is written here — this is
the blueprint the Tasks phase (`tasks.md`) sequences into work.

## 1. Architecture Overview

Fully client-side, no backend (R7). Everything runs in the worshipper's mobile browser.
Two external network calls only: (a) the browser's built-in speech recognition service
behind the Web Speech API, and (b) the day's-liturgy fetch + the live-translation fallback
HTTP API.

```
                    ┌─────────────────────────────────────────────────┐
                    │              Browser (worshipper's phone)         │
                    │                                                   │
  microphone  ───▶  │  [STT]  SpeechRecognition (pt-BR, continuous)     │
                    │     │                                             │
                    │     ▼                                             │
                    │  [Normalizer]  lowercase + strip accents          │
                    │     │                                             │
                    │     ▼                                             │
                    │  [Router]  decide what this transcript segment is │
                    │     ├── matches Ordinary fixed part ──▶ instant EN │
                    │     ├── matches day/Missal catalog ───▶ instant EN │
                    │     │     (only after R36 verify)                  │
                    │     ├── sung/hymn moment ─────────────▶ stay quiet │
                    │     └── none of the above ────────────▶ live xlate │
                    │                                  │                │
                    │                                  ▼                │
                    │  [Speech Queue]  serialize utterances (R5)        │
                    │     │                                             │
                    │     ▼                                             │
  earphones  ◀───── │  [TTS]  SpeechSynthesis (en-US)                   │
                    │                                                   │
                    │  [Liturgy Cache]  fetched on startup (R37)        │
                    │  [Static Catalogs] Ordinary + Missal JSON (R2/R38)│
                    └─────────────────────────────────────────────────┘
                              │                         │
                              ▼                         ▼
                     Liturgia API v3            Translation API (MyMemory)
                     (readings/psalm/gospel)    (live fallback only)
```

## 2. Module Breakdown

| Module | Responsibility | Key requirements |
|--------|----------------|------------------|
| `stt` | Wrap `SpeechRecognition`: start/stop, continuous mode, pt-BR, emit interim + final segments. | R1, R9b |
| `normalize` | Lowercase + strip accents/punctuation to a comparable form for matching. | R3, R36 |
| `router` | The brain: classify each finalized segment (fixed Ordinary / day-specific / Missal-variant / sung / unknown) and dispatch. Holds the dedup guard (R10) and the verify-before-trust check (R36). | R3, R4, R10, R12, R36 |
| `catalog.ordinary` | Static catalog of the fixed Ordinary parts (today's `liturgy.js`), keyword → {EN title, EN text, explanation}. | R2, R11 |
| `catalog.missal` | Indexed JSON catalogs sourced from the Missal PDF: `coleta`, `prefacio`, `oracao-eucaristica`, `rito-comunhao`, `pos-comunhao`, `credo`. Keyword(opening words) → {PT, EN}. | R30, R38, R39, R40, R41 |
| `liturgy` | On startup, fetch the day's liturgy (readings/psalm/gospel) from Liturgia API v3, cache in memory. | R35, R37 |
| `translate` | Live PT→EN via MyMemory, used only on the unknown/fallback path. Handles failure gracefully. | R4, R9 |
| `speech` | Serialized speech queue + TTS playback; supports immediate flush/stop. | R5, R9b |
| `ui` | Minimal: Start/Stop control, status indicator, collapsed debug transcript. Audio-first. | R6, R7, R9b |

## 3. Data Shapes

### 3.1 Ordinary catalog entry (static, `catalog.ordinary`)
```
{
  id: "pai-nosso",
  keywords: ["pai nosso que estais nos ceus", ...],   // normalized PT triggers
  titleEn: "The Lord's Prayer",
  textEn:  "Our Father, who art in heaven, ...",       // pre-authored, spoken instantly
  explanation: "Said by the whole assembly together."   // optional, for UI/debug
}
```

### 3.2 Missal-variant catalog entry (indexed JSON, `catalog.missal`)
One file per part (`coleta.json`, `prefacio.json`, `oracao-eucaristica.json`,
`rito-comunhao.json`, `pos-comunhao.json`, `credo.json`). Indexed by a normalized key
derived from the opening words so lookup is O(1)-ish, not a linear scan (R38 sourcing).
```
// oracao-eucaristica.json  (keyed object, not array)
{
  "na-verdade-e-justo-rev-v": {          // stable index key
    id: "ep-v",
    label: "Eucharistic Prayer V",
    keywords: ["na verdade e justo e necessario", ...], // opening-words triggers
    pt: "Na verdade é justo e necessário ...",          // authoritative, from Missal PDF
    en: "It is truly right and just ..."                // official ICEL where it exists,
  },                                                     // else one-time pre-translation (R41)
  ...
}
```

### 3.3 Day liturgy cache (runtime, `liturgy`)
Fetched from `GET https://liturgia.up.railway.app/v3/{dd-mm-yyyy}` on startup (R37),
reduced to only what we use (readings/psalm/gospel — R39 scope), each with PT source text
for the R36 verify step. EN is produced lazily (translate-once-then-cache) the first time
that reading is matched, OR pre-translated right after fetch — see open design note 6.1.
```
{
  date: "28-06-2026",
  readings: [
    { id: "primeira-leitura", ptOpening: "leitura da profecia de ...", ptFull: "...", en: null },
    { id: "salmo",   sung: true },                       // sung → not translated (R20)
    { id: "segunda-leitura", ptOpening: "...", ptFull: "...", en: null },
    { id: "evangelho", ptOpening: "...", ptFull: "...", en: null }
  ]
}
```

## 4. Router Decision Flow (per finalized transcript segment)

```
on finalSegment(text):
    norm = normalize(text)

    if dedupGuard.isDuplicate(norm) and not priestAskedToRepeat:   # R10
        return                                                      # drop, already spoken

    # 1. Ordinary fixed parts — instant, no network (R3)
    hit = catalog.ordinary.match(norm)
    if hit: speak(hit.textEn); dedupGuard.remember(norm); return

    # 2. Missal variants: Coleta, Preface, Eucharistic Prayer, Communion rite,
    #    post-Communion, long Creed — instant once identified (R30, R38–R41)
    hit = catalog.missal.match(norm)
    if hit: speak(hit.en); dedupGuard.remember(norm); return

    # 3. Day-specific readings/psalm/gospel — but VERIFY first (R36)
    cand = liturgy.matchReading(norm)
    if cand:
        if cand.sung: return                              # psalm sung → quiet (R20)
        speak(cand.en ?? translateNowAndCache(cand))      # pre-fetched, verified
        dedupGuard.remember(norm); return

    # 4. Sung/hymn moments with no spoken trigger → stay quiet (decision #2)
    #    (handled by absence of a match + nothing to translate; see note 6.2)

    # 5. Unknown → live translation fallback (R4) — homily, anything unmatched
    speak( await translate(text) )                        # graceful on failure (R9)
    dedupGuard.remember(norm)
```

Key points:
- **R36 verify-before-trust** lives in step 3: `liturgy.matchReading` only returns a
  candidate when the live opening words actually correspond to a cached reading; if they
  don't, it returns nothing and the segment falls through to step 5 (live translation),
  which is the safe fail-open behavior — no similarity threshold, just found-or-not.
- **Eucharistic Prayer variant** is resolved in step 2 by matching opening words against
  `oracao-eucaristica.json` — never a hardcoded default (R30 corrected).
- **Sung content** never reaches a "translate" branch: hymns have no spoken keyword
  trigger and the psalm is flagged `sung` in the cache, so the app simply produces no
  output during music (decision #2 / R13, R16, R17, R20, R22, R27).

## 5. Dedup + Priest-Repeat Logic (R10)

- `dedupGuard` keeps a short rolling memory of recently-spoken normalized segments.
- A new segment whose normalized text is already remembered (or is fully contained in a
  remembered one) is dropped — this absorbs the STT re-emitting overlapping finals.
- **Exception**: if a repeat-cue keyword is detected (e.g. "repitam", "repita comigo",
  "todos juntos", "repitam comigo") the guard is bypassed for the next utterance so the
  intentional call-and-response repetition is translated/spoken again.

## 6. Open Design Notes (decide during Tasks/Execute, low risk)

1. **6.1 Pre-translate readings on fetch vs. lazily on first match.** Pre-translating all
   readings right after the startup fetch removes any mid-Mass latency but spends
   translation-API calls that may go unused (e.g. optional reading not chosen). Lazy
   translate-on-first-match spends nothing upfront but adds a one-time small delay the
   first time each reading is hit. Lean: **lazy with cache**, since R36 already accepts a
   small fallback latency and it avoids burning the MyMemory quota. Revisit if latency
   on first hit feels bad in testing.
2. **6.2 Detecting "we're in a hymn" explicitly.** Currently sung moments are handled
   implicitly (no trigger + nothing to translate). If background singing produces noisy
   STT that leaks into the unknown→translate path (step 5), we may need an explicit
   "mute during known sung sections" signal. Deferred — only address if testing shows
   garbage translation during hymns.
3. **6.3 R8 preface sentence-boundary smoothing** and **6.4 R9 translation-API failure
   handling** remain the two spec-level open requirements; their detailed approach is
   designed at implementation time (buffering strategy / retry+skip+notify respectively).
4. **6.5 Longest-keyword-match priority.** Some catalog entries have overlapping
   keywords by design — e.g. `ordinary.json`'s three Memorial Acclamation forms
   (`misterio-da-fe-a/b/c`): the priest's cue for Forms B and C both start with the
   same words as Form A's cue ("mistério da fé..."). Matching must check the longest/
   most specific keyword first and only fall back to a shorter one if no longer match
   is found, otherwise Form A would incorrectly win every time. Applies to
   `catalog.ordinary` and `catalog.missal` alike; implement as a single sort-by-length
   (or explicit priority field) rule in the matcher, not per-entry special-casing.
5. **6.6 Saturday Vigil readings source.** This parish's Saturday-evening Mass
   anticipates Sunday, so the day-liturgy fetch (R37) needs different readings on
   Saturdays depending on what's actually being celebrated that day: if Saturday is
   itself a Solemnity/Feast/Memorial, use Saturday's own readings (its proper
   celebration takes precedence); otherwise (an ordinary/ferial Saturday) fetch
   Sunday's readings instead, since that's what's proclaimed at the vigil. Liturgia
   API v3 has no structured rank field for this — rank only appears as free text
   inside the celebration's `liturgia` name (e.g. "Memória Facultativa"), so
   `liturgyApi.js` does a keyword check (`solenidade`/`festa`/`memoria`) over that
   string after fetching Saturday's `principal` celebration, falling back to a
   second fetch for Sunday's date when no rank keyword is found (or Saturday's date
   has no liturgy at all). Non-Saturday days are unaffected — they fetch their own
   date as before.

## 7. Tech Choices (unchanged from spec)

STT = Web Speech API (pt-BR); TTS = Web Speech Synthesis (en-US); live translation =
MyMemory; day liturgy = Liturgia API v3; static hosting, no build step, no backend.
See `spec.md` Tech Stack table and Constraints for rationale and risks (iOS/Safari STT
risk, network dependency, MyMemory rate limits, no speaker diarization).
