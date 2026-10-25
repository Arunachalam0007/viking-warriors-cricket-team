import { cleanName, fieldingCredits, normalizeName } from "./parser";
import type { ChScorecard } from "./types";

export type PlayerPerformance = {
  cricheroesPlayerId: number;
  name: string;
  batted: boolean;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissal: string | null;
  ballsBowled: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  dotBalls: number;
  wides: number;
  noBalls: number;
  catches: number;
  stumpings: number;
  runOuts: number;
};

/**
 * Builds our team's playing XI with batting, bowling and fielding figures
 * from a scorecard. The XI is everyone in our batting card plus "yet to bat";
 * bowlers who never appear there are added too.
 */
export function extractTeamPerformance(card: ChScorecard, teamId: number): PlayerPerformance[] {
  const xi = new Map<number, PlayerPerformance>();
  const blank = (id: number, name: string): PlayerPerformance => ({
    cricheroesPlayerId: id,
    name: cleanName(name),
    batted: false,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
    dismissal: null,
    ballsBowled: 0,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    dotBalls: 0,
    wides: 0,
    noBalls: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  });
  const get = (id: number, name: string) => {
    let p = xi.get(id);
    if (!p) {
      p = blank(id, name);
      xi.set(id, p);
    }
    return p;
  };

  const ourBatting = card.innings.filter((i) => i.teamId === teamId);
  const theirBatting = card.innings.filter((i) => i.teamId !== teamId);

  for (const inn of ourBatting) {
    for (const b of inn.batting) {
      if (!b.playerId) continue;
      const p = get(b.playerId, b.name);
      p.batted = true;
      p.runs += b.runs;
      p.ballsFaced += b.balls;
      p.fours += b.fours;
      p.sixes += b.sixes;
      p.isOut = p.isOut || b.isOut;
      p.dismissal = b.howOut || p.dismissal;
    }
    for (const y of inn.yetToBat) if (y.playerId) get(y.playerId, y.name);
  }

  for (const inn of theirBatting) {
    for (const bw of inn.bowling) {
      if (!bw.playerId) continue;
      const p = get(bw.playerId, bw.name);
      p.ballsBowled += bw.balls;
      p.maidens += bw.maidens;
      p.runsConceded += bw.runs;
      p.wickets += bw.wickets;
      p.dotBalls += bw.dots;
      p.wides += bw.wides;
      p.noBalls += bw.noBalls;
    }
  }

  // Fielding: dismissal texts only carry names, so match them to our XI by name
  const byName = new Map<string, PlayerPerformance>();
  for (const p of xi.values()) byName.set(normalizeName(p.name), p);
  for (const inn of theirBatting) {
    for (const b of inn.batting) {
      for (const credit of fieldingCredits(b.howOut)) {
        const p = byName.get(normalizeName(credit.fielder));
        if (!p) continue;
        if (credit.kind === "catch") p.catches += 1;
        else if (credit.kind === "stumping") p.stumpings += 1;
        else p.runOuts += 1;
      }
    }
  }

  return [...xi.values()];
}
