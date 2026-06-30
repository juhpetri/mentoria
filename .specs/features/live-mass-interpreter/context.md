# Context: User Decisions on Ambiguities

Decisions made during spec discussion with the user (2026-06-30), in chronological order.

1. **Solution shape**: rejected on-screen translated text (already exists via projector
   datashow) in favor of audio narration through earphones — the user's stated goal is
   active participation by ear, not reading.
2. **Delay tolerance for variable content**: a few seconds of delay (simultaneous
   interpreter style) is acceptable; near-instant was explicitly NOT required, which
   rules out needing fully local/offline ML models for the prototype.
3. **Target output language**: English (Ghana's official language), not Twi/Akan, for
   this iteration — chosen over Twi/Akan due to far better TTS/translation API quality
   and broader comprehension.
4. **Platform**: web app/PWA, no native app install — chosen for zero-friction access
   via link/QR code in church.
5. **Fixed vs. variable split**: confirmed the user's own proposed architecture —
   pre-script and instantly speak the fixed Ordinary-of-the-Mass parts; live-translate
   only the parts that change weekly (readings, homily, preface body). This shaped R3/R4.
6. **Detection mechanism clarified to user**: confirmed it's keyword/substring matching
   on the live transcript, not voice/speaker recognition — the app does not identify
   "who" is speaking, only "what" was said.
7. **Preface example surfaced an open question**: the user asked specifically how the
   variable preface body is handled, which led to identifying R8 (sentence-boundary
   choppiness) as an explicit open risk rather than an assumption.
