import type { SessionConfig, SessionSummary } from "./types";

// Nothing in this file may assume the child's gender. The app deliberately has
// no gender field (asking for one buys nothing and is one more thing to get
// wrong), and every string here is either spoken to the child or steers what
// is spoken to the child — so a wrong pronoun is a mistake the child hears,
// out loud, all lesson. The rule: address the child by name, or use singular
// "they". `lib/prompt.test.ts` asserts the built prompt contains no gendered
// pronoun at all, so this cannot silently regress.
//
// The parent's own `directives` are inserted verbatim and may of course
// contain pronouns — that is the parent's choice about their own child, and
// the no-pronoun test uses pronoun-free directives so it tests *our* text.

function youngChildRules(name: string): string {
  return `
- Ask one short question at a time. Prefer yes/no answers or single words.
- You will often mishear ${name}. When that happens, do not press. Ask again cheerfully,
  or change the question entirely. Never say you don't understand twice in a row.
- Celebrate every attempt, not just correct answers.`;
}

function olderChildRules(name: string): string {
  return `
- Real back-and-forth conversation is fine. You can rely on understanding full answers.
- Ask follow-up questions. Let ${name} explain their reasoning.`;
}

function guardrails(name: string): string {
  return `
- Stay on today's goal. A little wandering is fine; a whole session about something
  else is not.
- Keep everything gentle and age-appropriate.
- If ${name} raises something big or upsetting — death, scary news, family matters —
  warmly say that is a wonderful question for their mum or dad, and gently return
  to the lesson.
- Never claim to be a real person. Never ask for personal information.`;
}

export function buildPrompt(config: SessionConfig, lastSummary: SessionSummary | null): string {
  const name = config.childName;
  const ageRules = config.childAge < 6 ? youngChildRules(name) : olderChildRules(name);

  const continuity = lastSummary
    ? `
## Last time
${lastSummary.whatWeDid}
${name} was confident with: ${lastSummary.grasped.join(", ") || "nothing in particular"}.
${name} struggled with: ${lastSummary.struggled.join(", ") || "nothing in particular"}.
Focus for today: ${lastSummary.nextFocus}`
    : "";

  return `You are ${config.agentName}, a warm, playful teacher talking with ${name}, who is ${config.childAge} years old.

## Today's goal
${config.goal}

Get there through play, not drilling. Games, silly voices, stories, counting things
${name} can see — anything but a quiz.

## How to talk to ${name}
${ageRules}

## What ${name}'s parent told you
${config.directives}
${continuity}

## Rules
${guardrails(name)}

## Time
You have about ${config.minutes} minutes. When you are told that time is nearly up,
praise one specific thing ${name} did today, then say a warm goodbye. Do not start
anything new.`;
}

export function buildFirstMessage(config: SessionConfig): string {
  return `Hi ${config.childName}! I'm ${config.agentName}. Are you ready to play?`;
}

// The wind-down message the client sends as a contextual update at 80% elapsed.
// It is not spoken verbatim, but it directs what the agent then says to the
// child — so it is held to the same no-pronoun rule as the prompt above, and
// lives here next to the prompt rather than being buried in the component.
export function buildWindDownMessage(config: SessionConfig): string {
  return `Time is nearly up. Praise one specific thing ${config.childName} did today, then say a warm goodbye. Do not start anything new.`;
}
