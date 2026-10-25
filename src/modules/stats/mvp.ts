/**
 * MVP points used for Weekly Top Players and Monthly Performers.
 * Kept simple and documented so players can check their own score.
 */
export const MVP_POINTS = {
  run: 1,
  four: 1,
  six: 2,
  fifty: 10,
  hundred: 25,
  wicket: 20,
  threeWicketHaul: 10,
  maiden: 10,
  catch: 8,
  stumping: 10,
  runOut: 8,
} as const;

export type MvpInput = {
  runs: number;
  fours: number;
  sixes: number;
  wickets: number;
  maidens: number;
  catches: number;
  stumpings: number;
  runOuts: number;
};

/** Points for one match performance */
export function mvpPoints(p: MvpInput): number {
  const P = MVP_POINTS;
  return (
    p.runs * P.run +
    p.fours * P.four +
    p.sixes * P.six +
    (p.runs >= 100 ? P.hundred : p.runs >= 50 ? P.fifty : 0) +
    p.wickets * P.wicket +
    (p.wickets >= 3 ? P.threeWicketHaul : 0) +
    p.maidens * P.maiden +
    p.catches * P.catch +
    p.stumpings * P.stumping +
    p.runOuts * P.runOut
  );
}
