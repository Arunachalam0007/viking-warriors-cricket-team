export const EXPENSE_CATEGORIES = {
  balls: "Balls",
  ground: "Ground fee",
  equipment: "Equipment",
  tournament_fee: "Tournament fee",
  food: "Food & drinks",
  jersey: "Jersey",
  other: "Other",
} as const;

export const INCOME_CATEGORIES = {
  sponsorship: "Sponsorship",
  ball_sale: "Ball sale",
  prize_money: "Prize money",
  other: "Other",
} as const;

export const PAYMENT_MODES = { upi: "UPI / GPay", cash: "Cash", bank: "Bank transfer", other: "Other" } as const;

export type Holder = { id: string; name: string; isDefault: boolean; isActive: boolean };
