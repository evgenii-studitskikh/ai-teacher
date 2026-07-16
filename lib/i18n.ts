import type { PresetTeacherId } from "./preset-teachers";
import type { Language, SessionConfig } from "./types";

// Every string the parent sees, in every language the app teaches in. Typed
// as a Record over the Language union for the same reason the greetings are
// (lib/prompt.ts): adding a language to the union without a complete UI
// translation is a compile error, not a silent English fallback nobody
// notices until a parent is sitting in front of it.
//
// Strings with runtime values in them are functions, mirroring how greetings
// interpolate names. Names pass through exactly as typed — a child called
// "Mia" is Mia in every language (lib/i18n.test.ts pins this down).
//
// The child-facing text (greetings, prompts) lives in lib/prompt.ts and is
// NOT here: this file is what the PARENT reads, that one is what the CHILD
// hears. The no-gendered-pronoun rule about the child applies to both.
export type UIStrings = {
  // Header
  languagePickerLabel: string;

  // ModePicker
  chooseMode: string;
  lessonTitle: string;
  lessonSub: string;
  toyTitle: string;
  toySub: string;

  // ConfigForm
  savedChildren: string;
  pickUp: string;
  who: string;
  what: string;
  how: string;
  childNameLabel: string;
  childAgeLabel: string;
  goalLabel: string;
  purposeLabel: string;
  goalPlaceholder: string;
  purposePlaceholder: string;
  extraLabel: string;
  extraPlaceholder: string;
  agentNameLabel: string;
  helperNameLabel: string;
  voiceLegend: string;
  loadingVoices: string;
  sessionLength: string;
  startSession: string;
  noVoices: string;
  voicesFailed: (detail: string) => string;
  profileFilled: (child: string, fields: string) => string;
  profileMatches: (child: string) => string;
  voiceSubstituted: (name: string) => string;
  playPreview: (name: string) => string;
  stopPreview: (name: string) => string;
  howShouldToyPlay: (name: string) => string;
  interactionMode: string;
  beTheToyTitle: string;
  beTheToyDesc: (toyName: string) => string;
  helpMePlayTitle: string;
  helpMePlayDesc: (toyName: string) => string;
  povIntro: (toyName: string) => string;
  // Human names for the SessionConfig keys a saved profile can fill in, for
  // the profileFilled note. Derived from SessionConfig so adding a config
  // field without a label here is a compile error. childName and language
  // are deliberately absent: neither is ever restored from a profile (see
  // ConfigForm's loadSaved); toy/toyMode are session-ephemeral, never in the
  // note.
  fieldNames: Record<
    Exclude<
      keyof SessionConfig,
      "childName" | "language" | "toy" | "toyMode" | "kidId" | "teacherId" | "teacherPersonality"
    >,
    string
  >;

  // SessionView
  gettingReady: string;
  overridesAlarmTitle: string;
  overridesDisabledBody: string;
  connecting: string;
  readyWhenYouAre: string;
  agentListening: (agent: string) => string;
  agentTalking: (agent: string) => string;
  nothingSaidYet: string;
  endSession: string;
  startBtn: string;
  enableOverridesFirst: string;
  micPermission: string;
  couldNotStart: string;

  // EndView
  savingTranscript: string;
  transcriptNotSaved: string;
  browserRefusedSave: string;
  doNotCloseTab: string;
  retrySaving: string;

  // SummaryView
  writingSummary: string;
  summaryMissingNote: string;
  retry: string;
  done: string;
  asrAlarm: (child: string) => string;
  persistNote: string;
  howItWent: string;
  engagementLabel: string;
  engagement: Record<"low" | "medium" | "high", string>;
  confidentWith: string;
  stillTricky: string;
  nextTime: string;
  couldNotWriteSummary: string;
  couldNotReachServer: string;

  // ToyScan
  scanToy: string;
  scanLead: string;
  noToySpotted: string;
  photoHttpError: (status: number) => string;
  photoReadError: string;
  lookingAtToy: string;
  takePhoto: string;
  back: string;

  // ToyConfirm
  confirmToy: string;
  personalityLabel: string;
  howYoullPlay: string;
  useThisToy: string;
  retakePhoto: string;

  // Unlock
  passcodeLabel: string;
  unlockBtn: string;
  wrongPasscode: string;
  unlockNetworkError: string;

  // KidPicker (home)
  whoIsLearning: string;
  addKid: string;
  ageShort: (age: number) => string;
  manage: string;
  save: string;
  cancel: string;

  // TeacherPicker
  whoWillTeach: string;
  presetBadge: string;
  toyBadge: string;
  lastTimeBadge: string;
  scanToyTitle: string;
  scanToySub: string;
  playingWith: (toyName: string) => string;
  presetTeachers: Record<PresetTeacherId, { name: string; description: string }>;

  // StartSheet
  todaysSession: string;
  durationLabel: string;
  minutesShort: (m: number) => string;
  changeSelection: string;

  // Manage
  kidsTab: string;
  teachersTab: string;
  edit: string;
  deleteAction: string;
  confirmDelete: string;
  duplicateAndEdit: string;
  newTeacher: string;
  teacherNameLabel: string;
  personalityFieldLabel: string;
  personalityPlaceholder: string;
  autoVoice: string;
  generateVoice: string;
  generatingVoice: string;
  voiceGenerated: string;
  voiceGenerateFailed: (detail: string) => string;
  nothingHereYet: string;
};

// The picker shows NATIVE names — a parent choosing their own language
// shouldn't need English to find it. `dir` is data here so no component ever
// writes `if (language === "he")`.
export const LANGUAGE_META: Record<Language, { nativeName: string; dir: "ltr" | "rtl" }> = {
  en: { nativeName: "English", dir: "ltr" },
  ru: { nativeName: "Русский", dir: "ltr" },
  es: { nativeName: "Español", dir: "ltr" },
  de: { nativeName: "Deutsch", dir: "ltr" },
  he: { nativeName: "עברית", dir: "rtl" },
  tl: { nativeName: "Tagalog", dir: "ltr" },
  uk: { nativeName: "Українська", dir: "ltr" },
};

