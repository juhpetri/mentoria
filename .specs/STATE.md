# Project State

## Project
**mentoria** — Live Mass Interpreter: a browser app that lets non-Portuguese-speaking
worshippers (initially Ghanaian Catholic immigrants) hear the Mass in English in real
time through earphones, instead of reading translated text on a screen.

## Active Feature
`live-mass-interpreter` — see `.specs/features/live-mass-interpreter/`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-30 | Output is audio (TTS in earphone), not on-screen text | User explicitly wants worshippers to listen, not read — on-screen translated text already exists as a solution and doesn't meet the goal of active participation by ear. |
| 2026-06-30 | Target language: English | Official language of Ghana, widely understood, best TTS/translation API quality. Twi/Akan considered but deferred — TTS/translation quality for it is much weaker. |
| 2026-06-30 | Platform: web app / PWA, no install | Lowest friction — accessed via link/QR code, works in mobile Chrome. |
| 2026-06-30 | Fixed Mass parts (Ordinary) detected by keyword-matching the live PT transcript, spoken instantly from a pre-written EN script (no translation round-trip) | The Ordinary of the Mass (greetings, Creed, Our Father, Sanctus, etc.) is structurally fixed and repeats every Sunday — pre-authoring the EN text removes translation latency for the parts worshippers need to respond to in real time. |
| 2026-06-30 | Variable parts (readings, homily, preface body) translated live via translation API + browser TTS, with a few seconds of acceptable delay | Content changes weekly, can't be pre-scripted. User explicitly accepted "simultaneous interpretation" style delay (2-5s). |
| 2026-06-30 | Detection is text-keyword-based on STT output, not voice/speaker recognition | Web Speech API only provides a transcript; matching is done by substring search of known liturgical phrases against the normalized transcript. |

## Known Open Risks (not yet resolved)
1. The Preface (prefácio) has a fixed opening dialogue (matched/instant) but a variable
   body (translated live) — current sentence-splitting relies on the browser's natural
   pause detection (`isFinal` results), which may cut mid-sentence on a fast or long
   preface and produce a choppier live translation.
2. No fallback defined yet for translation API failure/rate-limit (MyMemory free tier).
3. No de-duplication/repeat-guard for free-speech translation if STT re-emits overlapping
   finalized segments.

## Handoff State
Prototype implemented and pushed to branch `claude/immigrant-mass-participation-krtsy9`
(commit `78a5009`). Spec phase started for `live-mass-interpreter` to formalize
requirements and plan resolution of the open risks above.
