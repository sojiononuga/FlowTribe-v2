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

mustReplace('netlify/functions/griot.mjs', "const OPENAI_SPEECH_VOICE = 'cedar';", "const OPENAI_SPEECH_VOICE = 'marin';");

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
  .replace("assert(gateway.includes(\"OPENAI_SPEECH_VOICE = 'cedar'\"), 'Griot must retain one stable server voice identity.');", "assert(gateway.includes(\"OPENAI_SPEECH_VOICE = 'marin'\"), 'Fallback Griot voice must use Marin.');\nassert(voiceRuntime.includes(\"const VOICE = 'marin'\"), 'Primary Griot voice must use Marin.');\nassert(voiceRuntime.includes(\"'Content-Type': response.headers.get('content-type') || 'audio/mpeg'\"), 'Primary voice endpoint must return binary audio directly.');")
  .replace("assert(client.includes(\"call('griot.chat'\"), 'Griot client must call the conversational action.');", "assert(client.includes(\"call('griot.chat'\"), 'Griot client must call the conversational action.');\nassert(client.includes(\"call('griot.warm'\"), 'Griot must prewarm authenticated context when opened.');")
  .replace("assert(assist.includes(\"call('griot.speak'\"), 'Voice playback must use authenticated server speech first.');", "assert(assist.includes(\"/.netlify/functions/griot-voice\"), 'Primary voice playback must use the binary voice endpoint.');\nassert(assist.includes(\"call('griot.speak'\"), 'Voice playback must retain authenticated server fallback.');\nassert(assist.includes('document.body.append(tour)'), 'Guided tour must be portalled to document.body.');")
  .replace("assert(index.includes('styles/mobile-repair.css'), 'The mobile repair stylesheet must be loaded after existing Griot/tour styles.');", "assert(index.includes('styles/mobile-repair.css'), 'The mobile repair stylesheet must remain loaded.');\nassert(index.includes('styles/experience-repair.css'), 'The final experience repair stylesheet must load last.');\nassert(experienceRepair.includes('z-index: 10002'), 'Tour panel must always sit above highlighted content.');\nassert(experienceRepair.includes('max-height: 46dvh'), 'Mobile tour must remain a compact card rather than a full-screen sheet.');");
fs.writeFileSync('tests/griot-source-contract.mjs', contract);

console.log('Applied Griot/tour/voice repair.');