const en: UIStrings = {
  languagePickerLabel: "Language",

  chooseMode: "Choose a mode",
  lessonTitle: "Lesson",
  lessonSub: "A short spoken lesson toward a goal you set.",
  toyTitle: "Interactive Toy",
  toySub: "Scan a real toy and bring it to life to play with.",

  savedChildren: "Saved children",
  pickUp: "Pick up where you left off",
  who: "Who",
  what: "What",
  how: "How",
  childNameLabel: "Child's name",
  childAgeLabel: "Child's age",
  goalLabel: "Goal",
  purposeLabel: "Purpose of play",
  goalPlaceholder: "Count to 10",
  purposePlaceholder: "Practice colours; wind down before bed",
  extraLabel: "Extra instructions",
  extraPlaceholder: "Shy — praise them a lot. Loves dinosaurs.",
  agentNameLabel: "Agent name",
  helperNameLabel: "Helper's name",
  voiceLegend: "Voice",
  loadingVoices: "Loading voices…",
  sessionLength: "Session length (minutes)",
  startSession: "Start session",
  noVoices: "Your ElevenLabs account has no voices in it. Add one at elevenlabs.io, then reload.",
  voicesFailed: (detail) =>
    `Could not load the voice list: ${detail} Check that ELEVENLABS_API_KEY in .env.local is set and valid, and that \`npm run dev\` is still running, then reload this page. Until the voices load, a session cannot be started.`,
  profileFilled: (child, fields) =>
    `Filled in from ${child}'s last session: ${fields}. Anything you already changed was left alone.`,
  profileMatches: (child) =>
    `Found a saved profile for ${child}; everything in it matches what's on the form already.`,
  voiceSubstituted: (name) =>
    `The voice saved for this child is no longer in your ElevenLabs account, so ${name} is selected instead. Pick a different one below if you'd rather — preview them with ▶.`,
  playPreview: (name) => `Play preview of ${name}`,
  stopPreview: (name) => `Stop preview of ${name}`,
  howShouldToyPlay: (name) => `How should ${name} play?`,
  interactionMode: "Interaction mode",
  beTheToyTitle: "Be the toy",
  beTheToyDesc: (toyName) => `the AI talks as ${toyName}.`,
  helpMePlayTitle: "Help me play",
  helpMePlayDesc: (toyName) => `a guide helps the child play with ${toyName}.`,
  povIntro: (toyName) => `${toyName} will introduce itself by name when the session starts.`,
  fieldNames: {
    agentName: "agent name",
    voiceId: "voice",
    childAge: "age",
    goal: "goal",
    directives: "extra instructions",
    minutes: "session length",
  },

  gettingReady: "Getting ready…",
  overridesAlarmTitle: "Session stopped — overrides are not enabled",
  overridesDisabledBody:
    "Stopped the session immediately: this agent is ignoring the settings this app sends, " +
    "so your child would have been talking to an unguarded default agent — no safety rules, " +
    "no lesson, no chosen voice. Fix: open the agent at elevenlabs.io/app/agents, go to its " +
    "Security settings, and enable overrides for all four of System prompt, First message, " +
    "Language and Voice (see SETUP.md). Then start the session again.",
  connecting: "Connecting…",
  readyWhenYouAre: "Ready when you are",
  agentListening: (agent) => `${agent} is listening`,
  agentTalking: (agent) => `${agent} is talking`,
  nothingSaidYet: "Nothing said yet.",
  endSession: "End session",
  startBtn: "Start",
  enableOverridesFirst: "Enable overrides first, then start again",
  micPermission: "I need microphone permission to talk. Please allow it in your browser and try again.",
  couldNotStart: "Could not start the session. Check your keys in .env.local.",

  savingTranscript: "Saving the transcript…",
  transcriptNotSaved: "The transcript is NOT saved",
  browserRefusedSave: "The browser refused to save the transcript.",
  doNotCloseTab:
    "This lesson is still in this browser tab and nowhere else. Do not close or reload the tab — that would lose it for good. If your browser is in private mode or storage is full, fix that, then retry.",
  retrySaving: "Retry saving",

  writingSummary: "Writing the summary…",
  summaryMissingNote:
    "The transcript is saved on this device. Only the summary is missing, and the next session will simply start without one.",
  retry: "Retry",
  done: "Done",
  asrAlarm: (child) =>
    `Heads up: speech recognition struggled to understand ${child} this session. If this keeps happening, the transcripts are worth reading yourself.`,
  persistNote:
    "This report isn't saved on this device, so the next lesson will start without it. The lesson itself is fine — nothing about tonight's session was lost.",
  howItWent: "How it went",
  engagementLabel: "Engagement",
  engagement: { low: "low", medium: "medium", high: "high" },
  confidentWith: "Confident with",
  stillTricky: "Still tricky",
  nextTime: "Next time",
  couldNotWriteSummary: "Could not write the summary.",
  couldNotReachServer: "Could not reach the server.",

  scanToy: "Scan a toy",
  scanLead: "Take a clear photo of the toy, filling the frame.",
  noToySpotted: "I couldn't spot a toy in that photo. Try again with the toy filling the frame.",
  photoHttpError: (status) => `The photo could not be processed (HTTP ${status}).`,
  photoReadError: "Something went wrong reading the photo.",
  lookingAtToy: "Looking at the toy…",
  takePhoto: "📷 Take a photo of the toy",
  back: "Back",

  confirmToy: "Confirm the toy",
  personalityLabel: "Personality",
  howYoullPlay: "How you'll play",
  useThisToy: "Use this toy",
  retakePhoto: "Retake photo",

  passcodeLabel: "Passcode",
  unlockBtn: "Unlock",
  wrongPasscode: "That is not the passcode.",
  unlockNetworkError: "Could not reach the server. Check your connection and try again.",

  whoIsLearning: "Who's learning today?",
  addKid: "Add a child",
  ageShort: (age) => `Age ${age}`,
  manage: "Manage",
  save: "Save",
  cancel: "Cancel",

  whoWillTeach: "Who will teach?",
  presetBadge: "Built-in",
  toyBadge: "Toy",
  lastTimeBadge: "Last time",
  scanToyTitle: "Scan a toy",
  scanToySub: "Photograph a real toy and bring it to life.",
  playingWith: (toyName) => `Playing with ${toyName} — now pick a helper.`,
  presetTeachers: {
    generalist: { name: "Sunny", description: "A warm all-rounder for any topic." },
    storyteller: { name: "Luna", description: "Turns every lesson into a story." },
    mathCoach: { name: "Max", description: "Patient coach for numbers and counting." },
  },

  todaysSession: "Today's session",
  durationLabel: "How long?",
  minutesShort: (m) => `${m} min`,
  changeSelection: "Change",

  kidsTab: "Children",
  teachersTab: "Teachers",
  edit: "Edit",
  deleteAction: "Delete",
  confirmDelete: "Tap again to confirm",
  duplicateAndEdit: "Duplicate & edit",
  newTeacher: "New teacher",
  teacherNameLabel: "Name",
  personalityFieldLabel: "Personality",
  personalityPlaceholder: "Warm and curious. Loves puns. Always up for a pretend adventure.",
  autoVoice: "Automatic (best match)",
  generateVoice: "Generate a matching voice",
  generatingVoice: "Generating a voice…",
  voiceGenerated: "Voice created and selected.",
  voiceGenerateFailed: (detail) => `Could not generate a voice: ${detail} The best-match voice is still selected.`,
  nothingHereYet: "Nothing here yet.",
};

