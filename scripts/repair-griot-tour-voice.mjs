import fs from 'node:fs';

function mustReplace(path, search, replacement) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(search)) throw new Error(`Expected pattern missing in ${path}: ${search.slice(0, 80)}`);
  fs.writeFileSync(path, current.replace(search, replacement));
}

function mustRegex(path, pattern, replacement) {
  const current = fs.readFileSync(path, 'utf8');
  if (!pattern.test(current)) throw new Error(`Expected regex missing in ${path}: ${pattern}`);
  fs.writeFileSync(path, current.replace(pattern, replacement));
}

mustReplace(
  'src/features/showcase/member-assist.js',
  "import { GriotControl } from './meta-ai.js';",
  "import { GriotControl } from './meta-ai.js';\nimport { getToken } from '../../core/session.js';",
);

mustReplace(
  'src/features/showcase/member-assist.js',
  "    status,\n    voicePanel,\n    tour,\n  ]);",
  "    status,\n    voicePanel,\n  ]);\n\n  const existingTour = document.querySelector('body > .ft-live-tour');\n  if (existingTour && existingTour !== tour) existingTour.remove();\n  document.body.append(tour);",
);

mustRegex(
  'src/features/showcase/member-assist.js',
  /function speakText\(text, settings, status, callbacks = \{\}\) \{[\s\S]*?\n\}\n\nasync function playServerVoice\(encoded, mimeType, token, status, callbacks\) \{[\s\S]*?\n\}\n\nfunction playHtmlServerAudio/,
  `function speakText(text, settings, status, callbacks = {}) {
  const token = ++voiceRequestToken;
  stopVoicePlayback({ preserveToken: true });
  primeVoicePlayback();
  status.textContent = 'Griot is preparing voice.';

  const sessionToken = getToken();
  const spokenText = String(text || '').trim();
  if (!sessionToken || !spokenText) {
    speakDeviceFallback(text, settings, status, callbacks, token);
    return;
  }

  fetch('/.netlify/functions/griot-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ token: sessionToken, text: spokenText, rate: settings.rate }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Voice endpoint unavailable');
      const contentType = String(response.headers.get('content-type') || 'audio/mpeg');
      if (!contentType.startsWith('audio/')) throw new Error('Voice endpoint returned non-audio');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 256) throw new Error('Voice endpoint returned empty audio');
      if (token !== voiceRequestToken) return;
      return playServerVoiceBytes(bytes, contentType.split(';')[0] || 'audio/mpeg', token, status, callbacks);
    })
    .catch(async () => {
      if (token !== voiceRequestToken) return;
      try {
        const result = await call('griot.speak', { text: spokenText, rate: settings.rate }, { timeout: 18000, retry: false });
        if (token !== voiceRequestToken) return;
        const encoded = String(result?.audioBase64 || '');
        if (!encoded) throw new Error('No fallback audio');
        const binary = window.atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return playServerVoiceBytes(bytes, String(result?.mimeType || 'audio/mpeg'), token, status, callbacks);
      } catch {
        if (token === voiceRequestToken) speakDeviceFallback(text, settings, status, callbacks, token);
      }
    });
}

async function playServerVoiceBytes(bytes, mimeType, token, status, callbacks) {
  const context = primeVoicePlayback();
  if (context) {
    try {
      if (context.state === 'suspended') await context.resume();
      if (token !== voiceRequestToken || context.state !== 'running') throw new Error('Audio context unavailable');
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      if (token !== voiceRequestToken) return;
      const source = context.createBufferSource();
      activeVoiceSource = source;
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (token !== voiceRequestToken) return;
        if (activeVoiceSource === source) activeVoiceSource = null;
        status.textContent = 'Griot voice ready.';
        callbacks.onEnd?.();
      };
      source.start(0);
      status.textContent = 'Griot is speaking.';
      callbacks.onStart?.();
      return;
    } catch { /* Fall through to HTMLAudio. */ }
  }

  return playHtmlServerAudio(bytes, mimeType, token, status, callbacks);
}

function playHtmlServerAudio`,
);

mustReplace(
  'src/features/showcase/member-assist.js',
  "      text: 'Griot — consistent voice',",
  "      text: 'Griot — warm voice',",
);
mustReplace(
  'src/features/showcase/member-assist.js',
  "      el('span', { text: 'A small set chosen for warmth, clarity and calm.' }),",
  "      el('span', { text: 'One warm, natural voice chosen for Griot across devices.' }),",
);

