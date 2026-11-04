import { TOOL_LABELS, type ChatLang } from "@/modules/ai/chat-types";

/*
 * Every word AI-Viking-Bot shows, per answer language: தமிழ் = all Tamil, English = all English,
 * Auto = a mix of both (suggestions alternate, labels carry both).
 */

const TOOL_LABELS_TA: Record<string, string> = {
  listPlayers: "வீரர்களை தேடுகிறது",
  playerProfile: "வீரர் விவரம் பார்க்கிறது",
  leaderboard: "Leaderboard பார்க்கிறது",
  matches: "Match விவரங்கள் பார்க்கிறது",
  matchDetail: "Scorecard படிக்கிறது",
  teamRecord: "வெற்றி / தோல்வி கணக்கிடுகிறது",
  dues: "Match fee பாக்கி பார்க்கிறது",
  siteGuide: "Site வழிகாட்டி திறக்கிறது",
  financeOverview: "அணியின் கணக்குகள் படிக்கிறது",
  balances: "வீரர்களின் பாக்கி படிக்கிறது",
  charges: "Match fees படிக்கிறது",
  matchFees: "ஒவ்வொரு match fees படிக்கிறது",
  payments: "Payments படிக்கிறது",
  expensesAndIncome: "செலவு, வரவு படிக்கிறது",
  dataChecks: "Data சரிபார்க்கிறது",
  findPlayerByName: "வீரர்களை தேடுகிறது",
  markFeesPaid: "Fees paid ஆக்குதல்",
  markFeeUnpaid: "Fee unpaid ஆக்குதல்",
  setPlayed: "விளையாடியவர் மாற்றம்",
  waiveFee: "Fee தள்ளுபடி",
  recordPayment: "Payment பதிவு",
  addExpense: "செலவு சேர்த்தல்",
  setMatchFee: "Match fee அமைப்பு மாற்றம்",
};

type Strings = {
  subtitle: (team: string, admin: boolean) => string;
  typing: string;
  hello: string;
  welcome: (admin: boolean) => string;
  suggestions: (admin: boolean, here: { match: boolean; player: boolean }) => string[];
  placeholder: (admin: boolean) => string;
  listening: string;
  footer: string;
  adminHint: string;
  retry: string;
  tool: (name: string) => string;
  card: { requested: string; saved: string; cancelled: string; notSaved: string; preparing: string; confirm: string; cancel: string; saving: string; cancelling: string; total: string };
  copy: string;
  readAloud: string;
  stopReading: string;
  thinking: string;
  /** Loader line while the bot looks things up (`tool` = what it is doing right now) */
  fetching: (tool?: string) => string;
  loaderHint: string;
  preparingVoice: string;
  /** Speech recognition language for the mic */
  micLang: string;
  /** Read-aloud language for an answer */
  speechLang: (text: string) => string;
};

const isTamil = (text: string) => /[஀-௿]/.test(text);

const TA_SUGGEST = {
  match: "இந்த match-ஐ சுருக்கமா சொல்லுங்க",
  player: "இந்த வீரரின் form எப்படி?",
  public: ["அடுத்த match எப்போ?", "இந்த மாசம் MVP யார்?", "கடைசி match report சொல்லுங்க", "இந்த season அதிக ரன் எடுத்தவர்கள் யார்?", "யாரெல்லாம் match fee கட்டணும்?", "Match fee எப்படி கணக்கிடப்படுது?"],
  admin: ["அதிகம் பாக்கி வைத்திருப்பவர்கள் யார்? phone number-உடன்", "இந்த மாசம் collection vs செலவு", "கடைசி match-க்கு எல்லோரையும் paid ஆக்குங்க", "கடைசி sync-க்கு பிறகு data பிரச்சனை ஏதாவது?", "ஒவ்வொரு holder-இடமும் எவ்வளவு பணம் இருக்கு?"],
};
const EN_SUGGEST = {
  match: "Summarise this match",
  player: "How is this player's form?",
  public: ["When is the next match?", "Who is this month's MVP?", "Show the last match report", "Top run scorers this season", "Who still owes match fees?", "How do match fees work?"],
  admin: ["Who owes the most? List with phone numbers", "Collected vs expenses this month", "Mark everyone paid for the last match", "Any data problems after the last sync?", "How much cash does each holder have?"],
};

const pick = (s: typeof TA_SUGGEST, admin: boolean, here: { match: boolean; player: boolean }) => [
  ...(here.match ? [s.match] : []),
  ...(here.player ? [s.player] : []),
  ...(admin ? s.admin : s.public),
];

