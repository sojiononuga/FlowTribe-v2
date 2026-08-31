const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwWWVFp0K9oJKkZsnOackCSCmeAUPxZLRANX9v1YN0Dl-Y3VdTg_4Qp5_s-arhYZuOB/exec';
const MODEL = 'gpt-4o-mini-tts';
const VOICE = 'marin';
const MAX_SPEECH = 3500;
const FLOW_TIMEOUT_MS = 8000;
const SPEECH_TIMEOUT_MS = 18000;
const PUBLIC_PREVIEWS = Object.freeze({
  intro: 'Welcome to Flow Tribe. When life changes the plan, Flow changes the path, not the goal. Start with what matters. We will help you keep moving.',
  direction: 'Start with a goal that matters. Flow keeps the destination visible while the route is allowed to change.',
  action: 'Turn intention into one useful action. Flow keeps the next credible move clear enough to act on now.',
  adapt: 'When reality changes, change the path. Flow uses disruption as new information and helps you find a smaller or better route.',
  momentum: 'Make recovery count as progress. Evidence, return and shared momentum keep progress visible through interruption.',
});

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError('NOT_FOUND', "We couldn't find that.", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('VALIDATION', 'That request was not valid.', 400);
  }

  const token = String(body?.token || '');
  const preview = String(body?.preview || '');
  const publicText = PUBLIC_PREVIEWS[preview] || '';
  const text = (publicText || String(body?.text || '').trim()).slice(0, MAX_SPEECH);
  if (!token && !publicText) return jsonError('SESSION_EXPIRED', 'Your session has ended. Sign in again.', 401);
  if (!text) return jsonError('VALIDATION', 'There is nothing for Griot to say.', 400);

  if (!publicText) {
    const session = await flowCall(token, body);
    if (!session.ok) {
      return new Response(JSON.stringify(session), {
        status: session?.error?.code === 'SESSION_EXPIRED' ? 401 : 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }

  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!baseUrl || !apiKey) return jsonError('SERVER_ERROR', 'Griot voice is not available just now.', 503);

  const spoken = text.replace(/\bGriot\b/gi, 'Gree-oh');
  let response;
  try {
    response = await fetchWithTimeout(`${openAiBase(baseUrl)}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: spoken,
        response_format: 'mp3',
        instructions: 'Warm, grounded, intelligent and understated. Natural conversational rhythm; never announcer-like or overly cheerful. A subtle cosmopolitan British-West-African cadence is welcome if natural, never caricatured. Pronounce Gree-oh exactly as written, with no final T sound.',
      }),
    }, SPEECH_TIMEOUT_MS);
  } catch {
    return jsonError('SERVER_ERROR', 'Griot voice could not start just now.', 502);
  }

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

function openAiBase(value) {
  return String(value || '').replace(/\/$/, '').replace(/\/v1$/, '') + '/v1';
}

async function flowCall(token, requestBody) {
  let response;
  try {
    response = await fetchWithTimeout(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'auth.session',
        payload: {},
        token,
        requestId: String(requestBody?.requestId || `voice-${crypto.randomUUID()}`),
        clientVersion: '2.1.0',
      }),
      redirect: 'follow',
    }, FLOW_TIMEOUT_MS);
  } catch {
    return { ok: false, error: { code: 'NETWORK', message: 'Flow Tribe could not reach the server.' }, meta: {} };
  }

  try {
    return await response.json();
  } catch {
    return { ok: false, error: { code: 'SERVER_ERROR', message: 'Flow Tribe received an invalid server response.' }, meta: {} };
  }
}

function jsonError(code, message, status) {
  return new Response(JSON.stringify({ ok: false, error: { code, message }, meta: {} }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
