# Saathi: overview for judges and team
Team Ace Of Spades. wHACKiest 2026, Track 2: Beyond the Browser. Prototype as of 26 Nov 2026.

## 1. What it is
A Chrome extension that guides you through a website. You say or type your goal; Saathi shows the next step on the real page with an animated cue and a spoken sentence, waits for you to do it, then shows the next one, across pages. **It points. You make every click.** No code path in the extension clicks, types or submits.

## 2. Tech stack
| Part | What we use | Why |
|---|---|---|
| Extension | Chrome Manifest V3: side panel, background service worker, content script | Sits beside the real page; keeps guiding when the panel is closed |
| On-page cues | Content script + CSS overlay in a shadow root | Draws arrows, rings and tips without changing the site |
| Planning a route | MiniMax M3.1 Flash on NVIDIA NIM; Nemotron 3.5 Lightning as backup | The AI decides which link or button leads towards the goal |
| Planning a form | On-device form helper (`extension/lib/forms.js`) | Forms are predictable: empty fields top to bottom, then submit. Instant, no AI call |
| Safety check | Local validator (`extension/lib/validator.js`) | Only known items and five cues: tap, type, select, scroll, pause |
| Privacy | Local masking (`extension/lib/redact.js`) + privacy receipt | Masks emails, long numbers, PAN, OTP-like codes; shows exactly what was sent |
| Proxy | Node.js, no dependencies (`server/server.js`) | Keeps the API key out of the extension; retries; backup model |
| Voice in | Whisper base via Transformers.js, in the browser | Audio stays on the computer; model downloaded once |
| Voice out | `chrome.tts`, on-device voices only | Cloud voices would send the text away |
| Storage | `chrome.storage` (session state; plans remembered 24 h) | No server database, no user accounts |
| Tests | 12 unit tests (`npm test`); browser tests run with Playwright | Safety, masking, form helper, fallbacks |

## 3. How one step works
1. The content script reads the **visible labels** of links, buttons and fields. It never reads what you typed into a field.
2. If the page has a real form, the **form helper** plans it on the device. Otherwise:
3. The labels and your goal are masked and sent to the proxy, then to the AI. The **privacy receipt** shows the exact request.
4. The AI returns only `{ targetId, cue, say }`. The local check drops anything not on the page, and forces **pause** on passwords, OTP, CAPTCHA, payment and final submit.
5. The cue is drawn and spoken. When you act, or the page changes, Saathi moves on or plans again.

**If the AI is slow or down:** after 25 s the backup model is asked too, and the first usable answer wins. If both fail, Saathi points at the best keyword match and says so. A scripted "recorded route" exists for the mock portal only, and is labelled as scripted.

**Hindi and Kannada:** the AI is asked in English and only chooses the item; Saathi writes the Hindi or Kannada sentence from templates. This avoids slow, long answers in those languages.

## 4. USP
- **Shows, does not do.** Agents like Gemini auto browse do the task for you. Saathi teaches the route, so you stay in control and can repeat it later.
- **Point-only by design.** The AI has no command to click or submit, so a page that tries to trick it can at worst point at the wrong thing.
- **Works on the real site, in your own tab,** not a copy of the form and not a remote browser.
- **Privacy you can see:** field values are never sent, audio is not uploaded, and the receipt shows every request.

Voice, Indian languages and confirm-before-submit are not unique on their own. The combination is.

## 5. Loopholes and edge cases (honest)
| Case | What happens now | Status |
|---|---|---|
| AI points at the wrong item | You can say "I'm stuck", Start over, or ignore it | Can happen |
| AI slow (seen: 60 s+ for Hindi before the fix) | Backup after 25 s; keyword match; recorded route on the mock | Fix untested with the real AI |
| NVIDIA free service busy (503) | Retry, then backup, then a clear message | Tested with a fake AI |
| Goal or page labels contain personal data | Pattern masking; names and addresses are not detected | Limitation |
| Hindi voice input | Whisper base is unusable for Hindi (297% word error in our test). A Hindi-tuned model scored 16% but is 400 MB | Typing recommended; upgrade planned |
| Kannada voice input | Unusable with Whisper base | Not offered |
| Embedded frames (iframes), closed shadow DOM, canvas, image-only buttons | Not read | Limitation |
| Login, OTP, CAPTCHA, payment, final submit | Always paused for the user | By design |
| Multi-form pages, or forms that need a different order | Form helper takes the biggest form, top to bottom | Can be wrong |
| Site layout changes | Re-reads the page each time; remembered plans expire in 24 h | Fine |
| Proxy runs on the laptop | Must be started (`npm start`); not deployed | Deployment planned |
| Mobile | Chrome on Android generally does not run extensions | Desktop only |
| Tested sites | Our mock portal (5 tasks) and public pages of scholarships.gov.in | No logged-in forms tested |

## 6. Business aspect (proposals, not agreements)
**We have no customers, partners or licences.** These are ideas we would test.
- **Citizens:** free, no ads.
- **Organisations (possible B2B):** colleges, banks and government portals could pay for **tested, maintained routes for their own services** and support, so their users finish applications without help desks. Example: a college sets up its scholarship and admission flows.
- **Helpers:** cyber cafés and service centres (about 5 lakh CSCs) use desktops and help many people a day.
- **Costs:** AI calls, hosting the proxy, keeping routes up to date.
- **First step:** a pilot in a college computer lab, measuring completion, time and wrong clicks with and without Saathi.
- **Partners to approach:** Bhashini for Indian-language speech, colleges, NGOs.

## 7. What we would build next
1. Hindi-tuned speech recognition (and a working Kannada one)
2. Compare options on a page, for example two schemes side by side
3. Hosted proxy with access control, then a Chrome Web Store listing
4. A small user study for real numbers
