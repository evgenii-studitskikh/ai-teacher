# One-time setup

## 1. Create the ElevenLabs agent

1. Go to https://elevenlabs.io/app/agents and create a new agent. Any name; we override everything at runtime.
2. Copy its **Agent ID**.

## 2. Enable overrides (CRITICAL — silent failure if skipped)

In the agent's **Security** settings, enable overrides for **all** of:

- System prompt
- First message
- Language
- Voice

If these are not enabled, ElevenLabs **silently ignores** the values we send at
session start. The agent will run happily with its dashboard defaults and you
will have no error message to debug. If your prompt or voice "isn't taking",
this is why.

## 3. Fill in `.env.local`

    ELEVENLABS_API_KEY=...
    ELEVENLABS_AGENT_ID=...
    ANTHROPIC_API_KEY=...
