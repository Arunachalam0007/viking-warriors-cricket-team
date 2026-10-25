export type ChTeamSide = { id: number; name: string; logo: string; score: string };

export type ChMatchSummary = {
  matchId: number;
  startTime: string; // ISO UTC
  status: string; // upcoming | live | past
  result: string; // resulted | abandoned | ''
  winningTeamId: number;
  winBy: string;
  summary: string;
  tournamentId: number;
  tournamentName: string;
  overs: number;
  ballType: string;
  ground: string;
  city: string;
  teamA: ChTeamSide;
  teamB: ChTeamSide;
  pomPlayerId: number;
};

export type ChMember = {
  playerId: number;
  name: string;
  photoUrl: string | null;
  isCaptain: boolean;
  battingStyle: string | null;
  bowlingStyle: string | null;
};

export type ChBattingRow = {
  playerId: number;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  howOut: string;
  isOut: boolean;
};

export type ChBowlingRow = {
  playerId: number;
  name: string;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  dots: number;
  wides: number;
  noBalls: number;
};

export type ChInnings = {
  teamId: number; // batting team
  inning: number;
  totalRuns: number;
  totalWickets: number;
  overs: string;
  batting: ChBattingRow[];
  yetToBat: { playerId: number; name: string }[];
  bowling: ChBowlingRow[]; // bowlers of the fielding team
};

export type ChScorecard = { innings: ChInnings[] };
