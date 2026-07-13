# One-time setup

## 1. Create the ElevenLabs agent

1. Go to https://elevenlabs.io/app/agents and create a new agent. Any name; we override everything at runtime.
2. Copy its **Agent ID**.

## 2. Enable overrides (CRITICAL — nothing works without this)

In the agent's **Security** settings, enable overrides for **all four** of:

- System prompt
- First message
- Language
- Voice

Everything this app configures — the teaching prompt (which carries every
child-safety guardrail), the greeting, the language and the voice — is sent as
an ElevenLabs *override* at session start. A new agent has these toggles **off**
by default.

If a field's toggle is off, ElevenLabs does not ignore our value: it **rejects
the whole conversation**. The websocket opens, the server reads our config, and
then closes it with code `1008` and a message naming the offending field —
e.g. `Override for field 'voice_id' is not allowed by config.` The session dies
about a second after you press Start, before a word is spoken.

The app now shows you that message verbatim. If you see one, it is telling you
exactly which toggle to flip.

## 3. Fill in `.env.local`

    ELEVENLABS_API_KEY=...
    ELEVENLABS_AGENT_ID=...
    ANTHROPIC_API_KEY=...
    APP_PASSCODE=...

## 4. Set the passcode (CRITICAL — the app is unusable without it)

The whole app — the page and every `/api/*` route — sits behind a single
shared passcode, checked by `middleware.ts`. Set `APP_PASSCODE` to any
value you like **both** in your local `.env.local` **and** in the Vercel
project's environment variables (Project Settings → Environment Variables)
before deploying.

This is deliberate and fails closed: if `APP_PASSCODE` is not set, every
request — the page, `/api/signed-url`, `/api/voices`, `/api/summarize` — is
refused, including a request that submits the correct-looking passcode. A
deploy that forgets to set it is unusable, not unprotected, because those
routes spend your ElevenLabs and Anthropic credits.