mustReplace(
  'src/features/showcase/meta-ai.js',
  "    syncVisualViewport();\n    await refreshContext();",
  "    syncVisualViewport();\n    const warm = call('griot.warm', { route: currentRoute() }, { timeout: 9000, retry: false }).catch(() => null);\n    await Promise.all([refreshContext(), warm]);",
);

mustReplace(
  'src/core/api.js',
  "  const isGriot = body.action === 'griot.chat' || body.action === 'griot.speak';\n  const target = body.action === 'griot.chat'\n    ? GRIOT_CHAT_ENDPOINT",
  "  const isGriot = body.action === 'griot.chat' || body.action === 'griot.warm' || body.action === 'griot.speak';\n  const target = body.action === 'griot.chat' || body.action === 'griot.warm'\n    ? GRIOT_CHAT_ENDPOINT",
);

mustReplace('netlify/functions/griot-chat.mjs', "const CHAT_TIMEOUT_MS = 12000;", "const CHAT_TIMEOUT_MS = 9000;");
mustReplace('netlify/functions/griot-chat.mjs', "const MAX_HISTORY = 8;", "const MAX_HISTORY = 4;");
mustReplace(
  'netlify/functions/griot-chat.mjs',
  "  if (String(body?.action || '') !== 'griot.chat') {\n    return envelope(false, null, { code: 'NOT_FOUND', message: \"We couldn't find that.\" }, 404);\n  }\n\n  const token = String(body?.token || '');\n  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};\n  const message = clean(payload.message, MAX_MESSAGE);\n\n  if (!token) return envelope(false, null, { code: 'SESSION_EXPIRED', message: 'Your session has ended. Sign in again.' }, 401);\n  if (!message) return envelope(false, null, { code: 'VALIDATION', message: 'Tell Griot what you want to work through.' }, 400);",
  "  const action = String(body?.action || '');\n  if (action !== 'griot.chat' && action !== 'griot.warm') {\n    return envelope(false, null, { code: 'NOT_FOUND', message: \"We couldn't find that.\" }, 404);\n  }\n\n  const token = String(body?.token || '');\n  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};\n  const message = clean(payload.message, MAX_MESSAGE);\n\n  if (!token) return envelope(false, null, { code: 'SESSION_EXPIRED', message: 'Your session has ended. Sign in again.' }, 401);\n\n  if (action === 'griot.warm') {\n    const tokenKey = hashToken(token);\n    const route = clean(payload.route || '/dashboard', 80) || '/dashboard';\n    const cached = readCache(flowCache, tokenKey);\n    if (cached) return envelope(true, { warmed: true }, null, 200, cached.meta || {});\n    const dashboardEnvelope = await flowCall('member.dashboard', token, {}, body);\n    if (!dashboardEnvelope.ok) return passthrough(dashboardEnvelope);\n    const context = minimiseDashboard(dashboardEnvelope.data || {}, route);\n    const meta = dashboardEnvelope.meta || {};\n    writeCache(flowCache, tokenKey, { context, meta });\n    writeCache(sessionCache, tokenKey, { meta });\n    return envelope(true, { warmed: true }, null, 200, meta);\n  }\n\n  if (!message) return envelope(false, null, { code: 'VALIDATION', message: 'Tell Griot what you want to work through.' }, 400);",
);

mustRegex(
  'netlify/functions/griot-chat.mjs',
  /temperature: 0\.42,\n\s*max_tokens: 280,\n\s*provider: \{ sort: 'latency' \},\n\s*response_format: \{[\s\S]*?\n\s*\},\n\s*\}\),/,
  "temperature: 0.36,\n        max_tokens: 180,\n        provider: { sort: 'latency' },\n      }),",
);

mustReplace(
  'netlify/functions/griot-chat.mjs',
  "    'Normally answer in 120 words or fewer unless detail is requested.',",
  "    'Return only the natural-language answer. Do not emit JSON, metadata or an action object.',\n    'Normally answer in 90 words or fewer unless detail is requested.',",
);

