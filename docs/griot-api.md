# Griot API contract

## `griot.chat`

Authenticated. Requires `dashboard:self`.

Request payload:

```json
{
  "message": "I lost the evening I planned for this. What should I do tomorrow?",
  "history": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ],
  "route": "/dashboard"
}
```

The browser sends only a short recent conversation window. It never sends the member ID; the server derives the member from the authenticated session.

Successful response data:

```json
{
  "text": "The interruption changes the route, not the destination...",
  "action": {
    "route": "/adapt",
    "label": "Adapt this path"
  },
  "grounded": true
}
```

`action` may be `null`, a whitelisted Flow route, or a guided-tour event. Model output cannot choose an arbitrary URL or client action.

The server builds the model context from bounded current Flow data, calls the Meta Llama API using a credential held in Script Properties, and returns only the Griot response. Provider credentials are never returned to the browser.
