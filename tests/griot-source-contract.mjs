import fs from 'node:fs';

const service = fs.readFileSync(new URL('../appsscript/services/GriotService.gs', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../appsscript/03_Router.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../appsscript/appsscript.json', import.meta.url), 'utf8'));
const client = fs.readFileSync(new URL('../src/features/showcase/meta-ai.js', import.meta.url), 'utf8');
const assist = fs.readFileSync(new URL('../src/features/showcase/member-assist.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/core/api.js', import.meta.url), 'utf8');
const gateway = fs.readFileSync(new URL('../netlify/functions/griot.mjs', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Apps Script implementation remains a governed fallback/handoff, but the live
// client must no longer depend on deploying these Griot routes.
assert(service.includes('https://api.meta.ai/v1/chat/completions'), 'Apps Script Griot fallback must retain the current Meta Model API endpoint.');
assert(service.includes("DEFAULT_MODEL = 'muse-spark-1.1'"), 'Apps Script Griot fallback must retain the canonical Muse model default.');
assert(router.includes("'griot.chat': { capability: 'dashboard:self'"), 'Apps Script Griot fallback must remain capability protected.');
assert(router.includes("'griot.speak': { capability: 'dashboard:self'"), 'Apps Script speech fallback must remain capability protected.');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'), 'Apps Script fallback must retain external-request scope.');

// Live Griot runtime: Netlify Function + AI Gateway. No provider key belongs in
// the repository, browser, or Apps Script deployment path.
assert(api.includes("const GRIOT_ENDPOINT = '/.netlify/functions/griot'"), 'Griot client actions must route through the same-origin Netlify Function.');
assert(api.includes("new Set(['griot.chat', 'griot.speak'])"), 'Both Griot chat and speech must use the Netlify runtime.');
assert(gateway.includes("CHAT_MODEL = 'meta-llama/llama-4-maverick'"), 'Griot conversation must stay on a Meta Llama model through the gateway.');
assert(gateway.includes('process.env.OPENROUTER_BASE_URL') && gateway.includes('process.env.OPENROUTER_API_KEY'), 'Griot conversation must use Netlify AI Gateway OpenRouter credentials.');
assert(gateway.includes('process.env.OPENAI_BASE_URL') && gateway.includes('process.env.OPENAI_API_KEY'), 'Griot speech must use Netlify AI Gateway OpenAI credentials.');
assert(gateway.includes("flowCall('member.dashboard'"), 'Griot chat must validate the member session and ground itself in Flow dashboard context.');
assert(gateway.includes("flowCall('auth.session'"), 'Griot speech must validate the existing Flow session before generating audio.');
assert(gateway.includes("SPEECH_MODEL = 'gpt-4o-mini-tts'"), 'Griot voice must use the speech model by default.');
assert(gateway.includes("SPEECH_VOICE = 'cedar'"), 'Griot must retain one stable server voice by default.');
assert(gateway.includes("replace(/\\bGriot\\b/gi, 'Gree-oh')"), 'Server speech must enforce Griot → Gree-oh pronunciation.');
assert(!/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(gateway), 'Netlify Griot runtime must never contain a literal provider credential.');
assert(!/Bearer\s+[A-Za-z0-9_-]{20,}/.test(gateway), 'Netlify Griot runtime must never contain a literal bearer credential.');

assert(client.includes("call('griot.chat'"), 'Griot client must call the conversational action.');
assert(!client.includes('function answerQuestion('), 'The old keyword answer engine must not return.');
assert(client.includes('SpeechRecognition') && client.includes('webkitSpeechRecognition'), 'Griot must support browser speech input where available.');
assert(assist.includes("call('griot.speak'"), 'Voice playback must use the authenticated server speech action first.');
assert(assist.includes("text: 'Griot — consistent voice'"), 'The UI must expose one consistent Griot voice rather than device-specific aliases.');
assert(assist.includes("replace(/\\bGriot\\b/gi, 'Gree-oh')"), 'Device fallback must also pronounce Griot as Gree-oh.');
assert(!assist.includes('for (const voice of voices)'), 'Do not expose the raw operating-system voice catalogue.');

console.log('Griot source contract: passed');
