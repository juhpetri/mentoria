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
| R9b | The app SHALL provide a way to **stop the translation** at any moment (manual stop control) — stopping both listening and any queued/in-progress spoken output immediately, so the worshipper can silence it when desired. | **RESOLVED (requirement) — see decision below; not yet implemented.** |
| R10 | The app SHALL avoid re-translating/re-speaking duplicate or overlapping finalized transcript segments, **except** when the priest explicitly asks the assembly to repeat a phrase — in that case the repetition SHALL be translated/spoken again. | **RESOLVED (requirement) — see decision below; not yet implemented.** |
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

## Full Catalog Review — against "O Povo de Deus" bulletin (Arquidiocese de Brasília)

Cross-checking every part of the bulletin against the catalog. Classification rule:
**Fixed** = same words every week, safe to pre-script and speak instantly (R3 path).
**Variable** = content changes weekly even if the structural moment recurs, must go
through live translation (R4 path). **Mixed** = part has both a fixed shell and a
variable core (e.g. fixed introduction formula + variable body).

| ID | Bulletin item | Bulletin tag | Classification | Notes / what needs deciding before implementing |
|----|--------------|--------------|-----------------|---------------------------------------------------|
| R13 | Canto de Entrada | (sung, no tag shown) | Variable | Entrance hymn changes weekly/by season — no fixed entry; relies on live translation, which will be slow/awkward for sung lyrics. Open question: do we even want to translate hymns, or just stay silent during music and resume on spoken parts? |
| R14 | Comentário Inicial | — | Variable | Already correctly excluded (R12). No action. |
| R15 | Invocação Inicial + Saudação Inicial | cantado | Fixed | Already corrected in `liturgy.js` (commit `fbc2c1f`). No further action unless wording drifts. |
| R16 | Ato Penitencial | cantado | **RESOLVED — do not translate** | Sung at this parish — falls under the hymn policy (decision #2): no catalog entry, app stays quiet through it. No keyword/script needed. |
| R17 | Hino do Glória | cantado | Fixed | Catalog already has `gloria`, but only the opening line as keyword/response. Full sung text is much longer — current entry under-represents it. **Decision needed**: expand the spoken/sung response to the full Gloria text, or keep it abbreviated since it's primarily sung (and singing isn't well served by our speech-trigger approach anyway)? |
| R18 | Coleta (Opening Prayer) | missal | Variable, NOT Fixed | Important correction to my earlier assumption: despite "read from the Missal," the Collect's text is proper to each Sunday/feast — it changes every week. Catalog's existing `oracao-coleta` entry only has the trigger word "Oremos" and a generic "Amém" response — that part (the cue + assembly's Amen) IS fixed and fine to keep, but the prayer body itself must NOT be pre-scripted; it should fall through to live translation. No code is currently mis-scripting this, just flagging so it isn't "fixed" by mistake later. |
| R19 | Primeira Leitura | leicionário | Variable | Confirmed already correct — `liturgy.js`'s `leitura` entry only fixes the closing "Palavra do Senhor / Graças a Deus" exchange, not the reading body. No action. |
| R20 | Salmo Responsorial | cantado | Mixed | The refrain ("A todo homem que procede retamente...") repeats several times within one Mass but changes week to week; the verses always change. **Decision needed**: is it worth detecting "the psalm refrain just repeated" as a structural cue (without knowing its specific words in advance) to, e.g., pause/resume translation pacing — or just treat the whole psalm as ordinary variable speech? Currently no entry exists either way (no action taken, just surfacing the question). |
| R21 | Segunda Leitura | leicionário | Variable | Same as R19 — confirmed correct, no action. |
| R22 | Aclamação ao Evangelho | cantado | **RESOLVED — do not translate** | Sung — falls under the hymn policy (decision #2): no `aleluia` entry, app stays quiet. The Gospel introduction/acclamation formula spoken by the priest (R23, `evangelho`) is separate and stays as a fixed entry. |
| R23 | Evangelho | evangeliário | Mixed | Catalog's `evangelho` entry already correctly covers only the fixed introduction/acclamation formula ("Evangelho de Nosso Senhor Jesus Cristo... Glória a vós, Senhor"), not the Gospel text itself (which is variable and goes to live translation). No action — already modeled correctly. |
| R24 | Homilia | in live | Variable | Already correctly excluded — no fixed entry, by design (consistent with R12). No action. |
| R25 | Profissão de Fé (Credo) | fixo | Fixed | Catalog's `credo` entry has the opening line only; full Creed is long. Same decision as R17 (Gloria): expand to full text, or keep abbreviated? |
| R26 | Oração dos Fiéis | (preces espontâneas noted) | Mixed | Catalog's `oracao-fieis` entry covers the fixed response cue reasonably, but this bulletin shows 4 pre-printed intercessions PLUS a slot for spontaneous ones from the assembly — the response phrase itself ("Salvai, Senhor, ouvi o vosso povo") is fixed and worth keeping; the intercession texts are always variable. Current entry's wording ("Senhor, escutai a nossa oração") doesn't match this bulletin's actual refrain ("Salvai, Senhor, ouvi o vosso povo") — **correction needed** (not yet made; documenting only). |
| R27 | Apresentação dos Dons | cantado | Conflict to resolve | This parish sings a specific offertory hymn ("Esta mesa santa que preparamos... Oh, recebe, Senhor!") with its own refrain — different from the catalog's current generic liturgical response ("Bendito seja Deus para sempre"). **Decision needed**: which should the app prioritize — the official liturgical dialogue (universal, but not what's actually sung here) or this parish's specific hymn refrain (accurate to here, but only useful for this parish and would need a hymn-keyword catalog of its own)? |
| R28 | Orai, Irmãos e Irmãs | (tag illegible/inconsistent in source scan) | Fixed | Catalog's `orai-irmaos` entry matches the universal Missal text seen in this bulletin word for word. No action. |
| R29 | Sobre as Oferendas (Prayer over the Offerings) | fixo | **Likely Variable, tag is misleading** | Same trap as R18 (Coleta): this prayer is proper to the Sunday even though the bulletin labels it "fixo." Needs confirmation — possibly "fixo" in the bulletin's legend means "read fixed from the missal text in front of the priest" (i.e., not improvised) rather than "same text every week." **Decision needed**: clarify what the bulletin's own tags ("fixo"/"missal"/"novo missal romano") actually mean before trusting them as our Fixed/Variable signal — they may track "where the priest reads from," not "does the text repeat." |
| R30 | Oração Eucarística | novo missal romano | Fixed, but variant must be identified live | Catalog's existing `prefacio`/`santo`/`consagracao`/`pai-nosso` entries are written generically across any Eucharistic Prayer. This specific bulletin happened to show Eucharistic Prayer V, but **the app must not assume a single fixed EP** — see decision #4 (corrected): it must identify, from the priest's opening words, which of the Eucharistic Prayers (I-V, etc.) is being prayed that Mass, the same way Preface variants are identified (R38), and speak the matching pre-authored text. |
| R31 | Depois da Comunhão (Prayer after Communion) | missal | Variable | Same pattern as R18/R29 — proper-to-the-day text despite the "missal" tag. No fixed entry should be created for the prayer body. |
| R32 | Oração Vocacional | (recited together, no tag) | Likely Fixed | Bulletin text ("Rezemos juntos: Nós vos rogamos, ó Bom Jesus...") reads like a standing prayer this parish recites regularly, not proper to the specific Sunday. **Decision needed**: confirm with the parish whether this prayer is always the same text before adding it as a fixed entry. |
| R33 | Breves Avisos (announcements) | — | Variable | Always different content; correctly has no fixed entry. No action. |
| R34 | Bênção Final | — | Fixed | Catalog's `bencao-final` entry already models this reasonably; this bulletin's text matches closely enough. No action, low priority to double check wording exactly. |

## Decisions Resolved (2026-06-30, second round)

1. **Bulletin tag semantics (resolves R18, R29, R31) — RESOLVED**: "missal" and "novo
   missal romano" mark prayers that ARE fixed text — they don't change year to year for
   a given liturgical day, they're proper-to-the-day-but-fixed, not improvised or
   variable in the sense of "different every time." Decision: these SHOULD be
   pre-translated, but keyed to the day's specific liturgy (the Collect for the 10th
   Sunday in Ordinary Time, Year A, is always the same text, but differs from the
   Collect for other Sundays). **This changes the architecture**: unlike the Ordinary
   parts (one fixed catalog entry, same every week), these need a **calendar-aware
   lookup** — see new requirement R35 below.
