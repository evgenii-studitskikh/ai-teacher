import type { Language, SessionConfig, SessionSummary, ToyInfo } from "./types";

// Every language the app offers, with the two things it needs to actually teach
// in that language.
//
// `greeting` matters more than it looks. ElevenLabs speaks the `first_message`
// override VERBATIM — it does not translate it — so this string is, literally,
// the first thing the child hears. It used to be hardcoded English, which meant
// a Russian-speaking five-year-old was greeted in a language they may not know,
// while the speech recogniser was already listening for Russian.
//
// Two constraints on every greeting:
//   1. It must contain both names. The override canary (lib/overrides.ts)
//      compares the agent's first spoken turn against this string and requires
//      the child's and the agent's names to appear in it. That canary is the
//      app's only defence against the child talking to a model with none of our
//      safety guardrails, so a greeting that dropped a name would quietly
//      disable it.
//   2. It must not assume the child's sex. Russian and Spanish inflect
//      adjectives for gender, so the obvious translation of "Are you ready?"
//      ("Готова?" / "¿Lista?") picks one — which this app never does. The
//      phrasing below sidesteps it entirely ("Давай поиграем?" / "¿Jugamos?" —
//      "shall we play?"), which is also just warmer.
//
// Typed as a Record over the Language union, so adding a language to the union
// without giving it a greeting is a compile error rather than an English
// greeting nobody notices until a child is sitting in front of it.
const LANGUAGES: Record<Language, { name: string; greeting: (child: string, agent: string) => string }> = {
  en: {
    name: "English",
    greeting: (child, agent) => `Hi ${child}! I'm ${agent}. Are you ready to play?`,
  },
  ru: {
    name: "Russian",
    greeting: (child, agent) => `Привет, ${child}! Я ${agent}. Давай поиграем?`,
  },
  es: {
    name: "Spanish",
    greeting: (child, agent) => `¡Hola ${child}! Soy ${agent}. ¿Jugamos?`,
  },
  de: {
    name: "German",
    greeting: (child, agent) => `Hallo ${child}! Ich bin ${agent}. Wollen wir spielen?`,
  },
};

export function languageName(language: Language): string {
  return LANGUAGES[language].name;
}

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = (
  Object.keys(LANGUAGES) as Language[]
).map((value) => ({ value, label: LANGUAGES[value].name }));

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

// Toy-mode guardrails. Identical child-safety spine as guardrails() above, with
// one deliberate change: a child playing with a toy character is the whole
// point, so "Never claim to be a real person" is replaced by a line that allows
// the fictional toy persona while still forbidding impersonating a real human.
function toyGuardrails(name: string, toyName: string): string {
  return `
- Keep everything gentle and age-appropriate.
- If ${name} raises something big or upsetting — death, scary news, family matters —
  warmly say that is a wonderful question for their mum or dad, and gently return
  to playing.
- You may play the part of ${toyName}, but never claim to be a real living person.
- Never ask for personal information.`;
}

// The opening + persona paragraph, which is the only part that differs between
// the two toy modes.
function toyPersona(config: SessionConfig, toy: ToyInfo): string {
  const name = config.childName;
  if (config.toyMode === "third-person") {
    return `You are ${config.agentName}, a warm, playful guide helping ${name}, who is ${config.childAge}, play with their ${toy.name} — ${toy.character}.
You are NOT the toy. You are a friendly helper who suggests games, cheers ${name} on, and voices ${toy.name} now and then to bring it to life.
${toy.name}'s personality: ${toy.personality}.`;
  }
  return `You ARE ${toy.name} — ${toy.character}. You are a toy, and ${name}, who is ${config.childAge}, is holding you and playing with you right now.
Speak in the first person, always as ${toy.name}. Stay in character the whole time — react and sound like ${toy.name} would.
Your personality: ${toy.personality}.`;
}

function buildToyPrompt(config: SessionConfig, toy: ToyInfo, lastSummary: SessionSummary | null): string {
  const name = config.childName;
  const ageRules = config.childAge < 6 ? youngChildRules(name) : olderChildRules(name);
  const language = LANGUAGES[config.language].name;
  const continuity = lastSummary
    ? `
## Last time
Last time, ${name} played: ${lastSummary.whatWeDid}`
    : "";

  return `${toyPersona(config, toy)}

## Language
Speak ONLY in ${language}. Every word you say to ${name} is in ${language}, including
your praise and your goodbye. ${name} may not understand any other language.

## What ${name} wants to do
${config.goal}

Make this playful, not a lesson — games, silly voices, stories, pretend adventures.
Follow ${name}'s lead. Ideas for playing with ${name}: ${toy.howToPlay}

## How to talk to ${name}
${ageRules}

## What ${name}'s parent told you
${config.directives}
${continuity}

## Rules
${toyGuardrails(name, toy.name)}

## Time
You have about ${config.minutes} minutes. When you are told that time is nearly up,
praise one specific thing ${name} did today, then say a warm goodbye. Do not start
anything new.`;
}

export function buildPrompt(config: SessionConfig, lastSummary: SessionSummary | null): string {
  // A toy session is identified purely by config.toy being present. Everything
  // below this line is the unchanged lesson prompt.
  if (config.toy) return buildToyPrompt(config, config.toy, lastSummary);

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

  // The `language` override configures ElevenLabs' speech-to-text and
  // text-to-speech models — it does not tell the LLM what language to answer
  // in. Probing the live API showed the model does pick up the child's language
  // once the child speaks, but that leaves the very first exchange to luck, so
  // we say it outright. (The instructions themselves stay in English: models
  // follow English instructions well, and one language of prompt is one prompt
  // to maintain.)
  const language = LANGUAGES[config.language].name;

  return `You are ${config.agentName}, a warm, playful teacher talking with ${name}, who is ${config.childAge} years old.

## Language
Speak ONLY in ${language}. Every word you say to ${name} is in ${language}, including
your praise and your goodbye. ${name} may not understand any other language.

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

// The first thing the child hears. ElevenLabs speaks this verbatim — see the
// LANGUAGES table above for why that makes it load-bearing in two directions.
export function buildFirstMessage(config: SessionConfig): string {
  return LANGUAGES[config.language].greeting(config.childName, config.agentName);
}

// The wind-down message the client sends as a contextual update at 80% elapsed.
// It is not spoken verbatim, but it directs what the agent then says to the
// child — so it is held to the same no-pronoun rule as the prompt above, and
// lives here next to the prompt rather than being buried in the component.
export function buildWindDownMessage(config: SessionConfig): string {
  return `Time is nearly up. Praise one specific thing ${config.childName} did today, then say a warm goodbye — in ${LANGUAGES[config.language].name}, as always. Do not start anything new.`;
}