fs.writeFileSync('netlify/functions/griot-voice.mjs', `const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwWWVFp0K9oJKkZsnOackCSCmeAUPxZLRANX9v1YN0Dl-Y3VdTg_4Qp5_s-arhYZuOB/exec';
const MODEL = 'gpt-4o-mini-tts';
const VOICE = 'marin';
const MAX_SPEECH = 3500;
const FLOW_TIMEOUT_MS = 8000;
const SPEECH_TIMEOUT_MS = 18000;

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError('NOT_FOUND', "We couldn't find that.", 404);
  let body;
  try { body = await request.json(); } catch { return jsonError('VALIDATION', 'That request was not valid.', 400); }
  const token = String(body?.token || '');
  const text = String(body?.text || '').trim().slice(0, MAX_SPEECH);
  if (!token) return jsonError('SESSION_EXPIRED', 'Your session has ended. Sign in again.', 401);
  if (!text) return jsonError('VALIDATION', 'There is nothing for Griot to say.', 400);

  const session = await flowCall(token, body);
  if (!session.ok) return new Response(JSON.stringify(session), { status: session?.error?.code === 'SESSION_EXPIRED' ? 401 : 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!baseUrl || !apiKey) return jsonError('SERVER_ERROR', 'Griot voice is not available just now.', 503);

  const spoken = text.replace(/\\bGriot\\b/gi, 'Gree-oh');
  let response;
  try {
    response = await fetchWithTimeout(`${baseUrl.replace(/\\/$/, '')}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: spoken,
        response_format: 'mp3',
        instructions: 'Warm, grounded, intelligent and understated. Natural conversational rhythm; never announcer-like or overly cheerful. A subtle cosmopolitan British-West-African cadence is welcome if natural, never caricatured. Pronounce Gree-oh exactly as written, with no final T sound.',
      }),
    }, SPEECH_TIMEOUT_MS);
  } catch { return jsonError('SERVER_ERROR', 'Griot voice could not start just now.', 502); }

  if (!response.ok) return jsonError('SERVER_ERROR', 'Griot voice could not start just now.', 502);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 256) return jsonError('SERVER_ERROR', 'Griot voice returned no audio.', 502);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Griot-Voice': VOICE,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function flowCall(token, requestBody) {
  let response;
  try {
    response = await fetchWithTimeout(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.session', payload: {}, token, requestId: String(requestBody?.requestId || `voice-${crypto.randomUUID()}`), clientVersion: '2.1.0' }),
      redirect: 'follow',
    }, FLOW_TIMEOUT_MS);
  } catch { return { ok: false, error: { code: 'NETWORK', message: 'Flow Tribe could not reach the server.' }, meta: {} }; }
  try { return await response.json(); } catch { return { ok: false, error: { code: 'SERVER_ERROR', message: 'Flow Tribe received an invalid server response.' }, meta: {} }; }
}

