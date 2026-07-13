# AI Powered Teacher

A Next.js app where a parent configures a voice AI agent
([ElevenLabs Agents Platform](https://elevenlabs.io/agents-platform)) and hands
it to their child for a short spoken lesson.

It runs the same on your laptop and deployed to Vercel. A shared passcode
(`APP_PASSCODE`) gates the whole app so a public URL cannot spend your
ElevenLabs and Anthropic credits. There is no database and no server-side
storage: each child's profile, lesson transcripts, and summaries live in the
browser's local storage on the device you use, so history is per-device — clear
the browser's data and it is gone.

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