2. **Hymn / sung-content handling (resolves R13, R16, R20, R22, R27) — RESOLVED**: do not
   translate any sung content at all — entrance hymn, **Ato Penitencial (sung here)**,
   psalm verses, **Gospel Acclamation / Aleluia (sung)**, the offertory hymn. No fixed
   entries, no live-translation attempts for these. The app simply stays quiet/idle
   through music. (The spoken Gospel introduction formula by the priest, R23, is NOT
   sung and stays as a fixed entry.)
3. **Abbreviated vs. full fixed text (resolves R17, R25) — RESOLVED, correcting an
   earlier note**:
   - Gloria: **cantado — não traduzir**, same as the sung/hymn policy in decision #2.
     Earlier in this doc it was reasoned that because the Gloria is official fixed
     Ordinary text it should be translated fully despite being sung — the user
     corrected this: it stays untranslated, full stop, regardless of whether the text
     is "official" or not. The existing `gloria` entry in `liturgy.js` (which currently
     speaks an English line when matched) is now out of date with this decision and
     should be removed/disabled when catalog code changes are implemented — flagged
     here, not yet done, per "spec first, no code" instruction.
   - Creed: the assembly normally uses the **abbreviated Creed** (Apostles' Creed,
     "Creio em Deus Pai todo-poderoso...") — keep as the default fixed entry. On
     liturgical solemnities the **longer Nicene Creed** is used instead
     ("Creio em um só Deus, Pai todo-poderoso, criador do céu e da terra, do universo
     visível e invisível...") — distinguishable by its different opening words, so it
     needs its own separate fixed catalog entry (own keywords + own full EN text), not
     a variant of the same entry.
4. **Eucharistic Prayer specificity (resolves R30) — CORRECTED**: do NOT hardcode a
   single Eucharistic Prayer (e.g. always EP V). The app must identify, live, **which**
   Eucharistic Prayer the priest is actually praying that particular Mass (priests may
   rotate between EP I-V depending on the day/season), the same identify-by-opening-words
   approach as any other catalog variant (R38). EP V being "currently in use here" was
   only an observation from one bulletin, not a fixed assumption to build against.
5. **R26 (Prayer of the Faithful response) — CORRECTED**: never translate or speak any
   audio for this response, under any circumstance — do not fall back to a "default"
   response text either, since the exact wording varies by parish/Mass (this bulletin's
   "Salvai, Senhor, ouvi o vosso povo" is not to be hardcoded as a universal fallback).
   The response is always shown in Portuguese on the datashow and the worshipper
   responds in Portuguese directly. This moment is permanently out of scope for audio
   translation, not just deprioritized.

## New Requirement Surfaced by Decision #1 and #4

| ID | Requirement | Status |
|----|-------------|--------|
| R35 | The app SHALL be able to look up and pre-translate the liturgical-day-specific fixed prayers (Coleta/Opening Prayer, Oração sobre as Oferendas, Oração Depois da Comunhão) and the parish's chosen Eucharistic Prayer (currently EP V), keyed to the calendar date / liturgical day, rather than relying on live translation for these. | **Open — needs a data source.** These texts are not in `liturgy.js` today and are not generic across weeks like the Ordinary parts. Needs a content source (e.g. transcribing each week's bulletin in advance, or a liturgical-calendar API/database of the Roman Missal's propers) — this is a content/data-sourcing problem as much as a code one, and should be scoped as its own design discussion before implementation (where do the day's texts come from, who maintains them, how far in advance). |

