# Saathi (Team Ace Of Spades)
wHACKiest 2026, Track 2: Beyond the Browser.

A Chrome side panel that guides you through a website with spoken steps and on-page cues. **It points; you make every click.**

## Run
Needs Node 20.12+ and desktop Chrome 116+.
1. `npm start`
2. Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, pick `extension/`.
3. Open http://localhost:8787 and click the Saathi toolbar icon.
4. Tick **Recorded demo route** and ask: `apply for a scholarship`. Untick it to try the other tasks with live AI.

For live AI, copy `.env.example` to `.env`, add your own NVIDIA key, restart, and untick the recorded route.

Speed settings (optional, in `.env`): `REASONING=low` (default; set it empty to turn it off), `MAX_TOKENS=2500`. If NVIDIA answers 429/5xx or times out, the proxy retries once, then tries `BACKUP_MODEL` (set it empty to turn this off). The black window prints how long each plan took.

## How it works
Goal -> page labels -> local masking -> privacy receipt -> local proxy -> MiniMax M3.1 Flash on NVIDIA NIM -> local validator -> cue -> you act -> next step.

- Field values are never included in the page snapshot.
- The model can return only `tap`, `type`, `select`, `scroll` or `pause` cues. No code path clicks or fills.
- Unknown targets, unknown cues, links and phone numbers are rejected. Sensitive fields always become `pause`.
- Voice is transcribed on this computer with Whisper. The model is downloaded from Hugging Face on first use; audio is not uploaded.
- Spoken output uses only voices installed on the computer, with captions otherwise.

## Planning without the AI
- **Form helper:** a page with a form of two or more fields is planned on the device, instantly: unfilled fields top to bottom, then the submit button. Sensitive fields still pause. The AI is only used to find the way between pages.
- **Keyword match:** if the AI fails, Saathi points at the one link whose words best match the goal, and says so.
- The AI gets 25 s (`MAIN_SECONDS`), then the backup model gets 20 s (`BACKUP_SECONDS`).

## Mock site tasks
Scholarship application, property tax (ends at a payment pause), track application status (CAPTCHA pause), register a grievance, and download a birth certificate. All are fake; nothing is stored, sent or paid.

## Panel closed
The guide runs in the extension's background worker, so cues and spoken steps continue when the side panel is closed. Reopen the panel to see the conversation. **Start over** restarts the same goal from the current page; **Try again** repeats a failed request.

## Limits
- The recorded route is scripted, not AI, and works only on the mock portal.
- Your goal and page labels do go to the AI. Masking is rule-based and misses names, addresses and unusual formats.
- Hindi and Kannada text needs fluent review; other languages are untested. Whisper base may be weak for Kannada.
- Embedded frames, closed shadow DOM, canvas and image-only labels are not read.
- Compare-options is planned, not built.

## Test
`npm test`

Uses [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) and ONNX Runtime Web, bundled in `extension/vendor/`.
