import fs from 'node:fs';

const service = fs.readFileSync(new URL('../appsscript/services/GriotService.gs', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../appsscript/03_Router.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../appsscript/appsscript.json', import.meta.url), 'utf8'));
const client = fs.readFileSync(new URL('../src/features/showcase/meta-ai.js', import.meta.url), 'utf8');
const assist = fs.readFileSync(new URL('../src/features/showcase/member-assist.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(service.includes('https://api.meta.ai/v1/chat/completions'), 'Griot must use the current Meta Model API endpoint.');
assert(service.includes("DEFAULT_MODEL = 'muse-spark-1.2'"), 'Griot must default to the current Muse Spark model.');
assert(service.includes("getProperty('FT_GRIOT_MODEL_API_KEY')") && service.includes("getProperty('FT_GRIOT_LLAMA_API_KEY')"), 'Griot credential must come from Script Properties and preserve the existing deployed key name as a compatibility fallback.');
assert(!service.includes('https://api.llama.com/'), 'The retired Llama API endpoint must not return.');
assert(!/Bearer\s+[A-Za-z0-9_-]{20,}/.test(service), 'Griot service must not contain a literal bearer credential.');
assert(router.includes("'griot.chat': { capability: 'dashboard:self'"), 'griot.chat must be authenticated by the existing dashboard capability.');
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'), 'Apps Script must declare external-request scope.');
assert(client.includes("call('griot.chat'"), 'Griot client must call the real server conversation action.');
assert(!client.includes('function answerQuestion('), 'The old keyword answer engine must not return.');
assert(client.includes('SpeechRecognition') && client.includes('webkitSpeechRecognition'), 'Griot must support browser speech input where available.');
assert(assist.includes('Griot — Warm & grounded'), 'The curated Griot voice palette is missing.');
assert(!assist.includes('for (const voice of voices)'), 'Do not expose the raw operating-system voice catalogue.');

console.log('Griot source contract: passed');