## R35 Data Source — RESOLVED (readings + Coleta)

User-proposed source: **Liturgia API v3** (https://github.com/Dancrf/liturgia-diaria,
hosted at `https://liturgia.up.railway.app/v3/`). Confirmed via its README that it
covers what we need for the day-specific fixed texts:

- Query by date: `GET /v3/{day}-{month}-{year}` (or current day, or a date range up to
  7 days). No auth, no documented rate limit.
- Each celebration in the response includes **full prayer texts** for Coleta (opening
  prayer), Oferendas (offertory prayer), and Comunhão (post-communion prayer) — covers
  R18, R29, R31 directly.
- Each celebration also includes **Leituras** (first reading, responsorial psalm,
  Gospel) with full `texto`, biblical reference, and (for the psalm) the `refrao` —
  covers R19/R21 (readings) and gives us the psalm refrain text for R20, although per
  the sung-content decision (#2) we are not translating the psalm itself.
- Does **not** appear to include the Eucharistic Prayer text (that's outside the daily
  Lectionary/Missal-propers scope this API targets) — Eucharistic Prayer V text still
  needs to be transcribed/authored separately and stored as static fixed text in the
  app, since the EP texts themselves don't change day to day (only which EP is chosen
  might, and this parish has told us they consistently use EP V).
