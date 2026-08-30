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
assert(gateway.includes('process.env.OPENROUTER_BASE_URL') && gateway.includes('process.env.OPENROUTER_API_KEY'), 'Griot chat must use Netlify AI Gateway OpenRouter credentials.');
assert(gateway.includes("flowCall('member.dashboard'"), 'Griot chat must validate the member session and ground itself in Flow dashboard context.');
assert(gateway.includes("flowCall('auth.session'"), 'Griot speech must validate the existing Flow session before generating audio.');

// Conversation quality: trustworthy current clock, broad usefulness, bounded
// latency, structured output and a parser that refuses to display JSON debris.
assert(gateway.includes("FLOW_TIMEZONE = 'Africa/Lagos'"), 'Griot must have an authoritative product timezone.');
assert(gateway.includes('function currentClock()'), 'Griot must inject current server date/time rather than infer today from movement history.');
assert(gateway.includes('The CLOCK CONTEXT below is authoritative'), 'The model must be told that server clock context is authoritative.');
assert(gateway.includes('Answer ordinary questions directly'), 'Griot must be useful outside narrow Flow-only prompts.');
assert(gateway.includes("sort: 'latency'"), 'OpenRouter routing must prefer low-latency providers.');
assert(gateway.includes("type: 'json_schema'"), 'Griot responses must use structured output to stop raw JSON leakage.');
assert(gateway.includes('function findTrailingJson(') && gateway.includes('function stripJsonLikeTail('), 'Griot must defensively strip malformed JSON trailers.');
assert(gateway.includes('CHAT_TIMEOUT_MS = 18000'), 'Griot chat must have a bounded provider timeout.');

// Voice: direct OpenAI AI Gateway is the primary production route. OpenRouter
// may remain only as a guarded fallback because speech model availability can
// change independently of chat model availability.
assert(gateway.includes('process.env.OPENAI_BASE_URL') && gateway.includes('process.env.OPENAI_API_KEY'), 'Griot voice must use Netlify AI Gateway OpenAI credentials directly.');
assert(gateway.includes("OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts'"), 'Griot voice must use the current OpenAI speech model alias.');
assert(gateway.includes("OPENAI_SPEECH_VOICE = 'cedar'"), 'Griot must retain one stable server voice identity.');
assert(gateway.includes("/v1/audio/speech`"), 'Primary Griot voice must use the OpenAI speech endpoint.');
assert(gateway.includes("replace(/\\bGriot\\b/gi, 'Gree-oh')"), 'Server speech must enforce Griot → Gree-oh pronunciation.');
assert(!/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(gateway), 'Netlify Griot runtime must never contain a literal provider credential.');
assert(!/Bearer\s+[A-Za-z0-9_-]{20,}/.test(gateway), 'Netlify Griot runtime must never contain a literal bearer credential.');

assert(client.includes("call('griot.chat'"), 'Griot client must call the conversational action.');
assert(!client.includes('function answerQuestion('), 'The old keyword answer engine must not return.');
assert(client.includes('SpeechRecognition') && client.includes('webkitSpeechRecognition'), 'Griot must support browser speech input where available.');
assert(assist.includes("call('griot.speak'"), 'Voice playback must use the authenticated server speech action first.');
assert(assist.includes('function primeVoicePlayback()'), 'Griot must unlock mobile audio from a member gesture.');
assert(assist.includes('AudioContext') && assist.includes('webkitAudioContext'), 'Griot must support Web Audio on desktop and iOS Safari.');
assert(assist.includes('decodeAudioData') && assist.includes('createBufferSource'), 'Server voice must use Web Audio where available.');
assert(assist.includes("audio.setAttribute('playsinline', '')"), 'Mobile server audio must play inline.');
assert(assist.includes('speakText(step.narration'), 'Show me round must share the Griot server voice path.');
assert(assist.includes("text: 'Griot — consistent voice'"), 'The UI must expose one consistent Griot voice rather than device-specific aliases.');
assert(assist.includes("replace(/\\bGriot\\b/gi, 'Gree-oh')"), 'Device fallback must also pronounce Griot as Gree-oh.');
assert(!assist.includes('for (const voice of voices)'), 'Do not expose the raw operating-system voice catalogue.');

console.log('Griot source contract: passed');
