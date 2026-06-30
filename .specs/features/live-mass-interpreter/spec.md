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
| R16 | Ato Penitencial | cantado | Mixed | Intro line ("Em Jesus Cristo, o Justo...") + 3x "Senhor/Cristo/Senhor, tende piedade" exchange — the exchange itself is universally fixed text, but this bulletin shows an extra priest-led intercession line before each ("Senhor, que ofereceis o vosso perdão a Pedro arrependido...") that is NOT in the current catalog. **Decision needed**: pre-script these intercession lines (they look fixed for this particular penitential form, "Forma C"), or treat the intro lines as variable since multiple Forma-C variants exist in the Missal and the priest may rotate between them? |
| R17 | Hino do Glória | cantado | Fixed | Catalog already has `gloria`, but only the opening line as keyword/response. Full sung text is much longer — current entry under-represents it. **Decision needed**: expand the spoken/sung response to the full Gloria text, or keep it abbreviated since it's primarily sung (and singing isn't well served by our speech-trigger approach anyway)? |
| R18 | Coleta (Opening Prayer) | missal | Variable, NOT Fixed | Important correction to my earlier assumption: despite "read from the Missal," the Collect's text is proper to each Sunday/feast — it changes every week. Catalog's existing `oracao-coleta` entry only has the trigger word "Oremos" and a generic "Amém" response — that part (the cue + assembly's Amen) IS fixed and fine to keep, but the prayer body itself must NOT be pre-scripted; it should fall through to live translation. No code is currently mis-scripting this, just flagging so it isn't "fixed" by mistake later. |
| R19 | Primeira Leitura | leicionário | Variable | Confirmed already correct — `liturgy.js`'s `leitura` entry only fixes the closing "Palavra do Senhor / Graças a Deus" exchange, not the reading body. No action. |
| R20 | Salmo Responsorial | cantado | Mixed | The refrain ("A todo homem que procede retamente...") repeats several times within one Mass but changes week to week; the verses always change. **Decision needed**: is it worth detecting "the psalm refrain just repeated" as a structural cue (without knowing its specific words in advance) to, e.g., pause/resume translation pacing — or just treat the whole psalm as ordinary variable speech? Currently no entry exists either way (no action taken, just surfacing the question). |
| R21 | Segunda Leitura | leicionário | Variable | Same as R19 — confirmed correct, no action. |
| R22 | Aclamação ao Evangelho | cantado | Mixed | "Aleluia, Aleluia, Aleluia" is fixed and could be spoken instantly when detected; the verse between repetitions is proper to the day (variable). Catalog has no entry for the Aleluia acclamation itself yet (only `evangelho` for the Gospel introduction). **Decision needed**: add a fixed "aleluia" entry, given it's a clear, short, highly-recognizable phrase good for keyword matching? |
| R23 | Evangelho | evangeliário | Mixed | Catalog's `evangelho` entry already correctly covers only the fixed introduction/acclamation formula ("Evangelho de Nosso Senhor Jesus Cristo... Glória a vós, Senhor"), not the Gospel text itself (which is variable and goes to live translation). No action — already modeled correctly. |
| R24 | Homilia | in live | Variable | Already correctly excluded — no fixed entry, by design (consistent with R12). No action. |
| R25 | Profissão de Fé (Credo) | fixo | Fixed | Catalog's `credo` entry has the opening line only; full Creed is long. Same decision as R17 (Gloria): expand to full text, or keep abbreviated? |
| R26 | Oração dos Fiéis | (preces espontâneas noted) | Mixed | Catalog's `oracao-fieis` entry covers the fixed response cue reasonably, but this bulletin shows 4 pre-printed intercessions PLUS a slot for spontaneous ones from the assembly — the response phrase itself ("Salvai, Senhor, ouvi o vosso povo") is fixed and worth keeping; the intercession texts are always variable. Current entry's wording ("Senhor, escutai a nossa oração") doesn't match this bulletin's actual refrain ("Salvai, Senhor, ouvi o vosso povo") — **correction needed** (not yet made; documenting only). |
| R27 | Apresentação dos Dons | cantado | Conflict to resolve | This parish sings a specific offertory hymn ("Esta mesa santa que preparamos... Oh, recebe, Senhor!") with its own refrain — different from the catalog's current generic liturgical response ("Bendito seja Deus para sempre"). **Decision needed**: which should the app prioritize — the official liturgical dialogue (universal, but not what's actually sung here) or this parish's specific hymn refrain (accurate to here, but only useful for this parish and would need a hymn-keyword catalog of its own)? |
| R28 | Orai, Irmãos e Irmãs | (tag illegible/inconsistent in source scan) | Fixed | Catalog's `orai-irmaos` entry matches the universal Missal text seen in this bulletin word for word. No action. |
| R29 | Sobre as Oferendas (Prayer over the Offerings) | fixo | **Likely Variable, tag is misleading** | Same trap as R18 (Coleta): this prayer is proper to the Sunday even though the bulletin labels it "fixo." Needs confirmation — possibly "fixo" in the bulletin's legend means "read fixed from the missal text in front of the priest" (i.e., not improvised) rather than "same text every week." **Decision needed**: clarify what the bulletin's own tags ("fixo"/"missal"/"novo missal romano") actually mean before trusting them as our Fixed/Variable signal — they may track "where the priest reads from," not "does the text repeat." |
| R30 | Oração Eucarística V | novo missal romano | Fixed (for this specific Eucharistic Prayer) | Catalog's existing `prefacio`/`santo`/`consagracao`/`pai-nosso` entries are written generically across any Eucharistic Prayer. This bulletin shows the parish specifically uses Eucharistic Prayer V (a less common option, distinct text from Prayer I-IV/II commonly assumed). **Decision needed**: keep the generic keyword approach (works across prayers since it matches universal phrases like "Santo, Santo, Santo" / "Isto é o meu Corpo") or author an EP-V-specific script for higher fidelity, accepting it'll misfire if the parish ever uses a different Eucharistic Prayer? |
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
2. **Hymn handling (resolves R13, R20, R22's variable verse, R27) — RESOLVED**: do not
   translate sung/hymn content at all (entrance hymn, psalm verses, Gospel acclamation's
   variable verse, this parish's offertory hymn). No fixed entries, no live-translation
   attempts for these. The app should simply stay quiet/idle through music.
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
4. **Eucharistic Prayer specificity (resolves R30) — RESOLVED**: keep using whichever
   Eucharistic Prayer is printed in the missal/bulletin for that day (this parish
   currently uses EP V) and attempt to pre-translate it fully, fixed — same logic as
   decision #1: these are fixed texts (one of a known, finite set in the Missal), not
   ad-libbed, so worth scripting properly rather than relying only on generic
   cross-prayer keywords (Santo, consecration words) as today.
5. **R26 (Prayer of the Faithful response) — RESOLVED, no fix needed**: the response
   text is already shown in Portuguese on the datashow, and it's short enough that the
   worshipper can read and say it in Portuguese directly — no audio translation needed
   for this specific response. Deprioritized, not a defect.

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
| R38 | The app SHALL maintain structured JSON catalogs for Preface variants and Eucharistic Prayer variants (separate from `liturgy.js`'s Ordinary catalog), each entry keyed by detection keywords from the variant's opening words, with full PT/EN fixed text, so the specific variant in use can be identified live from the priest's speech and spoken instantly once matched. | **Open — not yet implemented.** Needs: (a) decide file structure/location (e.g. `prefaces.json` + `eucharistic-prayers.json`, or one `variants/` folder), (b) decide initial coverage (start with EP V only, expand later, vs. attempt full coverage from day one), (c) source the official PT/EN texts for each variant to populate the JSON (CNBB Missal for PT, ICEL/USCCB approved English translation for EN). |

## Still-Open Decisions
- **R38 initial scope**: which Prefaces/Eucharistic Prayers to author first — just EP V
  (confirmed in use at this parish) plus the Prefaces likely to recur in Ordinary Time,
  or attempt a fuller catalog immediately?
- **R38 text sourcing**: where do the official PT and EN texts for each Preface/EP
  variant come from (manual transcription from the Missal vs. an existing digitized
  source)? Same sourcing question as the earlier EP V authoring decision, now scoped to
  many variants instead of one.
- **Long Creed catalog entry**: needs its own full English translation authored
  (Nicene Creed, standard ICEL/CNBB English text) before it can be added — not yet
  written.

## Success Metrics (manual, prototype stage)
- A volunteer who doesn't speak Portuguese can sit through one full Mass with the app
  running and earphones in, and afterward correctly state when to say "Amen," join the
  Our Father, and exchange the sign of peace, based on audio cues alone (no screen
  reading).
- During the homily, the listener can summarize at least the general topic, even if
  some sentences were garbled or delayed.
