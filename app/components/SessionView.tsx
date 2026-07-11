"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useCallback, useState } from "react";

function SessionControls() {
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => console.log("connected"),
    onDisconnect: () => console.log("disconnected"),
    onMessage: (msg) => console.log("MESSAGE EVENT SHAPE:", msg),
    // NOTE: the installed @elevenlabs/react (v1.10.0) onError callback signature is
    // `(message: string, context?: any) => void`, not `(error: Error) => void` as in
    // some older docs/examples. Typed to match the installed SDK.
    onError: (message: string) => setError(message),
    overrides: {
      agent: {
        prompt: { prompt: "You are Robo, a warm, playful teacher. Say hello and ask the child their name." },
        firstMessage: "Hi! I'm Robo. What's your name?",
        language: "en",
      },
    },
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("I need microphone permission to talk. Please allow it and try again.");
      return;
    }
    const res = await fetch("/api/signed-url");
    if (!res.ok) {
      setError("Could not start the session. Check your keys in .env.local.");
      return;
    }
    const { signedUrl } = await res.json();
    await conversation.startSession({ signedUrl });
  }, [conversation]);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>AI Teacher</h1>
      <p>Status: {conversation.status}</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button onClick={start} disabled={conversation.status === "connected"}>
        Start
      </button>
      <button onClick={() => conversation.endSession()} disabled={conversation.status !== "connected"}>
        End session
      </button>
    </main>
  );
}

export default function SessionView() {
  // @elevenlabs/react requires useConversation() to be called within a
  // ConversationProvider (it throws "must be used within a ConversationProvider"
  // otherwise) — this wasn't needed in older versions of the SDK, but is required
  // by the version installed here (see task-1-report.md for details).
  return (
    <ConversationProvider>
      <SessionControls />
    </ConversationProvider>
  );
}
