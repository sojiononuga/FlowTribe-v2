import fs from 'node:fs';

function replace(path, search, replacement) {
  const text = fs.readFileSync(path, 'utf8');
  if (!text.includes(search)) throw new Error(`Missing expected text in ${path}`);
  fs.writeFileSync(path, text.replace(search, replacement));
}

replace(
  'src/features/showcase/meta-ai.js',
  "    syncVisualViewport();\n    const warm = call('griot.warm', { route: currentRoute() }, { timeout: 9000, retry: false }).catch(() => null);\n    await Promise.all([refreshContext(), warm]);",
  "    syncVisualViewport();\n    await refreshContext();",
);

replace(
  'src/core/api.js',
  "  const isGriot = body.action === 'griot.chat' || body.action === 'griot.warm' || body.action === 'griot.speak';\n  const target = body.action === 'griot.chat' || body.action === 'griot.warm'\n    ? GRIOT_CHAT_ENDPOINT",
  "  const isGriot = body.action === 'griot.chat' || body.action === 'griot.speak';\n  const target = body.action === 'griot.chat'\n    ? GRIOT_CHAT_ENDPOINT",
);

let chat = fs.readFileSync('netlify/functions/griot-chat.mjs', 'utf8');
chat = chat.replace(
  "  const action = String(body?.action || '');\n  if (action !== 'griot.chat' && action !== 'griot.warm') {\n    return envelope(false, null, { code: 'NOT_FOUND', message: \"We couldn't find that.\" }, 404);\n  }\n\n  const token = String(body?.token || '');\n  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};\n  const message = clean(payload.message, MAX_MESSAGE);\n\n  if (!token) return envelope(false, null, { code: 'SESSION_EXPIRED', message: 'Your session has ended. Sign in again.' }, 401);\n\n  if (action === 'griot.warm') {\n    const tokenKey = hashToken(token);\n    const route = clean(payload.route || '/dashboard', 80) || '/dashboard';\n    const cached = readCache(flowCache, tokenKey);\n    if (cached) return envelope(true, { warmed: true }, null, 200, cached.meta || {});\n    const dashboardEnvelope = await flowCall('member.dashboard', token, {}, body);\n    if (!dashboardEnvelope.ok) return passthrough(dashboardEnvelope);\n    const context = minimiseDashboard(dashboardEnvelope.data || {}, route);\n    const meta = dashboardEnvelope.meta || {};\n    writeCache(flowCache, tokenKey, { context, meta });\n    writeCache(sessionCache, tokenKey, { meta });\n    return envelope(true, { warmed: true }, null, 200, meta);\n  }\n\n  if (!message) return envelope(false, null, { code: 'VALIDATION', message: 'Tell Griot what you want to work through.' }, 400);",
  "  if (String(body?.action || '') !== 'griot.chat') {\n    return envelope(false, null, { code: 'NOT_FOUND', message: \"We couldn't find that.\" }, 404);\n  }\n\n  const token = String(body?.token || '');\n  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};\n  const message = clean(payload.message, MAX_MESSAGE);\n\n  if (!token) return envelope(false, null, { code: 'SESSION_EXPIRED', message: 'Your session has ended. Sign in again.' }, 401);\n  if (!message) return envelope(false, null, { code: 'VALIDATION', message: 'Tell Griot what you want to work through.' }, 400);",
);
fs.writeFileSync('netlify/functions/griot-chat.mjs', chat);

let contract = fs.readFileSync('tests/griot-source-contract.mjs', 'utf8');
contract = contract.replace("assert(client.includes(\"call('griot.warm'\"), 'Griot must prewarm authenticated context when opened.');\n", '');
fs.writeFileSync('tests/griot-source-contract.mjs', contract);

let tourQuality = fs.readFileSync('src/features/showcase/tour-quality.js', 'utf8');
tourQuality = tourQuality.replace(
  "  document.addEventListener('flowtribe:tour-open', () => {\n    const trigger = document.querySelector('[aria-label=\"Show me round Flow Tribe\"]');\n    if (trigger) trigger.click();\n  });\n\n",
  '',
);
fs.writeFileSync('src/features/showcase/tour-quality.js', tourQuality);

console.log('PR27 cleanup applied');
