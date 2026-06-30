# Spec: Live Mass Interpreter

## Problem
Ghanaian immigrant Catholics attend Mass weekly but don't speak Portuguese. They are
present but unable to follow or actively respond. An on-screen translated text already
exists (projector) but doesn't solve active participation — they need to understand the
priest's spoken words and respond, the way a fluent worshipper does, by ear.

## Goal
A worshipper wearing earphones hears the Mass narrated/translated in English, in real
time, synchronized closely enough with the live celebration to respond when expected
(say "Amen," join the Our Father, etc.).

## Scope
- **In scope**: browser-based prototype, Portuguese (Brazil) speech input, English audio
  output, fixed Ordinary-of-the-Mass parts pre-scripted, variable parts (readings,
  homily, preface body) translated live.
- **Out of scope (for this iteration)**: Twi/Akan output, native mobile app, offline
  mode, multi-user/server-synced sessions, liturgical seasons/seasons-specific prefaces
  database, voice/speaker diarization (distinguishing priest vs. lector vs. assembly).

## Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| R1 | The app SHALL capture the priest's spoken Portuguese continuously via the device microphone using the browser's speech recognition. | Done (`app.js`, `recognition.continuous = true`) |
| R2 | The app SHALL maintain a catalog of the fixed Ordinary-of-the-Mass parts, each with: detection keywords (PT), an English title, an English response, and a plain-language explanation of why that response exists. | Done (`liturgy.js`, 19 parts) |
| R3 | When the live transcript matches a fixed part's keywords, the app SHALL speak the pre-authored English text immediately (no translation API call), so the worshipper hears it without added latency. | Done (`showAndSpeakPart` in `app.js`) |
| R4 | When a finalized transcript segment does NOT match any fixed part, the app SHALL treat it as variable content (reading/homily/preface body), translate it via a translation API, and speak the English result, with a delay understood to be acceptable (target: 2-5s end to end). | Done (`handleFreeSpeech` / `translatePtToEn`) |
| R5 | Spoken English output SHALL be queued so overlapping segments do not talk over each other. | Done (`speechQueue` / `pumpSpeechQueue`) |
| R6 | The interface SHALL foreground audio as the primary experience; any on-screen text is secondary/debug, not the primary way of following Mass. | Done (`index.html` — transcript is inside a collapsed `<details>`) |
| R7 | The app SHALL run as a no-install web page accessible via a link/QR code, requiring only microphone permission. | Done (static HTML/JS/CSS, no backend) |
| R8 | The Preface's variable body SHALL be translated with sentence boundaries that don't choppily cut mid-clause more often than the current naive `isFinal`-boundary approach. | **Open — not yet resolved** |
| R9 | If the translation API call fails or is rate-limited, the app SHALL degrade gracefully (e.g. skip that segment, optionally notify) rather than silently losing audio with no indication. | **Open — not yet resolved** |
| R10 | The app SHALL avoid re-translating/re-speaking duplicate or overlapping finalized transcript segments. | **Open — not yet resolved** |
| R11 | The fixed-part catalog SHALL reflect this specific parish's actual missal/local wording (e.g. opening invocation, greeting response form), not generic textbook Mass text, since parishes vary in which optional forms they use. | Done for the opening sequence (`invocacao-inicial`, corrected `saudacao`) based on the parish bulletin "O Povo de Deus" (Arquidiocese de Brasília); rest of catalog not yet cross-checked against this bulletin. |
| R12 | Spoken introductions that precede other parts (e.g. the commentator's remarks before readings) SHALL NOT be treated as fixed text, even though they recur structurally every week — their content changes, so they always go through the live-translation path (R4), never the instant-fixed path (R3). | Done — by design, no keyword entries are created for these; documented as an explicit rule rather than left as an accidental gap. |

## Acceptance Criteria (for open requirements R8-R10)
- **R8**: Given a preface body of 3+ sentences spoken at a normal pace, the live English
  audio groups translated output by complete clauses/sentences more often than the
  current per-`isFinal`-chunk approach, verified by manual listening test against a
  recorded sample preface.
- **R9**: Given a simulated translation API failure (mocked 500/timeout), the app does
  not throw an unhandled error, logs the failure, and continues listening for the next
  segment without blocking the speech queue.
- **R10**: Given two consecutive `onresult` events where the second's final text fully
  contains the first's already-spoken final text, the app does not speak the overlapping
  portion twice.

## Non-Goals
- Perfect translation quality for theological/liturgical vocabulary (best-effort via
  general-purpose translation API).
- Support for multiple simultaneous listeners with different target languages (English
  only, for now).

## Tech Stack / What We're Using

| Concern | Choice | Why |
|---------|--------|-----|
| Speech-to-text (priest's Portuguese) | Browser `SpeechRecognition` / `webkitSpeechRecognition` (Web Speech API), `lang=pt-BR`, `continuous + interimResults` | Built into Chrome, no install, no API key, free, runs client-side. |
| Fixed-part catalog | Static JS data (`liturgy.js`) — keywords + pre-authored EN text | No runtime cost, fully reviewable/editable by a human (e.g. a priest or catechist), easy to add seasons/feasts later. |
| Translation (variable text) | MyMemory free HTTP API (`api.mymemory.translated.net`), `pt\|en` | No key required, good enough for a prototype; explicitly NOT production-grade — see R9 and Constraints. |
| Text-to-speech (English output) | Browser `SpeechSynthesisUtterance` (Web Speech Synthesis API), `lang=en-US` | Built-in, free, low latency, no extra round-trip once text is known. |
| Hosting/runtime | Static HTML/CSS/JS, no backend, no build step | Matches R7 (no-install, link/QR access); can be hosted on GitHub Pages or any static host. |
| Platform | Mobile Chrome (primary target) | Web Speech API support is inconsistent across browsers; Chrome/Chromium has the most reliable implementation on Android. Safari/iOS support is partial — see Constraints. |

## Constraints
- **iOS/Safari risk**: `SpeechRecognition` support in Safari is limited/unreliable. If
  the target users are on iPhones, this prototype may need a different STT strategy
  (e.g. a backend with a hosted STT service) — currently unverified, flagged as an
  assumption pending real-device testing.
- **Network dependency**: both STT (Google's recognition service behind the Web Speech
  API) and the translation API require an internet connection; there's no offline mode.
  Church wifi/cellular reliability is an external dependency outside this app's control.
  No requirement defined yet for "Sunday network unreliable" — left as Non-Goal because
  no offline path is in scope for this iteration.
- **MyMemory rate limits**: the free tier has daily usage caps and not guaranteed
  uptime/SLA — acceptable for a single-user prototype, not for parish-wide rollout
  without revisiting (tracked as a future scaling concern, not blocking this spec).
- **No speaker diarization**: the app cannot tell the difference between the priest,
  a lector, a cantor, or background assembly noise — it reacts to whatever the
  microphone picks up as Portuguese speech. A noisy church or someone else's voice can
  trigger a false match or feed garbage into translation.

## Success Metrics (manual, prototype stage)
- A volunteer who doesn't speak Portuguese can sit through one full Mass with the app
  running and earphones in, and afterward correctly state when to say "Amen," join the
  Our Father, and exchange the sign of peace, based on audio cues alone (no screen
  reading).
- During the homily, the listener can summarize at least the general topic, even if
  some sentences were garbled or delayed.
