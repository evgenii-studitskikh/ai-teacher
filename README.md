# AI Powered Teacher

A local-only Next.js app where a parent configures a voice AI agent
([ElevenLabs Agents Platform](https://elevenlabs.io/agents-platform)) and hands
it to their child for a short spoken lesson.

This app runs on your machine only. There is no auth, no deployment, and no
database — session data (once added) lives in a local, gitignored `data/`
directory.

## Setup

See [`SETUP.md`](./SETUP.md) for the one-time ElevenLabs agent setup and
`.env.local` configuration. You must complete that before running the app.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start**, and
allow microphone access.
