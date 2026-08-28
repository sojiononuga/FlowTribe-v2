# Griot deployment contract

Griot requires the existing Flow Tribe Apps Script web app plus one protected Meta Llama API credential.

## Script Properties

Set `FT_GRIOT_LLAMA_API_KEY` to the Meta Llama API key.

Optional: set `FT_GRIOT_LLAMA_MODEL` to override the default model (`Llama-4-Maverick-17B-128E-Instruct-FP8`).

The service also accepts `LLAMA_API_KEY` or `META_API_KEY` as backwards-compatible property names, but `FT_GRIOT_LLAMA_API_KEY` is the canonical Flow Tribe setting.

## Apps Script deployment

The manifest includes the `script.external_request` OAuth scope because `GriotService` calls Meta's hosted Llama API from the server. A new Apps Script deployment/authorization is therefore required when this capability is first released.

The production web-app URL does not change. The browser continues to call the existing Flow Tribe API endpoint; only the server calls Meta.

## Frontend

No provider credential belongs in Netlify, the repository, `config.js`, browser storage or network payloads sent from the browser. The browser calls only authenticated `griot.chat` on the Flow Tribe API.