- 404 is returned for a date with no defined liturgy — needs basic error handling when
  fetching (fall back to fully-live translation for that day if the lookup fails).

## R36 — New Requirement: Verify Before Trusting Pre-Fetched Text

The user added an important safety rule: **the app must not blindly speak the
pre-fetched/pre-translated text just because the calendar date matched** — it must
first confirm that what the priest is actually reading matches what the API returned
for that day, and only then play the pre-translated audio. If the live transcript
diverges from the expected pre-fetched Portuguese text (e.g. the priest chooses a
different optional reading, reads from a different lectionary cycle, or simply isn't at
that part yet), the app must fall back to the normal live STT → translate → speak path
for that content instead of the pre-scripted one.

| ID | Requirement | Status |
|----|-------------|--------|
| R36 | Before speaking a pre-fetched/pre-translated reading or day-specific prayer (Coleta/Oferendas/Comunhão), the app SHALL compare the live transcript against the corresponding pre-fetched Portuguese source text; if they sufficiently match, speak the pre-translated English; if they diverge, fall back to live translation (R4) for that segment instead. | **Open — design needed.** Requires deciding a matching strategy (e.g. compare the opening N words of the live transcript against the opening N words of the pre-fetched text, fuzzy/substring match, similarity threshold) and what "diverge" means in practice (the priest pausing mid-sentence is not the same as reading a different text entirely). Not yet designed or implemented. |

## R36 Matching Strategy — RESOLVED

User's answer: keep it simple, no fuzzy-similarity scoring. The strategy is
**identify-by-reading, fail open to live translation**:

1. On startup, the app always assumes the **Sunday celebration** (this app's use case
   is specifically the Sunday Mass this community attends) and fetches that day's
   liturgy from the Liturgia API immediately on load.
2. The fetched Coleta / readings / Oferendas / Comunhão texts are cached in memory
   (client-side, no backend — see R37 below) for the duration of the session, to be
   compared against as Mass proceeds.
