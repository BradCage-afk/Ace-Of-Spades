// Recorded route for the mock portal only. Not AI: the panel labels it as recorded.
// Hindi and Kannada lines still need review by fluent speakers.
const S = (match, cue, en, hi, kn) => ({ match, cue, say: { en, hi, kn } });
const GOAL = /scholar|chatra|vidyarthi|छात्रवृत्ति|स्कॉलरशिप|ವಿದ್ಯಾರ್ಥಿವೇತನ|ವಿದ್ಯಾರ್ಥಿ ವೇತನ|ಸ್ಕಾಲರ್/i;

const PAGES = {
  'mock portal: home': [
    S('Student scholarships', 'tap', 'Scroll down and tap Student scholarships.', 'नीचे स्क्रॉल करें और Student scholarships पर टैप करें।', 'ಕೆಳಗೆ ಸ್ಕ್ರಾಲ್ ಮಾಡಿ, Student scholarships ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ.'),
  ],
  'mock portal: application': [
    S('Applicant name', 'type', 'Type your name here, as it appears on your documents.', 'यहाँ अपना नाम लिखें, जैसा आपके दस्तावेज़ों में है।', 'ನಿಮ್ಮ ದಾಖಲೆಗಳಲ್ಲಿ ಇರುವಂತೆ ನಿಮ್ಮ ಹೆಸರನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ.'),
    S('Course level', 'select', 'Choose your course level from this list.', 'इस सूची से अपने कोर्स का स्तर चुनें।', 'ಈ ಪಟ್ಟಿಯಿಂದ ನಿಮ್ಮ ಕೋರ್ಸ್ ಹಂತವನ್ನು ಆಯ್ಕೆ ಮಾಡಿ.'),
    S('Annual family income', 'type', 'Type your family income for one year. Check it against your certificate.', 'अपने परिवार की एक साल की आय लिखें। इसे अपने प्रमाण पत्र से मिला लें।', 'ನಿಮ್ಮ ಕುಟುಂಬದ ಒಂದು ವರ್ಷದ ಆದಾಯವನ್ನು ಬರೆಯಿರಿ. ಪ್ರಮಾಣಪತ್ರದೊಂದಿಗೆ ಹೋಲಿಸಿ ನೋಡಿ.'),
    S('Continue to review', 'tap', 'Tap Continue to review.', 'Continue to review पर टैप करें।', 'Continue to review ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ.'),
  ],
  'mock portal: review': [
    S('I have checked my details', 'tap', 'Read your details. If they are correct, tick this box.', 'अपनी जानकारी पढ़ें। सही हो तो इस बॉक्स पर टिक करें।', 'ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಓದಿ. ಸರಿಯಾಗಿದ್ದರೆ ಈ ಬಾಕ್ಸ್ ಅನ್ನು ಟಿಕ್ ಮಾಡಿ.'),
    S('One-time password (OTP)', 'pause', 'Enter the OTP yourself. Never tell it to me or anyone else.', 'OTP खुद डालें। इसे मुझे या किसी और को न बताएँ।', 'OTP ಅನ್ನು ನೀವೇ ನಮೂದಿಸಿ. ಅದನ್ನು ನನಗೆ ಅಥವಾ ಬೇರೆ ಯಾರಿಗೂ ಹೇಳಬೇಡಿ.'),
    S('Submit application', 'pause', 'This is the final submit. Check once more, then decide yourself.', 'यह अंतिम सबमिट है। एक बार फिर जाँचें, फिर खुद तय करें।', 'ಇದು ಅಂತಿಮ ಸಲ್ಲಿಕೆ. ಮತ್ತೊಮ್ಮೆ ಪರಿಶೀಲಿಸಿ, ನಂತರ ನೀವೇ ನಿರ್ಧರಿಸಿ.'),
  ],
};
const PREPARE = {
  en: ['Your name as on documents', 'Income certificate', 'Phone for OTP'],
  hi: ['दस्तावेज़ों वाला नाम', 'आय प्रमाण पत्र', 'OTP के लिए फ़ोन'],
  kn: ['ದಾಖಲೆಗಳಲ್ಲಿರುವ ಹೆಸರು', 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ', 'OTP ಗಾಗಿ ಫೋನ್'],
};
const FINISHED = { en: 'The mock application is complete.', hi: 'नमूना आवेदन पूरा हुआ।', kn: 'ಮಾದರಿ ಅರ್ಜಿ ಪೂರ್ಣಗೊಂಡಿದೆ.' };

export function recordedPlan({ goal, lang, snapshot, history }) {
  if (snapshot.host !== 'localhost:8787') return null;
  if (!GOAL.test(goal)) return { reply: 'The recorded route only knows the scholarship task.', steps: [], done: false };
  const L = FINISHED[lang] ? lang : 'en';
  const key = snapshot.title.toLowerCase();
  if (key === 'mock portal: done') return { reply: FINISHED[L], steps: [], done: true };
  const page = PAGES[key];
  if (!page) return { reply: 'No recorded route for this page.', steps: [], done: false };
  const steps = page
    .filter((s) => !history.some((h) => h.endsWith(`: ${s.match}`)))
    .map((s) => ({ targetId: snapshot.elements.find((e) => e.label === s.match)?.id, cue: s.cue, say: s.say[L] }));
  return { reply: '', prepare: key === 'mock portal: home' ? PREPARE[L] : [], steps, done: false };
}
