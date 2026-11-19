export type PayoutStatus = "waiting" | "next" | "paid";

export type Member = {
  id: number;
  name: string;
  payoutOrder: number;
  payoutStatus: PayoutStatus;
  totalContributed: number;
};

export type Group = {
  id: number;
  name: string;
  inviteCode: string;
  contributionAmount: number;
  frequency: "weekly" | "monthly";
  startDate: string;
  currentRound: number;
  ownerId: number;
  role: "owner" | "member";
  memberCount: number;
  totalContributed: number;
  members: Member[];
  contributions: Contribution[];
  payouts: Payout[];
};

export type Contribution = {
  id: number;
  groupId: number;
  memberId: number;
  amount: number;
  contributionDate: string;
  round: number;
  createdAt: string;
};

export type Payout = {
  memberId: number;
  memberName: string;
  round: number;
  amount: number;
  paidAt: string;
};

export function totalContributed(contributions: Contribution[]): number {
  return contributions.reduce(
    (total, contribution) => total + contribution.amount,
    0,
  );
}

export function nextPayoutOrder(
  currentRound: number,
  memberCount: number,
): number {
  if (memberCount < 1) {
    throw new RangeError("A payout schedule needs at least one member");
  }
  return ((currentRound - 1) % memberCount) + 1;
}