function jsonError(code, message, status) {
  return new Response(JSON.stringify({ ok: false, error: { code, message }, meta: {} }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
`);

mustReplace('netlify/functions/griot.mjs', "const OPENAI_SPEECH_VOICE = 'cedar';", "const OPENAI_SPEECH_VOICE = 'marin';");

fs.writeFileSync('styles/experience-repair.css', `/* Final guided-help and voice repair. Loaded last. */
.ft-live-tour {
  position: fixed !important;
  inset: 0 !important;
  z-index: 10000 !important;
  pointer-events: none !important;
}
.ft-live-tour[hidden] { display: none !important; }
.ft-live-tour__panel,
.ft-live-tour__panel[data-placement='top'],
.ft-live-tour__panel[data-placement='bottom'] {
  position: fixed !important;
  top: auto !important;
  right: 1.25rem !important;
  bottom: 1.25rem !important;
  left: auto !important;
  width: min(30rem, calc(100vw - 2.5rem)) !important;
  max-width: none !important;
  height: auto !important;
  max-height: min(62dvh, 32rem) !important;
  padding: 1.2rem !important;
  overflow-y: auto !important;
  transform: none !important;
  z-index: 10002 !important;
  pointer-events: auto !important;
  background: #f6f4ef !important;
  border-radius: 1.35rem !important;
  box-shadow: 0 1.5rem 4rem rgba(9, 46, 35, .24) !important;
}
.ft-live-tour-target {
  position: relative;
  z-index: 1000 !important;
}
.ft-live-tour__top,
.ft-live-tour__meta,
.ft-live-tour__footer { position: relative; z-index: 1; }
.ft-live-tour__title { margin-top: .55rem !important; line-height: 1.12 !important; }
.ft-live-tour__body { margin-top: .7rem !important; line-height: 1.5 !important; }

@media (max-width: 720px) {
  .ft-live-tour__panel,
  .ft-live-tour__panel[data-placement='top'],
  .ft-live-tour__panel[data-placement='bottom'] {
    right: .65rem !important;
    bottom: calc(var(--ft-bottom-nav-height) + .65rem + env(safe-area-inset-bottom)) !important;
    left: .65rem !important;
    width: auto !important;
    max-height: 46dvh !important;
    padding: .95rem !important;
  }
  .ft-live-tour__footer {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: .55rem !important;
  }
  .ft-live-tour__button { width: 100%; min-width: 0; }
  .ft-live-tour__title { font-size: 1.16rem !important; }
  .ft-live-tour__body { font-size: .92rem !important; }
}
`);

mustReplace(
  'index.html',
  '    <link rel="stylesheet" href="styles/mobile-repair.css" />',
  '    <link rel="stylesheet" href="styles/mobile-repair.css" />\n    <link rel="stylesheet" href="styles/experience-repair.css" />',
);

let contract = fs.readFileSync('tests/griot-source-contract.mjs', 'utf8');
contract = contract
  .replace("const mobileRepair = fs.readFileSync(new URL('../styles/mobile-repair.css', import.meta.url), 'utf8');", "const mobileRepair = fs.readFileSync(new URL('../styles/mobile-repair.css', import.meta.url), 'utf8');\nconst experienceRepair = fs.readFileSync(new URL('../styles/experience-repair.css', import.meta.url), 'utf8');\nconst voiceRuntime = fs.readFileSync(new URL('../netlify/functions/griot-voice.mjs', import.meta.url), 'utf8');")
  .replace("assert(fastChat.includes('max_tokens: 280'), 'Griot generation budget must stay bounded for responsiveness.');", "assert(fastChat.includes('max_tokens: 180'), 'Griot generation budget must stay bounded for responsiveness.');")
  .replace("assert(fastChat.includes(\"type: 'json_schema'\"), 'Griot responses must retain structured output.');", "assert(fastChat.includes(\"Return only the natural-language answer\"), 'Fast Griot must avoid structured-output latency and JSON debris.');")
  .replace("assert(gateway.includes(\"OPENAI_SPEECH_VOICE = 'cedar'\"), 'Griot must retain one stable server voice identity.');", "assert(gateway.includes(\"OPENAI_SPEECH_VOICE = 'marin'\"), 'Fallback Griot voice must use Marin.');\nassert(voiceRuntime.includes(\"const VOICE = 'marin'\"), 'Primary Griot voice must use Marin.');\nassert(voiceRuntime.includes(\"Content-Type': response.headers.get('content-type') || 'audio/mpeg'\"), 'Primary voice endpoint must return binary audio directly.');")
  .replace("assert(client.includes(\"call('griot.chat'\"), 'Griot client must call the conversational action.');", "assert(client.includes(\"call('griot.chat'\"), 'Griot client must call the conversational action.');\nassert(client.includes(\"call('griot.warm'\"), 'Griot must prewarm authenticated context when opened.');")
  .replace("assert(assist.includes(\"call('griot.speak'\"), 'Voice playback must use authenticated server speech first.');", "assert(assist.includes(\"/.netlify/functions/griot-voice\"), 'Primary voice playback must use the binary voice endpoint.');\nassert(assist.includes(\"call('griot.speak'\"), 'Voice playback must retain authenticated server fallback.');\nassert(assist.includes('document.body.append(tour)'), 'Guided tour must be portalled to document.body.');")
  .replace("assert(index.includes('styles/mobile-repair.css'), 'The mobile repair stylesheet must be loaded after existing Griot/tour styles.');", "assert(index.includes('styles/mobile-repair.css'), 'The mobile repair stylesheet must remain loaded.');\nassert(index.includes('styles/experience-repair.css'), 'The final experience repair stylesheet must load last.');\nassert(experienceRepair.includes('z-index: 10002'), 'Tour panel must always sit above highlighted content.');\nassert(experienceRepair.includes('max-height: 46dvh'), 'Mobile tour must remain a compact card rather than a full-screen sheet.');");
fs.writeFileSync('tests/griot-source-contract.mjs', contract);

console.log('Applied Griot/tour/voice repair.');
