const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function rupees(amount: number): string {
  return inr.format(amount);
}

export function ballsToOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function strikeRate(runs: number, balls: number): string {
  return balls > 0 ? ((runs * 100) / balls).toFixed(1) : "–";
}

export function average(runs: number, outs: number): string {
  return outs > 0 ? (runs / outs).toFixed(1) : runs > 0 ? `${runs}*` : "–";
}

export function economy(runs: number, balls: number): string {
  return balls > 0 ? ((runs * 6) / balls).toFixed(2) : "–";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
