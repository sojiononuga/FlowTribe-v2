# Griot — AI Architecture and Competition Disclosure

## Product identity

**Griot** is the intelligent conversational companion inside **Flow Tribe**.

The user-facing product is intentionally branded Griot rather than with the name of the underlying model provider. Griot is part of the Flow Tribe experience: it helps a member interpret their current direction, progress, constraints, interruption and recovery, and work out the next credible move.

## Underlying AI technology

Griot's production conversation layer uses a **Meta Llama** model, currently **Llama 4 Maverick**, through **Netlify AI Gateway / OpenRouter**. Netlify supplies the gateway credential at function runtime, so Flow Tribe does not store a provider API key in the repository or browser.

The underlying conversational model remains Meta technology. The routing layer is Netlify AI Gateway and OpenRouter. This provider relationship should be declared accurately in competition/submission material without turning the provider name into the user-facing identity of the assistant.

The earlier Apps Script implementation using the Meta Model API / Muse Spark remains in the repository as a governed fallback and deployment handoff, but the production web client no longer depends on deploying Griot actions into Apps Script.

## Conversation architecture

Typed and spoken input enter the same Griot conversation path:

1. The member types a message or uses the microphone.
2. Browser speech recognition converts spoken input to text when that capability is available.
3. The Flow Tribe client sends the message, a short recent conversation window, the current application route and the existing Flow session token to the same-origin Netlify Griot Function.
4. The Function validates that session against the existing Flow Tribe Apps Script backend and requests the authenticated member's dashboard context.
5. The Function reduces that response to a deliberately small Flow context covering direction, rhythm, constraints and recent movement.
6. The Function calls Meta Llama through Netlify AI Gateway / OpenRouter with the Griot system instructions and bounded context.
7. Griot returns a conversational answer and, when useful, one whitelisted Flow action such as Show up, Adapt or Review direction.
8. The same server-generated Griot voice can speak the response and narrate the guided tour.

## Data minimisation and security

Provider credentials are injected by Netlify AI Gateway only inside the serverless function runtime. They are not committed to GitHub, stored in browser code or sent to the member.

The Griot model context intentionally excludes authentication tokens, PIN material, credentials, email addresses, phone numbers and administrative data. The Flow session token is used only server-to-server to validate the existing Flow session and retrieve the member's authorised dashboard context; it is not included in the model prompt.

Conversation history is capped, strings are length-limited, model-recommended navigation is mapped through a fixed allow-list, and the browser never chooses which member's Flow context is supplied. The authenticated Flow backend remains the source of member identity and authorisation.

## Voice layer

Griot speech is generated server-side through the OpenAI speech interface exposed through Netlify AI Gateway so the audible identity is consistent across desktop and mobile. The production target is `gpt-4o-mini-tts` with the `cedar` voice.

The speech boundary explicitly renders the written name **Griot** as **“Gree-oh”** and instructs the voice never to pronounce the final T. Device speech synthesis remains fallback-only if server speech is unavailable.

## Mobile treatment

Griot is designed as a first-class mobile interaction. The conversation surface tracks the browser's visual viewport so the on-screen keyboard and mobile browser chrome do not bury the composer. The input uses a mobile-safe font size, microphone/send controls meet touch-target expectations, safe-area insets are respected, and the conversation keeps a single shared history whether the member types or speaks.
