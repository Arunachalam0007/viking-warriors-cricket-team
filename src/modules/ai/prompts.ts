import "server-only";
import { formatDate, todayIst } from "@/lib/dates";

export type Lang = "en" | "ta";
export const LANGS: Lang[] = ["ta", "en"];

/** Models spell the team name many ways in Tamil script; this is the one the team uses. */
export const TEAM_NAME_TA = "வைகிங் வாரியர்ஸ்";

/** Rules every AI feature shares. */
export function houseRules(teamName: string) {
  return [
    `You work for the amateur cricket team "${teamName}" (Tamil: ${TEAM_NAME_TA}), based in Tamil Nadu, India.`,
    `Today is ${formatDate(todayIst(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (India time).`,
    "Use only the facts you are given or that tools return. Never invent scores, names, dates or amounts. If something is not in the data, say so.",
    "Copy dates and days of the week exactly as the data gives them; never work out a weekday yourself.",
    "Money is Indian rupees, always whole numbers, written like ₹50 or ₹1,250.",
    `When writing Tamil, write the team name as ${TEAM_NAME_TA} and keep player names as they are spelled in the data (English letters are fine). Use simple, friendly spoken Tamil that club cricketers use; cricket words like "run", "wicket", "over", "six" can stay in English.`,
    "Keep it warm and encouraging. Never mock a player for a low score or a missed payment.",
  ].join("\n");
}

export function langName(lang: Lang) {
  return lang === "ta" ? "Tamil" : "English";
}
