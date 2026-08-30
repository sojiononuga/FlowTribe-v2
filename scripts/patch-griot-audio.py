from pathlib import Path

p = Path('src/features/showcase/member-assist.js')
s = p.read_text()
anchor = "  document.addEventListener('flowtribe:tour-open', () => tour.open());\n\n  return node;"
replacement = """  document.addEventListener('flowtribe:tour-open', () => tour.open());

  // Unlock Web Audio from a real member gesture so asynchronous server speech
  // can play later on iOS/Safari as well as desktop browsers.
  node.addEventListener('pointerdown', primeVoicePlayback, { once: true, capture: true });
  node.addEventListener('touchstart', primeVoicePlayback, { once: true, capture: true, passive: true });
  node.addEventListener('keydown', primeVoicePlayback, { once: true, capture: true });

  return node;"""
if anchor not in s:
    raise SystemExit('member-assist listener anchor missing')
s = s.replace(anchor, replacement, 1)

start = s.index('let activeVoiceAudio = null;')
end = s.index('function supportsSpeech()', start)
block = r'''let activeVoiceAudio = null;
let activeVoiceUrl = '';
let activeVoiceSource = null;
let voiceAudioContext = null;
let voiceRequestToken = 0;

function primeVoicePlayback() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!voiceAudioContext) voiceAudioContext = new AudioContextClass();
    if (voiceAudioContext.state === 'suspended') voiceAudioContext.resume().catch(() => {});
    return voiceAudioContext;
  } catch { return null; }
}

function speakText(text, settings, status, callbacks = {}) {
  const token = ++voiceRequestToken;
  stopVoicePlayback({ preserveToken: true });
  primeVoicePlayback();
  status.textContent = 'Griot is preparing voice.';

  call('griot.speak', { text: String(text || ''), rate: settings.rate }, { timeout: 35000, retry: false })
    .then((result) => {
      if (token !== voiceRequestToken) return;
      const encoded = String(result?.audioBase64 || '');
      if (!encoded) throw new Error('No speech audio returned.');
      return playServerVoice(encoded, String(result?.mimeType || 'audio/mpeg'), token, status, callbacks);
    })
    .catch(() => {
      if (token === voiceRequestToken) speakDeviceFallback(text, settings, status, callbacks, token);
    });
}

async function playServerVoice(encoded, mimeType, token, status, callbacks) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

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

function playHtmlServerAudio(bytes, mimeType, token, status, callbacks) {
  cleanupHtmlAudio();
  activeVoiceUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const audio = new Audio();
  activeVoiceAudio = audio;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.src = activeVoiceUrl;
  audio.onplay = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot is speaking.';
    callbacks.onStart?.();
  };
  audio.onended = () => {
    if (token !== voiceRequestToken) return;
    cleanupHtmlAudio();
    status.textContent = 'Griot voice ready.';
    callbacks.onEnd?.();
  };
  audio.onerror = () => {
    if (token !== voiceRequestToken) return;
    cleanupHtmlAudio();
    callbacks.onError?.();
  };
  return audio.play();
}

function speakDeviceFallback(text, settings, status, callbacks, token) {
  if (!supportsSpeech()) {
    status.textContent = 'Griot voice is unavailable right now.';
    callbacks.onError?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text || '').replace(/\bGriot\b/gi, 'Gree-oh'));
  utterance.rate = settings.rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot is speaking with the device fallback.';
    callbacks.onStart?.();
  };
  utterance.onend = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot voice ready.';
    callbacks.onEnd?.();
  };
  utterance.onerror = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot voice could not start.';
    callbacks.onError?.();
  };
  window.speechSynthesis.speak(utterance);
}

function cleanupHtmlAudio() {
  if (activeVoiceAudio) {
    activeVoiceAudio.onplay = null;
    activeVoiceAudio.onended = null;
    activeVoiceAudio.onerror = null;
    try { activeVoiceAudio.pause(); } catch { /* Already stopped. */ }
    activeVoiceAudio = null;
  }
  if (activeVoiceUrl) {
    URL.revokeObjectURL(activeVoiceUrl);
    activeVoiceUrl = '';
  }
}

function stopVoicePlayback({ preserveToken = false } = {}) {
  if (!preserveToken) voiceRequestToken += 1;
  if (activeVoiceSource) {
    activeVoiceSource.onended = null;
    try { activeVoiceSource.stop(); } catch { /* Already stopped. */ }
    try { activeVoiceSource.disconnect(); } catch { /* Already disconnected. */ }
    activeVoiceSource = null;
  }
  cleanupHtmlAudio();
  if (supportsSpeech()) window.speechSynthesis.cancel();
}

'''
p.write_text(s[:start] + block + s[end:])

p = Path('tests/griot-source-contract.mjs')
s = p.read_text()
a = "assert(assist.includes(\"call('griot.speak'\"), 'Voice playback must use the authenticated server speech action first.');"
x = """assert(assist.includes('function primeVoicePlayback()'), 'Griot must unlock mobile audio from a member gesture.');
assert(assist.includes('AudioContext') && assist.includes('webkitAudioContext'), 'Griot must support Web Audio on desktop and iOS Safari.');
assert(assist.includes('decodeAudioData') && assist.includes('createBufferSource'), 'Server voice must use Web Audio where available.');
assert(assist.includes(\"audio.setAttribute('playsinline', '')\"), 'Mobile server audio must play inline.');
assert(assist.includes('speakText(step.narration'), 'Show me round must share the Griot server voice path.');"""
if a not in s:
    raise SystemExit('source-contract anchor missing')
p.write_text(s.replace(a, a + '\n' + x, 1))