3. When the live transcript reaches a reading (e.g. after the lector's "Leitura da
   Profecia de..." cue), the app tries to identify which pre-fetched reading is being
   read.
4. **If found** (the live transcript corresponds to one of the cached options): speak
   the pre-translated English for that reading.
5. **If NOT found** (no match against what was cached for that day): immediately treat
   it as live content from that point on — fall through to the normal live STT →
   translate → speak path (R4), same as today, no special handling needed beyond "we
   tried, it didn't match, so just translate live."

This avoids needing a similarity-threshold algorithm — it's a binary
found-in-cache-or-not check, and the safe fallback (live translation) is already built
and proven (R4), so a missed match just means slightly more latency for that segment,
never silence or wrong content.

## R37 — New Requirement: Startup Fetch & Cache

| ID | Requirement | Status |
|----|-------------|--------|
| R37 | On app startup, the app SHALL fetch the current day's liturgy from the Liturgia API (e.g. `GET https://liturgia.up.railway.app/v3/{day}-{month}-{year}`, assuming today is the Sunday celebration being attended) and cache the returned Coleta, readings, Oferendas, and Comunhão texts in memory for comparison/lookup during the live session (per R36). | **Open — not yet implemented.** Needs: (a) where exactly to store the cache (a simple in-memory JS object/module-level variable is enough given no backend/no persistence requirement), (b) graceful handling of a 404/network failure on startup (per R35, falls back to fully-live translation with no pre-fetched data available at all, not just for one segment). |

## R38 — New Requirement: Structured Catalogs for Preface and Eucharistic Prayer Variants

The Missal doesn't have just one Preface or one Eucharistic Prayer — there are dozens of
Prefaces (one per liturgical season/feast/occasion) and several Eucharistic Prayers
(I, II, III, IV, V, plus reconciliation/various-needs forms). Earlier decisions (#4,
Eucharistic Prayer authoring) assumed a single hardcoded EP V. The user's refinement:
instead, build **structured JSON catalogs** — one for Prefaces, one for Eucharistic
Prayers — where each variant is identifiable from the priest's opening words, the same
keyword-matching principle already used in `liturgy.js` for the Ordinary, but scaled out
to cover every variant that exists rather than just the one this parish currently uses.

This generalizes (and supersedes) the earlier "just author EP V" plan: build the
catalog data-structure once, populate it progressively (starting with EP V since that's
confirmed in use here), and the same identify-or-fall-back-to-live logic from R36
applies — if the opening words don't match any known Preface/EP variant, fall through to
live translation for that one, same fail-open behavor.

| ID | Requirement | Status |
|----|-------------|--------|
| R38 | The app SHALL maintain structured JSON catalogs for Preface variants and Eucharistic Prayer variants (separate from `liturgy.js`'s Ordinary catalog), each entry keyed by detection keywords from the variant's opening words, with full PT/EN fixed text, so the specific variant in use can be identified live from the priest's speech and spoken instantly once matched — **no variant (e.g. EP V) is assumed as default; the catalog must let the app distinguish between all variants present in the Missal.** | **Open — not yet implemented.** Needs: (a) decide file structure/location (e.g. `prefacio.json` + `oracao-eucaristica.json`, indexed for fast lookup — see R39 sourcing below), (b) decide initial coverage (start with EP V only, expand later, vs. attempt full coverage from day one), (c) source the official PT/EN texts for each variant to populate the JSON (CNBB Missal for PT, ICEL/USCCB approved English translation for EN). |

## R38 Scope & Sourcing — Decision + Research Findings (2026-06-30)

User's answer: build the **full catalog** from the start (not just EP V + Ordinary Time),
sourced from an **existing digital source** rather than manual transcription where
possible. Research findings change what's actually feasible:

- **No single ready-made bilingual source exists.** There is no GitHub/API project that
  has all ~81 Roman Missal Prefaces and all Eucharistic Prayers in structured PT+EN
  JSON. PT texts are scattered across PDFs (e.g. liturgia.pt's `ordinario.pdf`) and
  liturgy blogs (e.g. "Hoje é dia de Liturgia"); collecting them is a manual
  curation/scraping effort, not an API integration like R35/Liturgia API v3 was for
  daily readings.
- **Eucharistic Prayer V has no official English text.** USCCB's (US Roman Missal)
  officially numbered Eucharistic Prayers are only I-IV, plus separately-named forms
  (Reconciliation I-II, Masses with Children I-III, Various Needs and Occasions I-IV).
  What this parish calls "Oração Eucarística V" appears to be a CNBB (Brazilian Bishops'
  Conference)-specific text, approved by Rome for use in Brazil but with **no official
  ICEL/USCCB English translation** to source. This is a real constraint, not just a
  sourcing inconvenience: any English text we use for EP V will be **our own
  translation** (e.g. run once through the same translation API used live, or
  human-translated), not an official Church-approved English wording.
- **Practical implication for R38**: "full catalog from an existing digital source" is
  not achievable as originally framed. The realistic path is a **hybrid**: PT source
  texts curated manually from the scattered PT sources above (one-time effort, then
  static JSON, same as the rest of `liturgy.js`), and EN texts either (a) sourced from
  USCCB/ICEL where an official translation genuinely exists (Prefaces and EP I-IV likely
  do have official English versions, being part of the universal Missal) or (b)
  produced via translation (non-official) where it doesn't (EP V specifically).

## R38 Sourcing — RESOLVED: PT from the user's own Missal (PDF)

**Reference document (authoritative PT source):**
- Title: `missal-romano-2023-pdf.pdf` (Missal Romano, 2023 edition)
- Location: Google Drive, owner juliana.a.petri@gmail.com —
  https://drive.google.com/file/d/1UVShT5StJJ83imaNYfhnRYdyXZalYUmO/view
- Size: ~97 MB. Intentionally **not committed to the repo** (large binary); referenced
  by link only. All PT catalog text (Coleta, Prefácio, Oração Eucarística, Rito da
  Comunhão, Pós-Comunhão, Credo) is transcribed/extracted from this document.

The user has their Missal as a **PDF** and will use it directly as the
**authoritative PT source** for transcription, rather than the scattered PDFs/blogs
found in research. This replaces "manual PT curation from web sources" with "manual PT
transcription from the user's own Missal PDF" — same effort shape (manual, one-time,
then static JSON), more authoritative source. EN sourcing question (official ICEL/USCCB
text where it exists vs. translated where it doesn't, e.g. EP V) remains as decided.

**File structure — RESOLVED**: one separate, indexed JSON file per catalog (not one
combined file), so lookup at runtime is fast and each file stays independently
reviewable/maintainable:
- `prefacio.json`
- `oracao-eucaristica.json`
- `rito-comunhao.json`

(`coleta.json`/`pos-comunhao.json` dropped from this list — see "R39a/R39e/R39f Sourcing —
REVISED": those two are now fetched live from the Liturgia API instead of transcribed.)

Each file's entries are indexed (e.g. by a normalized-keyword key, not a linear array
scan) so identifying which variant the priest is reading from is fast even as the
catalogs grow to cover the Missal's full set of options (all Prefaces, all Eucharistic
Prayers, etc.) — consistent with R36's identify-or-fail-open matching strategy.

## R39 — New Requirement: Full Structured JSON Catalogs from the Physical Missal

The user wants structured JSON generated for **every part of the Missal they have
available**, not just the Eucharistic Prayer/Preface pair from R38. Confirmed scope,
each as its own structured catalog (style consistent with `liturgy.js`/R38 — keyword
detection + full PT text + full EN text):

| ID | Catalog | Scope | Status |
|----|---------|-------|--------|
| R39a | Coleta (Opening Prayer) variants | Sourced live from the Liturgia API per day, not transcribed | **Done** — see "R39a/R39e/R39f Sourcing — REVISED" below; no Missal photos needed for this one. |
| R39b | Prefácio (Preface) variants | One entry per Preface in the Missal (~81 universally, however many this Missal edition contains) | Open — already scoped in R38, this confirms PT comes from the user's Missal. |
| R39c | Oração Eucarística (Eucharistic Prayer) variants | One entry per Eucharistic Prayer in the Missal (incl. "Oração V") | Open — already scoped in R38; PT now sourced from the Missal directly, resolving the earlier PT-sourcing gap. EN-for-EP-V gap (no official translation) still stands. |
| R39d | Rito da Comunhão (Communion Rite) | Fixed dialogue/prayer text in this rite | **Open — new in this message**, not previously scoped as its own catalog (R28 "Orai, irmãos" and the Lamb of God/Communion entries in `liturgy.js` cover fragments of this rite already; needs reconciling what's missing vs. already covered). |
| R39e | Oração sobre as Oferendas (Prayer over the Offerings) | Sourced live from the Liturgia API per day, not transcribed | **Done** — see "R39a/R39e/R39f Sourcing — REVISED" below; distinct from the *sung* offertory hymn moment (still covered by the hymn policy, R2, no catalog entry needed for that part). |
| R39f | Oração Pós-Comunhão (Prayer after Communion) | Sourced live from the Liturgia API per day, not transcribed | **Done** — see "R39a/R39e/R39f Sourcing — REVISED" below; no Missal photos needed for this one. |

## R39a/R39f Overlap with the Liturgia API — SUPERSEDED, see below

~~The Liturgia API's role is scoped to **Leituras, Salmos, and Evangelho only**
(first/second reading, responsorial psalm, Gospel) — not the Coleta or the
post-Communion prayer, despite the API's response technically including those fields
(per the R35 README research). Decision: ignore the API's Coleta/Oferendas/Comunhão
fields entirely; those three come **exclusively** from the user's Missal-transcribed
JSON (R39a, R39e, R39f).~~ Reversed — see "R39a/R39e/R39f Sourcing — REVISED" below:
avoiding manual Missal-photo transcription for these day-specific prayers outweighs the
small drift risk, since R36's verify-before-trust check already guards against a
mismatch (e.g. wrong edition's wording) by falling back to live translation.

## R39a/R39e/R39f Sourcing — REVISED: use the Liturgia API directly

The user confirmed: extract whatever `oracoes.coleta` / `oracoes.oferendas` /
`oracoes.comunhao` the API already returns per day instead of transcribing every
Sunday/feast's Opening Prayer, Prayer over the Offerings, and Prayer after Communion
from Missal photos. `liturgyApi.js` now caches all three prayers the same way as the
readings — PT source text + opening-words key for the R36 match, EN produced lazily on
first match via the existing translation path — so there is **no static
`coleta.json`/`oferendas.json`/`pos-comunhao.json` file at all**; the data is always
fetched fresh for the actual Mass date (including the Saturday Vigil rule, design note
6.6). Note this `oferendas` prayer is the priest's spoken text after "Orai, irmãos..."
(R28) — distinct from the offertory hymn, which this parish always sings instead of any
spoken rite dialogue (hymn policy, R2, unaffected by this change).

- **Liturgia API** → Leituras, Salmo, Evangelho, Coleta, Oração sobre as Oferendas,
  Oração Pós-Comunhão (day-specific, R35/R37/R39a/R39e/R39f).
- **Missal-transcribed JSON** → Prefácio, Oração Eucarística, Rito da Comunhão
  (R38/R39b/R39c/R39d) — these still have no API source and need the Missal PDF/photos.

## R39e vs. R27 — SUPERSEDED, see "R39a/R39e/R39f Sourcing — REVISED" above

~~This parish always sings an offertory hymn at this moment — never the spoken universal
Missal dialogue. Decision: R39e is not needed. Apply the hymn policy (R2 — don't
translate, app stays quiet) for the Rito das Oferendas moment instead of building a
Missal-JSON catalog entry for it.~~ This conflated two distinct moments: the *sung*
offertory hymn (still covered by the hymn policy, R2 — stays quiet, correct) and the
priest's *spoken* "Oração sobre as Oferendas" after "Orai, irmãos..." (R28), which does
need translating and is now sourced live from the Liturgia API (R39e, reinstated). R39
scope is now: Coleta, Oferendas, Pós-Comunhão (all three live via API), Prefácio,
Oração Eucarística, Rito da Comunhão (still Missal-photo-sourced).

## R40 — Long Creed (`credo.json`) — RESOLVED, text authored

The Nicene-Constantinopolitan Creed (used on solemnities, distinguishable from the
abbreviated Apostles' Creed by its opening words "Creio em um só Deus...") will be its
own catalog file `credo.json`, with detection keywords on the opening words and full
fixed PT + EN text below. EN is the **official 2011 ICEL English** translation — no
machine translation needed, an official version exists.

**Detection keyword (PT)**: opening "Creio em um só Deus, Pai Todo-Poderoso".

**PT (authoritative, from the user's Missal):**
> Creio em um só Deus, Pai Todo-Poderoso, criador do céu e da terra, de todas as coisas
> visíveis e invisíveis. Creio em um só Senhor, Jesus Cristo, Filho Unigênito de Deus,
> nascido do Pai antes de todos os séculos: Deus de Deus, luz da luz, Deus verdadeiro de
> Deus verdadeiro, gerado, não criado, consubstancial ao Pai. Por ele todas as coisas
> foram feitas. E por nós, homens, e para nossa salvação, desceu dos céus: e se encarnou
> pelo Espírito Santo, no seio da Virgem Maria, e se fez homem. Também por nós foi
> crucificado sob Pôncio Pilatos; padeceu e foi sepultado. Ressuscitou ao terceiro dia,
> conforme as Escrituras, e subiu aos céus, onde está sentado à direita do Pai. E de
> novo há de vir, em sua glória, para julgar os vivos e os mortos; e o seu reino não
> terá fim. Creio no Espírito Santo, Senhor que dá a vida, e procede do Pai e do Filho;
> e com o Pai e o Filho é adorado e glorificado: ele que falou pelos profetas. Creio na
> Igreja, una, santa, católica e apostólica. Professo um só batismo para remissão dos
> pecados. E espero a ressurreição dos mortos e a vida do mundo que há de vir. Amém.

**EN (official 2011 ICEL):**
> I believe in one God, the Father almighty, maker of heaven and earth, of all things
> visible and invisible. I believe in one Lord Jesus Christ, the Only Begotten Son of
> God, born of the Father before all ages. God from God, Light from Light, true God from
> true God, begotten, not made, consubstantial with the Father; through him all things
> were made. For us men and for our salvation he came down from heaven, and by the Holy
> Spirit was incarnate of the Virgin Mary, and became man. For our sake he was crucified
> under Pontius Pilate, he suffered death and was buried, and rose again on the third day
> in accordance with the Scriptures. He ascended into heaven and is seated at the right
> hand of the Father. He will come again in glory to judge the living and the dead and
> his kingdom will have no end. I believe in the Holy Spirit, the Lord, the giver of
> life, who proceeds from the Father and the Son, who with the Father and the Son is
> adored and glorified, who has spoken through the prophets. I believe in one, holy,
> catholic and apostolic Church. I confess one Baptism for the forgiveness of sins and I
> look forward to the resurrection of the dead and the life of the world to come. Amen.

Status: text is fully authored here; the actual `credo.json` file is **not yet created**
(spec-first, per standing instruction — to be generated at implementation time from this
content).

## R41 — Eucharistic Prayer / Preface EN Translation Source — RESOLVED

For the Missal-sourced catalogs where **no official English exists** (notably the
Eucharistic Prayers, e.g. EP V), the EN text is produced by **translating the user's PT
Missal PDF once, ahead of time, and storing the result indexed in the JSON** — NOT
translating live during Mass. This keeps these prayers in the instant-playback path (the
EN is already in the catalog, looked up by key), so there is no translation latency at
Mass time. The one-time pre-translation is a build/authoring step, not a runtime call.
(Where an official ICEL/USCCB English does exist — Prefaces, EP I-IV, the Creed R40 — use
the official text instead of machine translation.)

## Still-Open Decisions
(none outstanding — Ato Penitencial, Aclamação ao Evangelho, Long Creed text, and EP/
Preface EN sourcing are all resolved above. Remaining work is implementation of the
already-resolved decisions, not further decision-making.)

## R9b / R10 — Technical Behaviors — RESOLVED

- **R9b (stop translation)**: there must be a clear manual control to stop the
  translation entirely at any point — it stops capturing audio and immediately silences
  any speech that is queued or currently playing (not just "stop after the current
  sentence finishes"). This is the user's primary "make it quiet now" escape hatch,
  distinct from the app naturally going idle during hymns.
- **R10 (no double-translation, with priest-repeat exception)**: by default the app must
  NOT translate/speak the same spoken segment twice (guarding against the STT re-emitting
  overlapping finalized text). **Exception**: when the priest deliberately asks the
  faithful to repeat a phrase (a call-and-response / "repitam comigo" moment), the
  repeated utterance SHOULD be translated/spoken again rather than suppressed as a
  duplicate. Open design sub-question for implementation: how to detect "the priest asked
  for a repeat" — likely a keyword cue ("repitam", "repita comigo", "todos juntos", etc.)
  that temporarily disables the dedup guard for the next utterance.

## Success Metrics (manual, prototype stage)
- A volunteer who doesn't speak Portuguese can sit through one full Mass with the app
  running and earphones in, and afterward correctly state when to say "Amen," join the
  Our Father, and exchange the sign of peace, based on audio cues alone (no screen
  reading).
- During the homily, the listener can summarize at least the general topic, even if
  some sentences were garbled or delayed.
