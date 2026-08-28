# Griot — AI Architecture and Competition Disclosure

## Product identity

**Griot** is the intelligent conversational companion inside **Flow Tribe**.

The user-facing product is intentionally branded Griot rather than with the name of the underlying model provider. Griot is part of the Flow Tribe experience: it helps a member interpret their current direction, progress, constraints, interruption and recovery, and work out the next credible move.

## Underlying AI technology

Griot's generative conversation is powered by the **Meta Llama API**. The server-side integration uses Meta's hosted chat-completions API. The model is configurable through a protected Apps Script Script Property; the default implementation uses `Llama-4-Maverick-17B-128E-Instruct-FP8`.

This provider relationship must be declared accurately in competition/submission material. It does not need to become the user-facing name of the assistant.

## Conversation architecture

Typed and spoken input enter the same Griot conversation path:

1. The member types a message or uses the microphone.
2. Browser speech recognition converts spoken input to text when that capability is available.
3. The Flow Tribe client sends the message, a short recent conversation window and the current application route to the authenticated `griot.chat` action.
4. The server constructs a deliberately minimal Flow context from the authenticated member's current direction, rhythm, constraints and recent movement.
5. The server calls the Meta Llama API with the Griot system instructions and that bounded context.
6. Griot returns a conversational answer and, when useful, one whitelisted Flow action such as Show up, Adapt or Review direction.
7. The same selected on-device Griot voice can speak the response and narrate the guided tour.

## Data minimisation and security

The Meta Llama credential is stored only in Apps Script Script Properties and is never sent to the browser.

The Griot model context intentionally excludes authentication tokens, PIN material, credentials, email addresses, phone numbers and administrative data. Conversation history is capped, strings are length-limited, model-recommended navigation is mapped through a fixed allow-list, and `griot.chat` is authenticated and rate-limited through the existing Flow Tribe security boundary.

The browser never decides which member's Flow context is sent. The server derives the member from the authenticated session.

## Voice

Griot does not expose the operating system's full voice catalogue. Flow Tribe selects a small number of suitable English voices from those genuinely available on the device and presents them as product choices such as **Griot — Warm & grounded**, **Calm Guide** and **Clear Coach**.

An **African English** option is shown only when the device actually provides a matching African-English voice locale. Flow Tribe does not simulate an accent through pitch manipulation.

Speech synthesis and browser speech recognition are device/browser capabilities; the generative conversational answer itself comes from the Meta Llama-powered Griot server path.

## Mobile treatment

Griot is designed as a first-class mobile interaction. The conversation surface tracks the browser's visual viewport so the on-screen keyboard and mobile browser chrome do not bury the composer. The input uses a mobile-safe font size, microphone/send controls meet touch-target expectations, safe-area insets are respected, and the conversation keeps a single shared history whether the member types or speaks.