const TA: Strings = {
  subtitle: (team, admin) => (admin ? "Admin உதவியாளர் · பணம் & மாற்றங்கள்" : `${team} உதவியாளர்`),
  typing: "பதில் எழுதுகிறது",
  hello: "வணக்கம்! 🙏",
  welcome: (admin) =>
    admin
      ? "Collection, பாக்கி, செலவு பற்றி கேளுங்க, அல்லது என்ன மாற்றணும்னு சொல்லுங்க. சேமிக்கும் முன் preview காட்டுவேன்."
      : "நான் AI-Viking-Bot. Match, வீரர்கள், leaderboard, match fee பற்றி என்னிடம் கேளுங்க.",
  suggestions: (admin, here) => pick(TA_SUGGEST, admin, here),
  placeholder: (admin) => (admin ? "பணம் பற்றி கேளுங்க, அல்லது என்ன மாற்றணும்னு சொல்லுங்க…" : "Score, வீரர்கள், பாக்கி பற்றி கேளுங்க…"),
  listening: "கேட்கிறேன்… பேசுங்க",
  footer: "AI பதில்கள் அணியின் data-வில் இருந்து வருகின்றன; சில நேரம் தவறு இருக்கலாம்.",
  adminHint: " Admins: பணம், மாற்றங்களுக்கு Admin mode-க்கு மாறுங்க.",
  retry: "மீண்டும்",
  tool: (name) => TOOL_LABELS_TA[name] ?? TOOL_LABELS[name] ?? name,
  card: { requested: "இந்த மாற்றத்தை உறுதி செய்யுங்க", saved: "சேமிக்கப்பட்டது", cancelled: "ரத்து செய்யப்பட்டது", notSaved: "சேமிக்கப்படவில்லை", preparing: "மாற்றம் தயாராகிறது", confirm: "உறுதி செய்", cancel: "ரத்து", saving: "சேமிக்கிறது…", cancelling: "ரத்து செய்கிறது…", total: "மொத்தம்" },
  copy: "Copy",
  readAloud: "சத்தமாக படி",
  stopReading: "நிறுத்து",
  thinking: "யோசிக்கிறது",
  fetching: (tool) => (tool ? `${tool}…` : "தகவல்களை சேகரிக்கிறது…"),
  loaderHint: "அணியின் data-வில் இருந்து பதில் தயாராகிறது",
  preparingVoice: "குரல் தயாராகிறது…",
  micLang: "ta-IN",
  speechLang: () => "ta-IN",
};

const EN: Strings = {
  subtitle: (team, admin) => (admin ? "Admin assistant · money & changes" : `${team} assistant`),
  typing: "Typing",
  hello: "Welcome! 🙏",
  welcome: (admin) =>
    admin
      ? "Ask about collections, dues and expenses, or tell me what to update. I'll show you a preview to confirm first."
      : "I'm AI-Viking-Bot. Ask me about matches, players, the leaderboard or match fees.",
  suggestions: (admin, here) => pick(EN_SUGGEST, admin, here),
  placeholder: (admin) => (admin ? "Ask about money, or say what to change…" : "Ask about scores, players, dues…"),
  listening: "Listening…",
  footer: "AI answers from team data and can make mistakes.",
  adminHint: " Admins: switch to Admin mode for money and changes.",
  retry: "Retry",
  tool: (name) => TOOL_LABELS[name] ?? name,
  card: { requested: "Confirm this change", saved: "Saved", cancelled: "Cancelled", notSaved: "Not saved", preparing: "Preparing change", confirm: "Confirm", cancel: "Cancel", saving: "Saving…", cancelling: "Cancelling…", total: "Total" },
  copy: "Copy",
  readAloud: "Read aloud",
  stopReading: "Stop reading",
  thinking: "Thinking",
  fetching: (tool) => (tool ? `${tool}…` : "Fetching team data…"),
  loaderHint: "Preparing your answer from the team data",
  preparingVoice: "Preparing voice…",
  micLang: "en-IN",
  speechLang: () => "en-IN",
};

/** Auto: suggestions alternate Tamil and English; voice follows the text being read. */
const AUTO: Strings = {
  ...EN,
  subtitle: (team, admin) => (admin ? EN.subtitle(team, true) : `${team} assistant · தமிழ் & English`),
  hello: "வணக்கம்! Welcome! 🙏",
  welcome: (admin) => `${EN.welcome(admin)} தமிழிலும் கேளுங்க!`,
  suggestions: (admin, here) => {
    const ta = TA.suggestions(admin, here);
    const en = EN.suggestions(admin, here);
    return ta.map((t, i) => (i % 2 === 0 ? t : en[i]!));
  },
  placeholder: (admin) => `${EN.placeholder(admin)} (தமிழ் OK)`,
  listening: "Listening… பேசுங்க",
  fetching: (tool) => (tool ? `${tool}…` : "Fetching data… தகவல் சேகரிக்கிறது"),
  // Tamil recognition also catches the English cricket words people mix in
  micLang: "ta-IN",
  speechLang: (text) => (isTamil(text) ? "ta-IN" : "en-IN"),
};

export function chatText(lang: ChatLang): Strings {
  return lang === "ta" ? TA : lang === "en" ? EN : AUTO;
}

export type ChatText = Strings;
