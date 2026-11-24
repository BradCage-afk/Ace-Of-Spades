# Saathi (Team Ace Of Spades)
wHACKiest 2026, Track 2: Beyond the Browser.

A Chrome side panel that guides you through a website with spoken steps and on-page cues. **It points; you make every click.**

## Run
Needs Node 20.12+ and desktop Chrome 116+.
1. `npm start`
2. Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, pick `extension/`.
3. Open http://localhost:8787 and click the Saathi toolbar icon.
4. Tick **Recorded demo route** and ask: `apply for a scholarship`.

For live AI, copy `.env.example` to `.env`, add your own NVIDIA key, restart, and untick the recorded route.

## How it works
Goal -> page labels -> local masking -> privacy receipt -> local proxy -> MiniMax M3.1 Flash on NVIDIA NIM -> local validator -> cue -> you act -> next step.

- Field values are never included in the page snapshot.
- The model can return only `tap`, `type`, `select`, `scroll` or `pause` cues. No code path clicks or fills.
- Unknown targets, unknown cues, links and phone numbers are rejected. Sensitive fields always become `pause`.
- Voice is transcribed on this computer with Whisper. The model is downloaded from Hugging Face on first use; audio is not uploaded.
- Spoken output uses only voices installed on the computer, with captions otherwise.

## Limits
- The recorded route is scripted, not AI, and works only on the mock portal.
- Your goal and page labels do go to the AI. Masking is rule-based and misses names, addresses and unusual formats.
- Hindi and Kannada text needs fluent review; other languages are untested. Whisper base may be weak for Kannada.
- Embedded frames, closed shadow DOM, canvas and image-only labels are not read.
- Compare-options is planned, not built.

## Test
`npm test`

Uses [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) and ONNX Runtime Web, bundled in `extension/vendor/`.
