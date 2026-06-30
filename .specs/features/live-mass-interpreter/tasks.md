# Tasks: Live Mass Interpreter

Ordered, traceable work items derived from `design.md` and `spec.md`. Each task lists the
requirements it satisfies. Tasks are grouped into phases that can be largely done in
order; within a phase, items are mostly independent. Nothing here is implemented yet —
this is the execution plan, pending the user's go-ahead to start coding.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

## Phase 0 — Project scaffold
- [ ] **T0.1** Create the static web app skeleton: `index.html`, `styles.css`, entry JS,
  no build step, no backend. _(R7)_
- [ ] **T0.2** Minimal audio-first UI: Start/Stop control, a status line (listening /
  idle / error), and a collapsed `<details>` debug transcript. _(R6, R7)_

## Phase 1 — Capture & speak (the audio spine)
- [ ] **T1.1** `stt` module: wrap `SpeechRecognition` (pt-BR, `continuous`,
  `interimResults`), emit finalized segments; expose start/stop. _(R1)_
- [ ] **T1.2** `normalize` util: lowercase, strip accents/punctuation to a comparable
  matching form. _(R3, R36)_
- [ ] **T1.3** `speech` module: serialized speech queue + `SpeechSynthesis` (en-US)
  playback so utterances don't overlap. _(R5)_
- [ ] **T1.4** Stop control wired to flush the queue and cancel in-progress speech
  immediately (not "after current sentence"). _(R9b)_

## Phase 2 — Ordinary fixed catalog
- [ ] **T2.1** Author `catalog.ordinary` data (port/clean the prior `liturgy.js` set):
  keyword(s) + EN title + EN text + explanation per fixed part. _(R2)_
- [ ] **T2.2** Reflect this parish's actual wording: opening invocation, greeting form,
  Orai-irmãos, final blessing. Remove the sung `gloria` entry (sung → not translated).
  _(R11, R15, R17, R28, R34)_
- [ ] **T2.3** Router step 1: match normalized segment against the Ordinary catalog and
  speak the pre-authored EN instantly. _(R3)_
- [ ] **T2.4** Ensure spoken introductions/commentary have NO fixed entry and fall
  through to the live path. _(R12)_

## Phase 3 — Live fallback translation
- [ ] **T3.1** `translate` module: PT→EN via MyMemory on the unknown/fallback path. _(R4)_
- [ ] **T3.2** Router step 5: anything unmatched (homily, etc.) → live translate → speak,
  with acceptable 2–5s delay. _(R4)_
- [ ] **T3.3** Graceful failure handling: on API error/timeout/rate-limit, skip the
  segment + surface a non-blocking status, never throw or stall the queue. _(R9)_

## Phase 4 — Dedup & priest-repeat
- [ ] **T4.1** `dedupGuard`: rolling memory of recently-spoken normalized segments; drop
  duplicates/contained-overlaps. _(R10)_
- [ ] **T4.2** Repeat-cue detection ("repitam", "repita comigo", "todos juntos"…) that
  bypasses the guard for the next utterance. _(R10)_

## Phase 5 — Day liturgy (readings/psalm/gospel)
- [ ] **T5.1** `liturgy` module: on startup fetch `GET /v3/{dd-mm-yyyy}` (assume Sunday
  celebration), reduce to readings/psalm/gospel, cache in memory. _(R35, R37)_
- [ ] **T5.2** Startup error handling: 404/network failure → run with no pre-fetched data
  (fully-live path), no crash. _(R37)_
- [ ] **T5.3** Router step 3 with R36 verify-before-trust: identify which cached reading
  the live opening words correspond to; if found speak its EN, else fall through to live
  translation. Binary found-or-not, no similarity score. _(R36)_
- [ ] **T5.4** Reading EN strategy: lazy translate-on-first-match + cache (per design note
  6.1). Mark the psalm `sung` → stay quiet. _(R20, R36)_

## Phase 6 — Missal catalogs (from the Missal PDF)
- [ ] **T6.1** Define the indexed JSON shape (keyed object, opening-words key → {id,
  label, keywords, pt, en}) shared by all Missal catalogs. _(R38)_
- [ ] **T6.2** Extract PT texts from the reference Missal PDF (`missal-romano-2023-pdf.pdf`,
  Drive link in spec) for: Coleta, Prefácio, Oração Eucarística, Rito da Comunhão,
  Pós-Comunhão. _(R38 sourcing, R39a–R39d, R39f)_
- [ ] **T6.3** Produce EN per entry: official ICEL/USCCB where it exists (Prefaces, EP
  I–IV); one-time pre-translation stored in the JSON where it doesn't (EP V). _(R41)_
- [ ] **T6.4** Author `credo.json` (long Nicene Creed) from the PT + official ICEL EN
  already captured in spec R40; keyword on "creio em um so deus". _(R40)_
- [ ] **T6.5** Router step 2: match opening words against the Missal catalogs and speak
  the indexed EN instantly; Eucharistic Prayer variant identified live, never defaulted.
  _(R30, R38)_

## Phase 7 — Preface smoothing (open requirement)
- [ ] **T7.1** R8: buffer the preface's variable body to group output by complete
  clauses/sentences instead of per-`isFinal` chunk; verify by listening to a recorded
  sample. _(R8)_

## Phase 8 — End-to-end validation
- [ ] **T8.1** Dry-run against a recorded/simulated Mass audio: confirm fixed parts fire
  instantly, readings get identified-or-fall-back, homily translates live, hymns stay
  quiet. _(Success Metrics)_
- [ ] **T8.2** Real-device check on mobile Chrome (Android); note iOS/Safari STT status.
  _(Constraints)_
- [ ] **T8.3** Author `validation.md` recording results against the spec's acceptance
  criteria (R8/R9/R10) and Success Metrics.

## Dependency notes
- Phases 0→1 first (nothing works without capture+speak).
- Phase 2 (Ordinary) and Phase 3 (live fallback) give a usable minimum on their own.
- Phase 5 needs Phase 1–3 in place (it reuses the router + fallback).
- Phase 6 is the heaviest content effort (PDF transcription + EN sourcing) and can run in
  parallel with others once T6.1's shape is fixed.
- Phases 7–8 are last (refinement + validation).

## Not in this plan (out of scope per spec)
Twi/Akan output, native app, offline mode, multi-user/server-synced session, full
liturgical-season preface DB beyond what the Missal catalogs cover, speaker diarization.
