import fs from 'node:fs';

const service = fs.readFileSync(new URL('../appsscript/services/GriotService.gs', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../appsscript/03_Router.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../appsscript/appsscript.json', import.meta.url), 'utf8'));
const client = fs.readFileSync(new URL('../src/features/showcase/meta-ai.js', import.meta.url), 'utf8');
const assist = fs.readFileSync(new URL('../src/features/showcase/member-assist.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/core/api.js', import.meta.url), 'utf8');
const gateway = fs.readFileSync(new URL('../netlify/functions/griot.mjs', import.meta.url), 'utf8');
const fastChat = fs.readFileSync(new URL('../netlify/functions/griot-chat.mjs', import.meta.url), 'utf8');
const mobileRepair = fs.readFileSync(new URL('../styles/mobile-repair.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(service.includes('https://api.meta.ai/v1/chat/completions'), 'Apps Script Griot fallback must retain the current Meta Model API endpoint.');
assert(service.includes("DEFAULT_MODEL = 'muse-spark-1.1'"), 'Apps Script Griot fallback must retain the canonical Muse model default.');
assert(router.includes("'griot.chat': { capability: 'dashboard:self'"), 'Apps Script Griot fallback must remain capability protected.');
assert(router.includes("'griot.speak': { capability: 'dashboard:self'"), 'Apps Script speech fallback must remain capability protected.');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'), 'Apps Script fallback must retain external-request scope.');

assert(api.includes("GRIOT_CHAT_ENDPOINT = '/.netlify/functions/griot-chat'"), 'Griot chat must use the dedicated low-latency Netlify Function.');
assert(api.includes("GRIOT_FALLBACK_ENDPOINT = '/.netlify/functions/griot'"), 'Griot chat must retain the established runtime as a rollout fallback.');
assert(api.includes('response.status === 404'), 'Griot must fall back safely when the fast runtime is unavailable.');
assert(fastChat.includes("CHAT_MODEL = 'meta-llama/llama-4-scout'"), 'Griot chat must use the lower-latency Meta Llama Scout route.');
assert(fastChat.includes("sort: 'latency'"), 'OpenRouter chat routing must prefer low-latency providers.');
assert(fastChat.includes('max_tokens: 280'), 'Griot generation budget must stay bounded for responsiveness.');
assert(fastChat.includes('CACHE_MS = 60000'), 'Griot must reuse short-lived authenticated context to avoid repeated backend latency.');
assert(fastChat.includes("flowCall('member.dashboard'"), 'Flow-related Griot chat must remain grounded in authenticated dashboard context.');
assert(fastChat.includes("flowCall('auth.session'"), 'General Griot chat must still validate the existing Flow session.');
assert(fastChat.includes("FLOW_TIMEZONE = 'Africa/Lagos'"), 'Griot must have an authoritative product timezone.');
assert(fastChat.includes('function currentClock()'), 'Griot must inject current server date/time.');
assert(fastChat.includes("type: 'json_schema'"), 'Griot responses must retain structured output.');
assert(fastChat.includes('function stripJsonTail('), 'Griot must defensively strip JSON debris.');
assert(!/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(fastChat), 'Fast Griot runtime must never contain a literal provider credential.');

assert(gateway.includes('process.env.OPENAI_BASE_URL') && gateway.includes('process.env.OPENAI_API_KEY'), 'Griot voice must use Netlify AI Gateway OpenAI credentials directly.');
assert(gateway.includes("OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts'"), 'Griot voice must use the current OpenAI speech model alias.');
assert(gateway.includes("OPENAI_SPEECH_VOICE = 'cedar'"), 'Griot must retain one stable server voice identity.');
assert(gateway.includes("replace(/\\bGriot\\b/gi, 'Gree-oh')"), 'Server speech must enforce Griot → Gree-oh pronunciation.');

assert(client.includes("call('griot.chat'"), 'Griot client must call the conversational action.');
assert(client.includes('SpeechRecognition') && client.includes('webkitSpeechRecognition'), 'Griot must support browser speech input where available.');
assert(assist.includes("call('griot.speak'"), 'Voice playback must use authenticated server speech first.');
assert(assist.includes('function primeVoicePlayback()'), 'Griot must unlock mobile audio from a member gesture.');
assert(assist.includes('speakText(step.narration'), 'Show me round must share the Griot server voice path.');

assert(index.includes('styles/mobile-repair.css'), 'The mobile repair stylesheet must be loaded after existing Griot/tour styles.');
assert(mobileRepair.includes('5.35rem'), 'Mobile Griot sheet must leave the app header visible so its toggle remains closable.');
assert(mobileRepair.includes('html.ft-live-tour-open .ft-voice-panel'), 'Voice settings must not overlap the guided tour.');
assert(mobileRepair.includes('.ft-flow-hero__score') && mobileRepair.includes('place-content: center'), 'Momentum must be centred in its circle.');
assert(mobileRepair.includes('.ft-ring__label'), 'Weekly progress text must be centred in its ring.');

console.log('Griot source contract: passed');