const ru: UIStrings = {
  languagePickerLabel: "Язык",

  chooseMode: "Выберите режим",
  lessonTitle: "Урок",
  lessonSub: "Короткий устный урок с целью, которую задаёте вы.",
  toyTitle: "Интерактивная игрушка",
  toySub: "Сфотографируйте настоящую игрушку и оживите её для игры.",

  savedChildren: "Сохранённые дети",
  pickUp: "Продолжите с того места, где остановились",
  who: "Кто",
  what: "Что",
  how: "Как",
  childNameLabel: "Имя ребёнка",
  childAgeLabel: "Возраст ребёнка",
  goalLabel: "Цель",
  purposeLabel: "Цель игры",
  goalPlaceholder: "Счёт до 10",
  purposePlaceholder: "Учим цвета; спокойная игра перед сном",
  extraLabel: "Дополнительные указания",
  extraPlaceholder: "Стесняется — почаще хвалите. Обожает динозавров.",
  agentNameLabel: "Имя агента",
  helperNameLabel: "Имя помощника",
  voiceLegend: "Голос",
  loadingVoices: "Загружаем голоса…",
  sessionLength: "Длительность занятия (минуты)",
  startSession: "Начать занятие",
  noVoices: "В вашем аккаунте ElevenLabs нет ни одного голоса. Добавьте голос на elevenlabs.io и перезагрузите страницу.",
  voicesFailed: (detail) =>
    `Не удалось загрузить список голосов: ${detail} Проверьте, что ELEVENLABS_API_KEY в .env.local задан и действителен, а \`npm run dev\` всё ещё запущен, затем перезагрузите страницу. Пока голоса не загрузятся, занятие начать нельзя.`,
  profileFilled: (child, fields) =>
    `Заполнено из прошлого занятия (${child}): ${fields}. Всё, что вы уже изменили, осталось как есть.`,
  profileMatches: (child) =>
    `Найден сохранённый профиль для ${child}; всё в нём совпадает с тем, что уже в форме.`,
  voiceSubstituted: (name) =>
    `Голоса, сохранённого для этого ребёнка, больше нет в вашем аккаунте ElevenLabs, поэтому выбран ${name}. Если хотите другой — выберите ниже, послушать можно кнопкой ▶.`,
  playPreview: (name) => `Прослушать голос ${name}`,
  stopPreview: (name) => `Остановить прослушивание ${name}`,
  howShouldToyPlay: (name) => `Как ${name} будет играть?`,
  interactionMode: "Режим взаимодействия",
  beTheToyTitle: "Быть игрушкой",
  beTheToyDesc: (toyName) => `ИИ говорит от лица ${toyName}.`,
  helpMePlayTitle: "Помоги мне играть",
  helpMePlayDesc: (toyName) => `помощник помогает ребёнку играть с ${toyName}.`,
  povIntro: (toyName) => `${toyName} представится по имени в начале занятия.`,
  fieldNames: {
    agentName: "имя агента",
    voiceId: "голос",
    childAge: "возраст",
    goal: "цель",
    directives: "дополнительные указания",
    minutes: "длительность",
  },

  gettingReady: "Готовимся…",
  overridesAlarmTitle: "Занятие остановлено — переопределения не включены",
  overridesDisabledBody:
    "Занятие остановлено немедленно: агент игнорирует настройки, которые отправляет это приложение, — " +
    "ребёнок говорил бы с агентом по умолчанию, без защитных правил, без урока и без выбранного голоса. " +
    "Как исправить: откройте агента на elevenlabs.io/app/agents, зайдите в его настройки Security и " +
    "включите переопределения для всех четырёх: System prompt, First message, Language и Voice " +
    "(см. SETUP.md). Затем начните занятие заново.",
  connecting: "Подключаемся…",
  readyWhenYouAre: "Готовы, когда вы готовы",
  agentListening: (agent) => `${agent} слушает`,
  agentTalking: (agent) => `${agent} говорит`,
  nothingSaidYet: "Пока ничего не сказано.",
  endSession: "Завершить занятие",
  startBtn: "Начать",
  enableOverridesFirst: "Сначала включите переопределения, затем начните снова",
  micPermission: "Мне нужен доступ к микрофону. Разрешите его в браузере и попробуйте ещё раз.",
  couldNotStart: "Не удалось начать занятие. Проверьте ключи в .env.local.",

  savingTranscript: "Сохраняем запись…",
  transcriptNotSaved: "Запись НЕ сохранена",
  browserRefusedSave: "Браузер отказался сохранить запись.",
  doNotCloseTab:
    "Это занятие существует только в этой вкладке браузера и больше нигде. Не закрывайте и не перезагружайте вкладку — иначе оно пропадёт навсегда. Если браузер в приватном режиме или хранилище переполнено, исправьте это и повторите.",
  retrySaving: "Повторить сохранение",

  writingSummary: "Пишем отчёт…",
  summaryMissingNote:
    "Запись сохранена на этом устройстве. Не хватает только отчёта — следующее занятие просто начнётся без него.",
  retry: "Повторить",
  done: "Готово",
  asrAlarm: (child) =>
    `Обратите внимание: распознавание речи плохо понимало ${child} на этом занятии. Если это повторяется, записи стоит читать самостоятельно.`,
  persistNote:
    "Этот отчёт не сохранён на устройстве, поэтому следующее занятие начнётся без него. Само занятие в порядке — ничего из сегодняшнего не потеряно.",
  howItWent: "Как всё прошло",
  engagementLabel: "Вовлечённость",
  engagement: { low: "низкая", medium: "средняя", high: "высокая" },
  confidentWith: "Уверенно",
  stillTricky: "Пока сложно",
  nextTime: "В следующий раз",
  couldNotWriteSummary: "Не удалось написать отчёт.",
  couldNotReachServer: "Не удалось связаться с сервером.",

  scanToy: "Сканировать игрушку",
  scanLead: "Сделайте чёткое фото игрушки крупным планом.",
  noToySpotted: "Не удалось разглядеть игрушку на этом фото. Попробуйте ещё раз, чтобы игрушка занимала весь кадр.",
  photoHttpError: (status) => `Не удалось обработать фото (HTTP ${status}).`,
  photoReadError: "Что-то пошло не так при чтении фото.",
  lookingAtToy: "Рассматриваем игрушку…",
  takePhoto: "📷 Сфотографировать игрушку",
  back: "Назад",

  confirmToy: "Подтвердите игрушку",
  personalityLabel: "Характер",
  howYoullPlay: "Как будете играть",
  useThisToy: "Играть с этой игрушкой",
  retakePhoto: "Переснять",

  passcodeLabel: "Код доступа",
  unlockBtn: "Открыть",
  wrongPasscode: "Это не тот код.",
  unlockNetworkError: "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.",

  whoIsLearning: "Кто сегодня занимается?",
  addKid: "Добавить ребёнка",
  // Russian numeral agreement: 1 год, 2–4 года, 5+ лет (11–14 always лет).
  ageShort: (age) => {
    const mod10 = age % 10;
    const mod100 = age % 100;
    if (mod10 === 1 && mod100 !== 11) return `${age} год`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${age} года`;
    return `${age} лет`;
  },
  manage: "Управление",
  save: "Сохранить",
  cancel: "Отмена",

  whoWillTeach: "Кто будет учить?",
  presetBadge: "Встроенный",
  toyBadge: "Игрушка",
  lastTimeBadge: "Прошлый раз",
  scanToyTitle: "Сканировать игрушку",
  scanToySub: "Сфотографируйте настоящую игрушку и оживите её.",
  playingWith: (toyName) => `Играем с ${toyName} — теперь выберите помощника.`,
  presetTeachers: {
    generalist: { name: "Санни", description: "Тёплый универсал на любую тему." },
    storyteller: { name: "Луна", description: "Превращает любой урок в сказку." },
    mathCoach: { name: "Макс", description: "Терпеливый тренер по цифрам и счёту." },
  },

  todaysSession: "Сегодняшнее занятие",
  durationLabel: "Как долго?",
  minutesShort: (m) => `${m} мин`,
  changeSelection: "Изменить",

  kidsTab: "Дети",
  teachersTab: "Учителя",
  edit: "Редактировать",
  deleteAction: "Удалить",
  confirmDelete: "Нажмите ещё раз для подтверждения",
  duplicateAndEdit: "Дублировать и редактировать",
  newTeacher: "Новый учитель",
  teacherNameLabel: "Имя",
  personalityFieldLabel: "Характер",
  personalityPlaceholder: "Тёплый и любопытный характер. Обожает каламбуры. Всегда за выдуманное приключение.",
  autoVoice: "Автоматически (лучшее совпадение)",
  generateVoice: "Сгенерировать подходящий голос",
  generatingVoice: "Создаём голос…",
  voiceGenerated: "Голос создан и выбран.",
  voiceGenerateFailed: (detail) => `Не удалось создать голос: ${detail} Голос с лучшим совпадением всё ещё выбран.`,
  nothingHereYet: "Здесь пока пусто.",
};

const es: UIStrings = {
  languagePickerLabel: "Idioma",

  chooseMode: "Elige un modo",
  lessonTitle: "Lección",
  lessonSub: "Una breve lección hablada hacia una meta que tú fijas.",
  toyTitle: "Juguete interactivo",
  toySub: "Escanea un juguete real y dale vida para jugar.",

  savedChildren: "Peques guardados",
  pickUp: "Continúa donde lo dejaste",
  who: "Quién",
  what: "Qué",
  how: "Cómo",
  childNameLabel: "Nombre del peque",
  childAgeLabel: "Edad del peque",
  goalLabel: "Meta",
  purposeLabel: "Propósito del juego",
  goalPlaceholder: "Contar hasta 10",
  purposePlaceholder: "Practicar los colores; relajarse antes de dormir",
  extraLabel: "Instrucciones adicionales",
  extraPlaceholder: "Le da vergüenza hablar: elógiale mucho. Le encantan los dinosaurios.",
  agentNameLabel: "Nombre del agente",
  helperNameLabel: "Nombre del ayudante",
  voiceLegend: "Voz",
  loadingVoices: "Cargando voces…",
  sessionLength: "Duración de la sesión (minutos)",
  startSession: "Empezar sesión",
  noVoices: "Tu cuenta de ElevenLabs no tiene ninguna voz. Añade una en elevenlabs.io y recarga.",
  voicesFailed: (detail) =>
    `No se pudo cargar la lista de voces: ${detail} Comprueba que ELEVENLABS_API_KEY en .env.local está configurada y es válida, y que \`npm run dev\` sigue en marcha; luego recarga esta página. Hasta que las voces carguen, no se puede empezar una sesión.`,
  profileFilled: (child, fields) =>
    `Rellenado con la última sesión de ${child}: ${fields}. Lo que ya habías cambiado se dejó tal cual.`,
  profileMatches: (child) =>
    `Hay un perfil guardado para ${child}; todo coincide con lo que ya está en el formulario.`,
  voiceSubstituted: (name) =>
    `La voz guardada para este peque ya no está en tu cuenta de ElevenLabs, así que se seleccionó ${name}. Elige otra abajo si lo prefieres — escúchalas con ▶.`,
  playPreview: (name) => `Escuchar muestra de ${name}`,
  stopPreview: (name) => `Detener muestra de ${name}`,
  howShouldToyPlay: (name) => `¿Cómo debería jugar ${name}?`,
  interactionMode: "Modo de interacción",
  beTheToyTitle: "Ser el juguete",
  beTheToyDesc: (toyName) => `la IA habla como ${toyName}.`,
  helpMePlayTitle: "Ayúdame a jugar",
  helpMePlayDesc: (toyName) => `un guía ayuda al peque a jugar con ${toyName}.`,
  povIntro: (toyName) => `${toyName} se presentará por su nombre al empezar la sesión.`,
  fieldNames: {
    agentName: "nombre del agente",
    voiceId: "voz",
    childAge: "edad",
    goal: "meta",
    directives: "instrucciones adicionales",
    minutes: "duración",
  },

  gettingReady: "Preparando…",
  overridesAlarmTitle: "Sesión detenida — las anulaciones no están activadas",
  overridesDisabledBody:
    "Sesión detenida de inmediato: este agente ignora la configuración que envía esta app, así que tu " +
    "peque habría estado hablando con un agente por defecto sin protección — sin reglas de seguridad, " +
    "sin lección, sin la voz elegida. Solución: abre el agente en elevenlabs.io/app/agents, ve a sus " +
    "ajustes de Security y activa las anulaciones para los cuatro: System prompt, First message, " +
    "Language y Voice (ver SETUP.md). Luego empieza la sesión de nuevo.",
  connecting: "Conectando…",
  readyWhenYouAre: "Listo cuando quieras",
  agentListening: (agent) => `${agent} está escuchando`,
  agentTalking: (agent) => `${agent} está hablando`,
  nothingSaidYet: "Aún no se ha dicho nada.",
  endSession: "Terminar sesión",
  startBtn: "Empezar",
  enableOverridesFirst: "Activa primero las anulaciones y vuelve a empezar",
  micPermission: "Necesito permiso del micrófono para hablar. Permítelo en tu navegador e inténtalo de nuevo.",
  couldNotStart: "No se pudo iniciar la sesión. Revisa tus claves en .env.local.",

  savingTranscript: "Guardando la transcripción…",
  transcriptNotSaved: "La transcripción NO está guardada",
  browserRefusedSave: "El navegador se negó a guardar la transcripción.",
  doNotCloseTab:
    "Esta lección solo existe en esta pestaña del navegador. No cierres ni recargues la pestaña — se perdería para siempre. Si tu navegador está en modo privado o el almacenamiento está lleno, arréglalo y reintenta.",
  retrySaving: "Reintentar guardado",

  writingSummary: "Escribiendo el resumen…",
  summaryMissingNote:
    "La transcripción está guardada en este dispositivo. Solo falta el resumen; la próxima sesión simplemente empezará sin él.",
  retry: "Reintentar",
  done: "Listo",
  asrAlarm: (child) =>
    `Atención: el reconocimiento de voz tuvo problemas para entender a ${child} en esta sesión. Si sigue pasando, vale la pena que leas las transcripciones personalmente.`,
  persistNote:
    "Este informe no quedó guardado en este dispositivo, así que la próxima lección empezará sin él. La lección en sí está bien — no se perdió nada de la sesión de hoy.",
  howItWent: "Cómo fue",
  engagementLabel: "Participación",
  engagement: { low: "baja", medium: "media", high: "alta" },
  confidentWith: "Domina",
  stillTricky: "Aún le cuesta",
  nextTime: "La próxima vez",
  couldNotWriteSummary: "No se pudo escribir el resumen.",
  couldNotReachServer: "No se pudo conectar con el servidor.",

  scanToy: "Escanear un juguete",
  scanLead: "Haz una foto clara del juguete, llenando el encuadre.",
  noToySpotted: "No pude ver un juguete en esa foto. Prueba otra vez con el juguete llenando el encuadre.",
  photoHttpError: (status) => `No se pudo procesar la foto (HTTP ${status}).`,
  photoReadError: "Algo salió mal al leer la foto.",
  lookingAtToy: "Mirando el juguete…",
  takePhoto: "📷 Hacer una foto del juguete",
  back: "Atrás",

  confirmToy: "Confirma el juguete",
  personalityLabel: "Personalidad",
  howYoullPlay: "Cómo jugaréis",
  useThisToy: "Usar este juguete",
  retakePhoto: "Repetir foto",

  passcodeLabel: "Código de acceso",
  unlockBtn: "Desbloquear",
  wrongPasscode: "Ese no es el código.",
  unlockNetworkError: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",

  whoIsLearning: "¿Quién aprende hoy?",
  addKid: "Añadir un peque",
  ageShort: (age) => (age === 1 ? "1 año" : `${age} años`),
  manage: "Gestionar",
  save: "Guardar",
  cancel: "Cancelar",

  whoWillTeach: "¿Quién va a enseñar?",
  presetBadge: "Integrado",
  toyBadge: "Juguete",
  lastTimeBadge: "La última vez",
  scanToyTitle: "Escanear un juguete",
  scanToySub: "Fotografía un juguete real y dale vida.",
  playingWith: (toyName) => `Jugando con ${toyName} — ahora elige un ayudante.`,
  presetTeachers: {
    generalist: { name: "Sol", description: "Un ayudante cálido y versátil para cualquier tema." },
    storyteller: { name: "Luna", description: "Convierte cada lección en un cuento." },
    mathCoach: { name: "Max", description: "Entrenador paciente con los números y el conteo." },
  },

  todaysSession: "Sesión de hoy",
  durationLabel: "¿Cuánto tiempo?",
  minutesShort: (m) => `${m} min`,
  changeSelection: "Cambiar",

  kidsTab: "Peques",
  teachersTab: "Profes",
  edit: "Editar",
  deleteAction: "Eliminar",
  confirmDelete: "Toca de nuevo para confirmar",
  duplicateAndEdit: "Duplicar y editar",
  newTeacher: "Nuevo profe",
  teacherNameLabel: "Nombre",
  personalityFieldLabel: "Personalidad",
  personalityPlaceholder: "Cálido y curioso. Le encantan los juegos de palabras. Siempre con ganas de una aventura imaginaria.",
  autoVoice: "Automático (mejor coincidencia)",
  generateVoice: "Generar una voz a juego",
  generatingVoice: "Generando una voz…",
  voiceGenerated: "Voz creada y seleccionada.",
  voiceGenerateFailed: (detail) => `No se pudo generar la voz: ${detail} La voz de mejor coincidencia sigue seleccionada.`,
  nothingHereYet: "Aún no hay nada aquí.",
};

const de: UIStrings = {
  languagePickerLabel: "Sprache",

  chooseMode: "Modus wählen",
  lessonTitle: "Lektion",
  lessonSub: "Eine kurze gesprochene Lektion mit einem Ziel, das du festlegst.",
  toyTitle: "Interaktives Spielzeug",
  toySub: "Scanne ein echtes Spielzeug und erwecke es zum Leben.",

  savedChildren: "Gespeicherte Kinder",
  pickUp: "Mach weiter, wo du aufgehört hast",
  who: "Wer",
  what: "Was",
  how: "Wie",
  childNameLabel: "Name des Kindes",
  childAgeLabel: "Alter des Kindes",
  goalLabel: "Ziel",
  purposeLabel: "Zweck des Spielens",
  goalPlaceholder: "Bis 10 zählen",
  purposePlaceholder: "Farben üben; vor dem Schlafen zur Ruhe kommen",
  extraLabel: "Zusätzliche Hinweise",
  extraPlaceholder: "Schüchtern — viel loben. Liebt Dinosaurier.",
  agentNameLabel: "Name des Agenten",
  helperNameLabel: "Name des Helfers",
  voiceLegend: "Stimme",
  loadingVoices: "Stimmen werden geladen…",
  sessionLength: "Dauer der Einheit (Minuten)",
  startSession: "Einheit starten",
  noVoices: "Dein ElevenLabs-Konto enthält keine Stimmen. Füge auf elevenlabs.io eine hinzu und lade die Seite neu.",
  voicesFailed: (detail) =>
    `Die Stimmenliste konnte nicht geladen werden: ${detail} Prüfe, ob ELEVENLABS_API_KEY in .env.local gesetzt und gültig ist und ob \`npm run dev\` noch läuft, und lade die Seite dann neu. Solange die Stimmen nicht geladen sind, kann keine Einheit gestartet werden.`,
  profileFilled: (child, fields) =>
    `Aus der letzten Einheit von ${child} übernommen: ${fields}. Alles, was du schon geändert hattest, blieb unangetastet.`,
  profileMatches: (child) =>
    `Für ${child} gibt es ein gespeichertes Profil; alles darin stimmt mit dem Formular überein.`,
  voiceSubstituted: (name) =>
    `Die für dieses Kind gespeicherte Stimme ist nicht mehr in deinem ElevenLabs-Konto, deshalb ist jetzt ${name} ausgewählt. Wähl unten gern eine andere — anhören mit ▶.`,
  playPreview: (name) => `Hörprobe von ${name} abspielen`,
  stopPreview: (name) => `Hörprobe von ${name} stoppen`,
  howShouldToyPlay: (name) => `Wie soll ${name} spielen?`,
  interactionMode: "Interaktionsmodus",
  beTheToyTitle: "Das Spielzeug sein",
  beTheToyDesc: (toyName) => `die KI spricht als ${toyName}.`,
  helpMePlayTitle: "Hilf mir beim Spielen",
  helpMePlayDesc: (toyName) => `ein Begleiter hilft dem Kind, mit ${toyName} zu spielen.`,
  povIntro: (toyName) => `${toyName} stellt sich zu Beginn der Einheit mit Namen vor.`,
  fieldNames: {
    agentName: "Name des Agenten",
    voiceId: "Stimme",
    childAge: "Alter",
    goal: "Ziel",
    directives: "zusätzliche Hinweise",
    minutes: "Dauer",
  },

  gettingReady: "Wird vorbereitet…",
  overridesAlarmTitle: "Einheit gestoppt — Overrides sind nicht aktiviert",
  overridesDisabledBody:
    "Die Einheit wurde sofort gestoppt: Dieser Agent ignoriert die Einstellungen dieser App — dein Kind " +
    "hätte mit einem ungeschützten Standard-Agenten gesprochen, ohne Sicherheitsregeln, ohne Lektion, " +
    "ohne die gewählte Stimme. Lösung: Öffne den Agenten auf elevenlabs.io/app/agents, geh in die " +
    "Security-Einstellungen und aktiviere Overrides für alle vier: System prompt, First message, " +
    "Language und Voice (siehe SETUP.md). Starte die Einheit dann neu.",
  connecting: "Verbinden…",
  readyWhenYouAre: "Bereit, wenn du es bist",
  agentListening: (agent) => `${agent} hört zu`,
  agentTalking: (agent) => `${agent} spricht`,
  nothingSaidYet: "Noch nichts gesagt.",
  endSession: "Einheit beenden",
  startBtn: "Start",
  enableOverridesFirst: "Erst Overrides aktivieren, dann neu starten",
  micPermission: "Ich brauche Mikrofon-Zugriff zum Sprechen. Bitte erlaube ihn im Browser und versuch es erneut.",
  couldNotStart: "Die Einheit konnte nicht gestartet werden. Prüfe deine Schlüssel in .env.local.",

  savingTranscript: "Mitschrift wird gespeichert…",
  transcriptNotSaved: "Die Mitschrift ist NICHT gespeichert",
  browserRefusedSave: "Der Browser hat das Speichern der Mitschrift verweigert.",
  doNotCloseTab:
    "Diese Lektion existiert nur in diesem Browser-Tab und nirgendwo sonst. Schließe den Tab nicht und lade ihn nicht neu — sonst ist sie endgültig verloren. Falls dein Browser im privaten Modus ist oder der Speicher voll ist, behebe das und versuch es erneut.",
  retrySaving: "Speichern wiederholen",

  writingSummary: "Zusammenfassung wird geschrieben…",
  summaryMissingNote:
    "Die Mitschrift ist auf diesem Gerät gespeichert. Nur die Zusammenfassung fehlt; die nächste Einheit startet einfach ohne sie.",
  retry: "Erneut versuchen",
  done: "Fertig",
  asrAlarm: (child) =>
    `Hinweis: Die Spracherkennung hatte in dieser Einheit Mühe, ${child} zu verstehen. Wenn das öfter passiert, lohnt es sich, die Mitschriften selbst zu lesen.`,
  persistNote:
    "Dieser Bericht ist nicht auf diesem Gerät gespeichert, die nächste Lektion startet also ohne ihn. Die Lektion selbst ist in Ordnung — von der heutigen Einheit ist nichts verloren.",
  howItWent: "So lief es",
  engagementLabel: "Beteiligung",
  engagement: { low: "niedrig", medium: "mittel", high: "hoch" },
  confidentWith: "Sicher bei",
  stillTricky: "Noch schwierig",
  nextTime: "Nächstes Mal",
  couldNotWriteSummary: "Die Zusammenfassung konnte nicht geschrieben werden.",
  couldNotReachServer: "Der Server war nicht erreichbar.",

  scanToy: "Ein Spielzeug scannen",
  scanLead: "Mach ein klares, bildfüllendes Foto des Spielzeugs.",
  noToySpotted: "Auf dem Foto war kein Spielzeug zu erkennen. Versuch es erneut, mit dem Spielzeug bildfüllend.",
  photoHttpError: (status) => `Das Foto konnte nicht verarbeitet werden (HTTP ${status}).`,
  photoReadError: "Beim Lesen des Fotos ist etwas schiefgegangen.",
  lookingAtToy: "Spielzeug wird angesehen…",
  takePhoto: "📷 Spielzeug fotografieren",
  back: "Zurück",

  confirmToy: "Spielzeug bestätigen",
  personalityLabel: "Persönlichkeit",
  howYoullPlay: "So werdet ihr spielen",
  useThisToy: "Dieses Spielzeug verwenden",
  retakePhoto: "Foto wiederholen",

  passcodeLabel: "Zugangscode",
  unlockBtn: "Entsperren",
  wrongPasscode: "Das ist nicht der Code.",
  unlockNetworkError: "Der Server war nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.",

  whoIsLearning: "Wer lernt heute?",
  addKid: "Kind hinzufügen",
  ageShort: (age) => (age === 1 ? "1 Jahr" : `${age} Jahre`),
  manage: "Verwalten",
  save: "Speichern",
  cancel: "Abbrechen",

  whoWillTeach: "Wer unterrichtet?",
  presetBadge: "Integriert",
  toyBadge: "Spielzeug",
  lastTimeBadge: "Letztes Mal",
  scanToyTitle: "Ein Spielzeug scannen",
  scanToySub: "Fotografiere ein echtes Spielzeug und erwecke es zum Leben.",
  playingWith: (toyName) => `Du spielst mit ${toyName} — wähle jetzt einen Helfer.`,
  presetTeachers: {
    generalist: { name: "Sunny", description: "Ein warmherziger Allrounder für jedes Thema." },
    storyteller: { name: "Luna", description: "Verwandelt jede Lektion in eine Geschichte." },
    mathCoach: { name: "Max", description: "Geduldiger Coach für Zahlen und Zählen." },
  },

  todaysSession: "Heutige Einheit",
  durationLabel: "Wie lange?",
  minutesShort: (m) => `${m} Min.`,
  changeSelection: "Ändern",

  kidsTab: "Kinder",
  teachersTab: "Lehrkräfte",
  edit: "Bearbeiten",
  deleteAction: "Löschen",
  confirmDelete: "Nochmal tippen zum Bestätigen",
  duplicateAndEdit: "Duplizieren & bearbeiten",
  newTeacher: "Neue Lehrkraft",
  teacherNameLabel: "Name",
  personalityFieldLabel: "Persönlichkeit",
  personalityPlaceholder: "Warmherzig und neugierig. Liebt Wortspiele. Immer bereit für ein Fantasieabenteuer.",
  autoVoice: "Automatisch (beste Übereinstimmung)",
  generateVoice: "Passende Stimme generieren",
  generatingVoice: "Stimme wird generiert…",
  voiceGenerated: "Stimme erstellt und ausgewählt.",
  voiceGenerateFailed: (detail) =>
    `Die Stimme konnte nicht generiert werden: ${detail} Die am besten passende Stimme ist weiterhin ausgewählt.`,
  nothingHereYet: "Hier ist noch nichts.",
};

// Hebrew addresses the parent in the plural ("אתם") throughout — the standard
// gender-neutral register for an audience of unknown gender, matching the
// app-wide rule of never assuming anyone's gender.
const he: UIStrings = {
  languagePickerLabel: "שפה",

  chooseMode: "בחירת מצב",
  lessonTitle: "שיעור",
  lessonSub: "שיעור מדובר קצר לקראת מטרה שאתם קובעים.",
  toyTitle: "צעצוע אינטראקטיבי",
  toySub: "סרקו צעצוע אמיתי והחיו אותו כדי לשחק.",

  savedChildren: "ילדים שמורים",
  pickUp: "המשיכו מאיפה שהפסקתם",
  who: "מי",
  what: "מה",
  how: "איך",
  childNameLabel: "שם הילד או הילדה",
  childAgeLabel: "גיל",
  goalLabel: "מטרה",
  purposeLabel: "מטרת המשחק",
  goalPlaceholder: "לספור עד 10",
  purposePlaceholder: "לתרגל צבעים; להירגע לפני השינה",
  extraLabel: "הנחיות נוספות",
  extraPlaceholder: "קצת ביישנות — הרבו לשבח. דינוזאורים זו אהבה גדולה.",
  agentNameLabel: "שם הסוכן",
  helperNameLabel: "שם העוזר",
  voiceLegend: "קול",
  loadingVoices: "הקולות בטעינה…",
  sessionLength: "אורך המפגש (דקות)",
  startSession: "התחלת מפגש",
  noVoices: "בחשבון ElevenLabs שלכם אין אף קול. הוסיפו אחד ב־elevenlabs.io וטענו מחדש.",
  voicesFailed: (detail) =>
    `לא ניתן לטעון את רשימת הקולות: ${detail} ודאו ש־ELEVENLABS_API_KEY בקובץ ‎.env.local מוגדר ותקף, וש־\`npm run dev\` עדיין רץ, ואז טענו את העמוד מחדש. עד שהקולות ייטענו, אי אפשר להתחיל מפגש.`,
  profileFilled: (child, fields) =>
    `הושלם מהמפגש הקודם של ${child}: ${fields}. כל מה שכבר שיניתם נשאר כפי שהוא.`,
  profileMatches: (child) => `נמצא פרופיל שמור עבור ${child}; הכול בו תואם למה שכבר בטופס.`,
  voiceSubstituted: (name) =>
    `הקול שנשמר לילד הזה כבר לא נמצא בחשבון ElevenLabs שלכם, ולכן נבחר ${name}. אפשר לבחור אחר למטה — האזינו עם ▶.`,
  playPreview: (name) => `השמעת דוגמה של ${name}`,
  stopPreview: (name) => `עצירת הדוגמה של ${name}`,
  howShouldToyPlay: (name) => `איך ${name} ישחק?`,
  interactionMode: "מצב אינטראקציה",
  beTheToyTitle: "להיות הצעצוע",
  beTheToyDesc: (toyName) => `הבינה המלאכותית מדברת בתור ${toyName}.`,
  helpMePlayTitle: "עזרו לי לשחק",
  helpMePlayDesc: (toyName) => `מדריך עוזר לילד לשחק עם ${toyName}.`,
  povIntro: (toyName) => `${toyName} יציג את עצמו בשמו כשהמפגש יתחיל.`,
  fieldNames: {
    agentName: "שם הסוכן",
    voiceId: "קול",
    childAge: "גיל",
    goal: "מטרה",
    directives: "הנחיות נוספות",
    minutes: "אורך המפגש",
  },

  gettingReady: "רק רגע…",
  overridesAlarmTitle: "המפגש נעצר — הדריסות (overrides) אינן מופעלות",
  overridesDisabledBody:
    "המפגש נעצר מיד: הסוכן מתעלם מההגדרות שהאפליקציה שולחת, כך שהילד היה מדבר עם סוכן ברירת־מחדל לא " +
    "מוגן — בלי כללי בטיחות, בלי שיעור, בלי הקול שנבחר. הפתרון: פתחו את הסוכן ב־elevenlabs.io/app/agents, " +
    "היכנסו להגדרות ה־Security שלו והפעילו overrides לכל הארבעה: System prompt‏, First message‏, Language " +
    "ו־Voice (ראו SETUP.md). ואז התחילו את המפגש מחדש.",
  connecting: "מתחבר…",
  readyWhenYouAre: "מוכנים כשאתם מוכנים",
  agentListening: (agent) => `${agent} מקשיב`,
  agentTalking: (agent) => `${agent} מדבר`,
  nothingSaidYet: "עוד לא נאמר דבר.",
  endSession: "סיום המפגש",
  startBtn: "התחלה",
  enableOverridesFirst: "הפעילו קודם את הדריסות, ואז התחילו שוב",
  micPermission: "דרושה הרשאת מיקרופון כדי לדבר. אשרו אותה בדפדפן ונסו שוב.",
  couldNotStart: "לא ניתן להתחיל את המפגש. בדקו את המפתחות ב־.env.local.",

  savingTranscript: "התמליל נשמר…",
  transcriptNotSaved: "התמליל לא נשמר",
  browserRefusedSave: "הדפדפן סירב לשמור את התמליל.",
  doNotCloseTab:
    "השיעור הזה קיים רק בלשונית הדפדפן הזו ובשום מקום אחר. אל תסגרו ואל תרעננו את הלשונית — כך הוא יאבד לתמיד. אם הדפדפן במצב פרטי או שהאחסון מלא, תקנו זאת ונסו שוב.",
  retrySaving: "ניסיון שמירה נוסף",

  writingSummary: "הסיכום נכתב…",
  summaryMissingNote: "התמליל שמור במכשיר הזה. חסר רק הסיכום, והמפגש הבא פשוט יתחיל בלעדיו.",
  retry: "ניסיון נוסף",
  done: "סיום",
  asrAlarm: (child) =>
    `שימו לב: זיהוי הדיבור התקשה להבין את ${child} במפגש הזה. אם זה חוזר על עצמו, כדאי לקרוא את התמלילים בעצמכם.`,
  persistNote:
    "הדוח הזה לא נשמר במכשיר, ולכן השיעור הבא יתחיל בלעדיו. השיעור עצמו בסדר גמור — שום דבר מהמפגש של היום לא אבד.",
  howItWent: "איך היה",
  engagementLabel: "מעורבות",
  engagement: { low: "נמוכה", medium: "בינונית", high: "גבוהה" },
  confidentWith: "כבר בביטחון",
  stillTricky: "עדיין מאתגר",
  nextTime: "בפעם הבאה",
  couldNotWriteSummary: "לא ניתן לכתוב את הסיכום.",
  couldNotReachServer: "אין חיבור לשרת.",

  scanToy: "סריקת צעצוע",
  scanLead: "צלמו תמונה ברורה של הצעצוע, כך שימלא את הפריים.",
  noToySpotted: "לא הצלחתי לזהות צעצוע בתמונה. נסו שוב כשהצעצוע ממלא את הפריים.",
  photoHttpError: (status) => `לא ניתן לעבד את התמונה (HTTP ${status}).`,
  photoReadError: "משהו השתבש בקריאת התמונה.",
  lookingAtToy: "מתבונן בצעצוע…",
  takePhoto: "📷 צילום הצעצוע",
  back: "חזרה",

  confirmToy: "אישור הצעצוע",
  personalityLabel: "אופי",
  howYoullPlay: "איך תשחקו",
  useThisToy: "לשחק עם הצעצוע הזה",
  retakePhoto: "צילום מחדש",

  passcodeLabel: "קוד גישה",
  unlockBtn: "פתיחה",
  wrongPasscode: "זה לא הקוד.",
  unlockNetworkError: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.",

  whoIsLearning: "מי לומדים היום?",
  addKid: "הוספת ילד או ילדה",
  ageShort: (age) => `גיל ${age}`,
  manage: "ניהול",
  save: "שמירה",
  cancel: "ביטול",

  whoWillTeach: "מי ילמד?",
  presetBadge: "מובנה",
  toyBadge: "צעצוע",
  lastTimeBadge: "בפעם הקודמת",
  scanToyTitle: "סריקת צעצוע",
  scanToySub: "צלמו צעצוע אמיתי והחיו אותו.",
  playingWith: (toyName) => `משחקים עם ${toyName} — עכשיו בחרו עוזר.`,
  presetTeachers: {
    generalist: { name: "סאני", description: "מורה חם ורב־תחומי לכל נושא." },
    storyteller: { name: "לונה", description: "הופך כל שיעור לסיפור." },
    mathCoach: { name: "מקס", description: "מאמן סבלני למספרים וספירה." },
  },

  todaysSession: "המפגש של היום",
  durationLabel: "כמה זמן?",
  minutesShort: (m) => `${m} דק׳`,
  changeSelection: "שינוי",

  kidsTab: "ילדים",
  teachersTab: "מורים",
  edit: "עריכה",
  deleteAction: "מחיקה",
  confirmDelete: "הקישו שוב לאישור",
  duplicateAndEdit: "שכפול ועריכה",
  newTeacher: "מורה חדש",
  teacherNameLabel: "שם",
  personalityFieldLabel: "אופי",
  personalityPlaceholder: "חם וסקרן. אוהב משחקי מילים. תמיד מוכן להרפתקה מדומיינת.",
  autoVoice: "אוטומטי (ההתאמה הטובה ביותר)",
  generateVoice: "יצירת קול מתאים",
  generatingVoice: "יוצרים קול…",
  voiceGenerated: "הקול נוצר ונבחר.",
  voiceGenerateFailed: (detail) => `לא ניתן היה ליצור קול: ${detail} הקול עם ההתאמה הטובה ביותר עדיין נבחר.`,
  nothingHereYet: "עוד אין כאן כלום.",
};

const tl: UIStrings = {
  languagePickerLabel: "Wika",

  chooseMode: "Pumili ng mode",
  lessonTitle: "Aralin",
  lessonSub: "Maikling aralin sa pagsasalita tungo sa layuning itinakda mo.",
  toyTitle: "Interactive na Laruan",
  toySub: "I-scan ang totoong laruan at buhayin ito para makipaglaro.",

  savedChildren: "Mga naka-save na bata",
  pickUp: "Ituloy kung saan ka huminto",
  who: "Sino",
  what: "Ano",
  how: "Paano",
  childNameLabel: "Pangalan ng bata",
  childAgeLabel: "Edad ng bata",
  goalLabel: "Layunin",
  purposeLabel: "Layunin ng paglalaro",
  goalPlaceholder: "Magbilang hanggang 10",
  purposePlaceholder: "Mag-praktis ng mga kulay; kumalma bago matulog",
  extraLabel: "Karagdagang bilin",
  extraPlaceholder: "Mahiyain — purihin nang madalas. Mahilig sa dinosaur.",
  agentNameLabel: "Pangalan ng agent",
  helperNameLabel: "Pangalan ng katulong",
  voiceLegend: "Boses",
  loadingVoices: "Nilo-load ang mga boses…",
  sessionLength: "Tagal ng session (minuto)",
  startSession: "Simulan ang session",
  noVoices: "Walang boses ang iyong ElevenLabs account. Magdagdag ng isa sa elevenlabs.io, tapos i-reload.",
  voicesFailed: (detail) =>
    `Hindi ma-load ang listahan ng mga boses: ${detail} Tiyaking naka-set at wasto ang ELEVENLABS_API_KEY sa .env.local, at tumatakbo pa ang \`npm run dev\`, tapos i-reload ang page na ito. Hangga't hindi na-load ang mga boses, hindi makakapagsimula ng session.`,
  profileFilled: (child, fields) =>
    `Pinunan mula sa huling session ni ${child}: ${fields}. Hindi ginalaw ang anumang binago mo na.`,
  profileMatches: (child) =>
    `May nakitang naka-save na profile para kay ${child}; tugma ang lahat dito sa nasa form na.`,
  voiceSubstituted: (name) =>
    `Wala na sa iyong ElevenLabs account ang boses na naka-save para sa batang ito, kaya ${name} ang napili. Pumili ng iba sa ibaba kung gusto mo — pakinggan sila gamit ang ▶.`,
  playPreview: (name) => `I-play ang preview ni ${name}`,
  stopPreview: (name) => `Itigil ang preview ni ${name}`,
  howShouldToyPlay: (name) => `Paano dapat maglaro si ${name}?`,
  interactionMode: "Paraan ng paglalaro",
  beTheToyTitle: "Maging ang laruan",
  beTheToyDesc: (toyName) => `magsasalita ang AI bilang si ${toyName}.`,
  helpMePlayTitle: "Tulungan akong maglaro",
  helpMePlayDesc: (toyName) => `may gabay na tutulong sa bata na makipaglaro kay ${toyName}.`,
  povIntro: (toyName) => `Magpapakilala si ${toyName} sa sarili niyang pangalan sa simula ng session.`,
  fieldNames: {
    agentName: "pangalan ng agent",
    voiceId: "boses",
    childAge: "edad",
    goal: "layunin",
    directives: "karagdagang bilin",
    minutes: "tagal",
  },

  gettingReady: "Naghahanda…",
  overridesAlarmTitle: "Itinigil ang session — hindi naka-enable ang mga override",
  overridesDisabledBody:
    "Agad itinigil ang session: binabalewala ng agent na ito ang mga setting na ipinapadala ng app, kaya " +
    "makakausap sana ng anak mo ang isang default na agent na walang proteksyon — walang mga panuntunang " +
    "pangkaligtasan, walang aralin, walang napiling boses. Ayusin: buksan ang agent sa " +
    "elevenlabs.io/app/agents, pumunta sa Security settings nito, at i-enable ang overrides para sa lahat " +
    "ng apat: System prompt, First message, Language at Voice (tingnan ang SETUP.md). Pagkatapos, simulan " +
    "ulit ang session.",
  connecting: "Kumokonekta…",
  readyWhenYouAre: "Handa kapag handa ka na",
  agentListening: (agent) => `Nakikinig si ${agent}`,
  agentTalking: (agent) => `Nagsasalita si ${agent}`,
  nothingSaidYet: "Wala pang nasasabi.",
  endSession: "Tapusin ang session",
  startBtn: "Simulan",
  enableOverridesFirst: "I-enable muna ang overrides, tapos magsimula ulit",
  micPermission: "Kailangan ko ng pahintulot sa mikropono para makapagsalita. Payagan ito sa browser at subukan ulit.",
  couldNotStart: "Hindi masimulan ang session. Suriin ang iyong mga key sa .env.local.",

  savingTranscript: "Sine-save ang transcript…",
  transcriptNotSaved: "HINDI naka-save ang transcript",
  browserRefusedSave: "Tumanggi ang browser na i-save ang transcript.",
  doNotCloseTab:
    "Nasa tab na ito ng browser lang ang aralin at wala nang iba. Huwag isara o i-reload ang tab — mawawala ito nang tuluyan. Kung naka-private mode ang browser mo o puno ang storage, ayusin iyon, tapos subukan ulit.",
  retrySaving: "Subukan ulit i-save",

  writingSummary: "Sinusulat ang buod…",
  summaryMissingNote:
    "Naka-save ang transcript sa device na ito. Ang buod lang ang kulang, at magsisimula lang ang susunod na session nang wala ito.",
  retry: "Subukan ulit",
  done: "Tapos na",
  asrAlarm: (child) =>
    `Paalala: nahirapan ang speech recognition na maintindihan si ${child} sa session na ito. Kung paulit-ulit ito, sulit na basahin mo mismo ang mga transcript.`,
  persistNote:
    "Hindi naka-save ang ulat na ito sa device, kaya magsisimula ang susunod na aralin nang wala ito. Ayos lang ang aralin mismo — walang nawala sa session ngayon.",
  howItWent: "Kumusta ang takbo",
  engagementLabel: "Pakikilahok",
  engagement: { low: "mababa", medium: "katamtaman", high: "mataas" },
  confidentWith: "Kabisado na",
  stillTricky: "Medyo mahirap pa",
  nextTime: "Sa susunod",
  couldNotWriteSummary: "Hindi maisulat ang buod.",
  couldNotReachServer: "Hindi maabot ang server.",

  scanToy: "Mag-scan ng laruan",
  scanLead: "Kumuha ng malinaw na litrato ng laruan, punuin ang frame.",
  noToySpotted: "Wala akong nakitang laruan sa litratong iyan. Subukan ulit nang pinupuno ng laruan ang frame.",
  photoHttpError: (status) => `Hindi ma-proseso ang litrato (HTTP ${status}).`,
  photoReadError: "May nagkaproblema sa pagbasa ng litrato.",
  lookingAtToy: "Tinitingnan ang laruan…",
  takePhoto: "📷 Kunan ng litrato ang laruan",
  back: "Bumalik",

  confirmToy: "Kumpirmahin ang laruan",
  personalityLabel: "Ugali",
  howYoullPlay: "Paano kayo maglalaro",
  useThisToy: "Gamitin ang laruang ito",
  retakePhoto: "Kunan ulit",

  passcodeLabel: "Passcode",
  unlockBtn: "I-unlock",
  wrongPasscode: "Hindi iyan ang passcode.",
  unlockNetworkError: "Hindi maabot ang server. Suriin ang koneksyon mo at subukan ulit.",

  whoIsLearning: "Sino ang mag-aaral ngayon?",
  addKid: "Magdagdag ng bata",
  ageShort: (age) => `${age} taong gulang`,
  manage: "I-manage",
  save: "I-save",
  cancel: "Kanselahin",

  whoWillTeach: "Sino ang magtuturo?",
  presetBadge: "Built-in",
  toyBadge: "Laruan",
  lastTimeBadge: "Huling beses",
  scanToyTitle: "Mag-scan ng laruan",
  scanToySub: "Kunan ng litrato ang totoong laruan at buhayin ito.",
  playingWith: (toyName) => `Naglalaro kasama si ${toyName} — pumili na ng katulong.`,
  presetTeachers: {
    generalist: { name: "Sunny", description: "Mainit at maaasahan sa kahit anong topic." },
    storyteller: { name: "Luna", description: "Ginagawang kwento ang bawat aralin." },
    mathCoach: { name: "Max", description: "Matiyagang coach sa numero at pagbibilang." },
  },

  todaysSession: "Session ngayon",
  durationLabel: "Gaano katagal?",
  minutesShort: (m) => `${m} min`,
  changeSelection: "Baguhin",

  kidsTab: "Mga Bata",
  teachersTab: "Mga Guro",
  edit: "I-edit",
  deleteAction: "I-delete",
  confirmDelete: "Pindutin ulit para kumpirmahin",
  duplicateAndEdit: "I-duplicate at i-edit",
  newTeacher: "Bagong guro",
  teacherNameLabel: "Pangalan",
  personalityFieldLabel: "Ugali",
  personalityPlaceholder: "Mainit ang ugali at mausisa. Mahilig sa puns. Laging game sa gawa-gawang adventure.",
  autoVoice: "Automatic (pinakabagay)",
  generateVoice: "I-generate ang katernong boses",
  generatingVoice: "Ginagawa ang boses…",
  voiceGenerated: "Nagawa na at napili ang boses.",
  voiceGenerateFailed: (detail) => `Hindi magawa ang boses: ${detail} Nakapili pa rin ang boses na pinakabagay.`,
  nothingHereYet: "Wala pang laman dito.",
};

const uk: UIStrings = {
  languagePickerLabel: "Мова",

  chooseMode: "Оберіть режим",
  lessonTitle: "Урок",
  lessonSub: "Короткий усний урок із метою, яку задаєте ви.",
  toyTitle: "Інтерактивна іграшка",
  toySub: "Відскануйте справжню іграшку й оживіть її для гри.",

  savedChildren: "Збережені діти",
  pickUp: "Продовжте з того місця, де зупинилися",
  who: "Хто",
  what: "Що",
  how: "Як",
  childNameLabel: "Ім'я дитини",
  childAgeLabel: "Вік дитини",
  goalLabel: "Мета",
  purposeLabel: "Мета гри",
  goalPlaceholder: "Лічба до 10",
  purposePlaceholder: "Вчимо кольори; спокійна гра перед сном",
  extraLabel: "Додаткові вказівки",
  extraPlaceholder: "Соромиться — частіше хваліть. Обожнює динозаврів.",
  agentNameLabel: "Ім'я агента",
  helperNameLabel: "Ім'я помічника",
  voiceLegend: "Голос",
  loadingVoices: "Завантажуємо голоси…",
  sessionLength: "Тривалість заняття (хвилини)",
  startSession: "Почати заняття",
  noVoices: "У вашому акаунті ElevenLabs немає жодного голосу. Додайте голос на elevenlabs.io і перезавантажте сторінку.",
  voicesFailed: (detail) =>
    `Не вдалося завантажити список голосів: ${detail} Перевірте, що ELEVENLABS_API_KEY у .env.local задано і він дійсний, а \`npm run dev\` досі запущено, потім перезавантажте сторінку. Поки голоси не завантажаться, заняття почати не можна.`,
  profileFilled: (child, fields) =>
    `Заповнено з минулого заняття (${child}): ${fields}. Усе, що ви вже змінили, залишилося як є.`,
  profileMatches: (child) =>
    `Знайдено збережений профіль для ${child}; усе в ньому збігається з тим, що вже у формі.`,
  voiceSubstituted: (name) =>
    `Голосу, збереженого для цієї дитини, більше немає у вашому акаунті ElevenLabs, тому обрано ${name}. Якщо хочете інший — оберіть нижче, послухати можна кнопкою ▶.`,
  playPreview: (name) => `Прослухати голос ${name}`,
  stopPreview: (name) => `Зупинити прослуховування ${name}`,
  howShouldToyPlay: (name) => `Як ${name} гратиме?`,
  interactionMode: "Режим взаємодії",
  beTheToyTitle: "Бути іграшкою",
  beTheToyDesc: (toyName) => `ШІ говорить від імені ${toyName}.`,
  helpMePlayTitle: "Допоможи мені грати",
  helpMePlayDesc: (toyName) => `помічник допомагає дитині грати з ${toyName}.`,
  povIntro: (toyName) => `${toyName} представиться на ім'я на початку заняття.`,
  fieldNames: {
    agentName: "ім'я агента",
    voiceId: "голос",
    childAge: "вік",
    goal: "мета",
    directives: "додаткові вказівки",
    minutes: "тривалість",
  },

  gettingReady: "Готуємося…",
  overridesAlarmTitle: "Заняття зупинено — перевизначення не ввімкнені",
  overridesDisabledBody:
    "Заняття зупинено негайно: агент ігнорує налаштування, які надсилає цей застосунок, — дитина " +
    "розмовляла б з агентом за замовчуванням, без правил безпеки, без уроку і без обраного голосу. " +
    "Як виправити: відкрийте агента на elevenlabs.io/app/agents, зайдіть у його налаштування Security " +
    "і ввімкніть перевизначення для всіх чотирьох: System prompt, First message, Language і Voice " +
    "(див. SETUP.md). Потім почніть заняття знову.",
  connecting: "З'єднуємося…",
  readyWhenYouAre: "Готові, коли ви готові",
  agentListening: (agent) => `${agent} слухає`,
  agentTalking: (agent) => `${agent} говорить`,
  nothingSaidYet: "Поки нічого не сказано.",
  endSession: "Завершити заняття",
  startBtn: "Почати",
  enableOverridesFirst: "Спершу ввімкніть перевизначення, потім почніть знову",
  micPermission: "Мені потрібен доступ до мікрофона. Дозвольте його в браузері та спробуйте ще раз.",
  couldNotStart: "Не вдалося почати заняття. Перевірте ключі в .env.local.",

  savingTranscript: "Зберігаємо запис…",
  transcriptNotSaved: "Запис НЕ збережено",
  browserRefusedSave: "Браузер відмовився зберегти запис.",
  doNotCloseTab:
    "Це заняття існує лише в цій вкладці браузера і більше ніде. Не закривайте і не перезавантажуйте вкладку — інакше воно зникне назавжди. Якщо браузер у приватному режимі або сховище переповнене, виправте це і повторіть.",
  retrySaving: "Повторити збереження",

  writingSummary: "Пишемо звіт…",
  summaryMissingNote:
    "Запис збережено на цьому пристрої. Бракує лише звіту — наступне заняття просто почнеться без нього.",
  retry: "Повторити",
  done: "Готово",
  asrAlarm: (child) =>
    `Зверніть увагу: розпізнавання мовлення погано розуміло ${child} на цьому занятті. Якщо це повторюється, записи варто читати самостійно.`,
  persistNote:
    "Цей звіт не збережено на пристрої, тому наступне заняття почнеться без нього. Саме заняття в порядку — нічого з сьогоднішнього не втрачено.",
  howItWent: "Як усе минуло",
  engagementLabel: "Залученість",
  engagement: { low: "низька", medium: "середня", high: "висока" },
  confidentWith: "Упевнено",
  stillTricky: "Поки складно",
  nextTime: "Наступного разу",
  couldNotWriteSummary: "Не вдалося написати звіт.",
  couldNotReachServer: "Не вдалося зв'язатися з сервером.",

  scanToy: "Сканувати іграшку",
  scanLead: "Зробіть чітке фото іграшки великим планом.",
  noToySpotted: "Не вдалося розгледіти іграшку на цьому фото. Спробуйте ще раз, щоб іграшка займала весь кадр.",
  photoHttpError: (status) => `Не вдалося обробити фото (HTTP ${status}).`,
  photoReadError: "Щось пішло не так під час читання фото.",
  lookingAtToy: "Роздивляємось іграшку…",
  takePhoto: "📷 Сфотографувати іграшку",
  back: "Назад",

  confirmToy: "Підтвердьте іграшку",
  personalityLabel: "Характер",
  howYoullPlay: "Як гратимете",
  useThisToy: "Грати з цією іграшкою",
  retakePhoto: "Перезняти",

  passcodeLabel: "Код доступу",
  unlockBtn: "Відкрити",
  wrongPasscode: "Це не той код.",
  unlockNetworkError: "Не вдалося зв'язатися з сервером. Перевірте з'єднання і спробуйте ще раз.",

  whoIsLearning: "Хто сьогодні займається?",
  addKid: "Додати дитину",
  // Ukrainian numeral agreement: 1 рік, 2–4 роки, 5+ років (11–14 always років).
  ageShort: (age) => {
    const mod10 = age % 10;
    const mod100 = age % 100;
    if (mod10 === 1 && mod100 !== 11) return `${age} рік`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${age} роки`;
    return `${age} років`;
  },
  manage: "Керування",
  save: "Зберегти",
  cancel: "Скасувати",

  whoWillTeach: "Хто вчитиме?",
  presetBadge: "Вбудований",
  toyBadge: "Іграшка",
  lastTimeBadge: "Минулого разу",
  scanToyTitle: "Сканувати іграшку",
  scanToySub: "Сфотографуйте справжню іграшку й оживіть її.",
  playingWith: (toyName) => `Граємо з ${toyName} — тепер оберіть помічника.`,
  presetTeachers: {
    generalist: { name: "Санні", description: "Теплий універсал на будь-яку тему." },
    storyteller: { name: "Луна", description: "Перетворює кожен урок на казку." },
    mathCoach: { name: "Макс", description: "Терплячий тренер із цифр і лічби." },
  },

  todaysSession: "Сьогоднішнє заняття",
  durationLabel: "Як довго?",
  minutesShort: (m) => `${m} хв`,
  changeSelection: "Змінити",

  kidsTab: "Діти",
  teachersTab: "Вчителі",
  edit: "Редагувати",
  deleteAction: "Видалити",
  confirmDelete: "Натисніть ще раз для підтвердження",
  duplicateAndEdit: "Дублювати й редагувати",
  newTeacher: "Новий учитель",
  teacherNameLabel: "Ім'я",
  personalityFieldLabel: "Характер",
  personalityPlaceholder: "Теплий і допитливий характер. Обожнює каламбури. Завжди за вигадану пригоду.",
  autoVoice: "Автоматично (найкращий збіг)",
  generateVoice: "Згенерувати відповідний голос",
  generatingVoice: "Створюємо голос…",
  voiceGenerated: "Голос створено й обрано.",
  voiceGenerateFailed: (detail) => `Не вдалося створити голос: ${detail} Голос із найкращим збігом усе ще обрано.`,
  nothingHereYet: "Тут поки що порожньо.",
};

export const STRINGS: Record<Language, UIStrings> = { en, ru, es, de, he, tl, uk };
