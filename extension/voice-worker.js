// Speech to text on this computer. Model files are downloaded once; audio is never uploaded.
import { pipeline, env } from './vendor/transformers.min.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
let asr;
onmessage = async ({ data }) => {
  try {
    asr ||= pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { dtype: 'q8', device: 'wasm', progress_callback: (p) => p.status === 'progress' && postMessage({ progress: Math.round(p.progress), file: p.file }) });
    if (data.warm) { await asr; return postMessage({ ready: true }); }
    const out = await (await asr)(data.audio, { language: data.language, task: 'transcribe' });
    postMessage({ text: out.text.trim() });
  } catch (e) { asr = null; postMessage({ error: e.message }); }
};
