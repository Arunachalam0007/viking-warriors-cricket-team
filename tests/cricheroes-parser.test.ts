import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanName,
  fieldingCredits,
  oversToBalls,
  parseScorecard,
  parseTeamMatches,
  parseTeamMembers,
} from "@/modules/cricheroes/parser";
import { extractTeamPerformance } from "@/modules/cricheroes/team-performance";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const TEAM_ID = 2921535;

describe("parseTeamMatches", () => {
  const matches = parseTeamMatches(fixture("team-matches.html"));

  it("finds the 12 matches on the first page, newest first", () => {
    expect(matches).toHaveLength(12);
    expect(matches[0].matchId).toBe(27667199);
    expect(matches[0].status).toBe("upcoming");
  });

  it("reads result, teams, ground and tournament", () => {
    const m = matches.find((x) => x.matchId === 27751784)!;
    expect(m.status).toBe("past");
    expect(m.result).toBe("resulted");
    expect(m.winningTeamId).toBe(TEAM_ID);
    expect(m.teamA.name).toBe("Jaguar CC");
    expect(m.teamB.id).toBe(TEAM_ID);
    expect(m.teamB.score).toBe("126/3");
    expect(m.ground).toBe("Cmc Ground");
    expect(m.tournamentName).toBe("");
    expect(matches.find((x) => x.matchId === 27667199)!.tournamentName).toMatch(/Tournament/);
    expect(matches.find((x) => x.matchId === 27350036)!.result).toBe("abandoned");
  });
});

describe("parseTeamMembers", () => {
  it("reads all members with photos", () => {
    const members = parseTeamMembers(fixture("team-members.html"));
    expect(members.length).toBe(34);
    const arun = members.find((m) => m.playerId === 191343)!;
    expect(arun.name).toBe("Arun Gill");
    expect(arun.isCaptain).toBe(true);
    expect(arun.photoUrl).toMatch(/^https:\/\/media\.cricheroes\.in\//);
  });
});

describe("scorecard → team performance", () => {
  it("builds our full XI with batting, bowling and fielding", () => {
    const card = parseScorecard(fixture("scorecard-27751784.html"))!;
    expect(card.innings).toHaveLength(2);
    const xi = extractTeamPerformance(card, TEAM_ID);
    expect(xi).toHaveLength(11);
    const santhosh = xi.find((p) => p.cricheroesPlayerId === 2867831)!;
    expect(santhosh.runs).toBe(73);
    expect(santhosh.ballsFaced).toBe(47);
    expect(santhosh.wickets).toBe(1);
    expect(santhosh.ballsBowled).toBe(12);
    const yogi = xi.find((p) => p.cricheroesPlayerId === 5270096)!;
    expect(yogi.wickets).toBe(2);
    expect(yogi.isOut).toBe(false);
    // Yogi took a c&b, so he gets a catch
    expect(yogi.catches).toBeGreaterThanOrEqual(1);
    const totalWickets = xi.reduce((s, p) => s + p.wickets, 0);
    expect(totalWickets).toBeGreaterThan(0);
  });

  it("parses abandoned matches that still have a scorecard", () => {
    const card = parseScorecard(fixture("scorecard-27350036-abandoned.html"))!;
    const xi = extractTeamPerformance(card, TEAM_ID);
    expect(xi.length).toBeGreaterThanOrEqual(11);
  });
});

describe("helpers", () => {
  it("converts overs to balls", () => {
    expect(oversToBalls(3, 0)).toBe(18);
    expect(oversToBalls("3.4", 0)).toBe(22);
    expect(oversToBalls(2, 3)).toBe(15);
  });

  it("cleans names", () => {
    expect(cleanName("Madhan  (c)")).toBe("Madhan");
    expect(cleanName("†Jaya Chandran")).toBe("Jaya Chandran");
  });

  it("extracts fielding credits", () => {
    expect(fieldingCredits("c †Jaya Chandran b Santhosh")).toEqual([{ fielder: "Jaya Chandran", kind: "catch" }]);
    expect(fieldingCredits("c&b Yogi")).toEqual([{ fielder: "Yogi", kind: "catch" }]);
    expect(fieldingCredits("st †Jaya Chandran b Suman Sanju")).toEqual([{ fielder: "Jaya Chandran", kind: "stumping" }]);
    expect(fieldingCredits("run out Suman Sanju")).toEqual([{ fielder: "Suman Sanju", kind: "run_out" }]);
    expect(fieldingCredits("b Yogi")).toEqual([]);
  });
});
