import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import type {
  Contribution,
  Group,
  Member,
  Payout,
  PayoutStatus,
} from "../susu.js";
import { nextPayoutOrder } from "../susu.js";
import type { AuthUser } from "./auth.js";
import {
  createAuthMiddleware,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  requireAuth,
  verifyPassword,
} from "./auth.js";
import type { AppDatabase } from "./db.js";

type AppOptions = {
  db: AppDatabase;
  sessionSecret: string;
  secureCookies?: boolean;
};

type GroupRow = {
  id: number;
  owner_id: number;
  name: string;
  invite_code: string;
  contribution_amount: number;
  frequency: "weekly" | "monthly";
  start_date: string;
  current_round: number;
  role: "owner" | "member";
};

type MemberRow = {
  id: number;
  name: string;
  payout_order: number;
  total_contributed: number;
};

type PayoutRow = {
  memberId: number;
  memberName: string;
  round: number;
  amount: number;
  paidAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: string): number | undefined {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function getGroupForMember(
  db: AppDatabase,
  groupId: number,
  userId: number,
): GroupRow | undefined {
  return db
    .prepare(
      `SELECT g.id, g.owner_id, g.name, g.invite_code, g.contribution_amount,
              g.frequency, g.start_date, g.current_round, gm.role
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE g.id = ? AND gm.user_id = ?`,
    )
    .get(groupId, userId) as GroupRow | undefined;
}

function userOrUnauthorized(
  req: express.Request,
  res: express.Response,
): AuthUser | undefined {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  return req.authUser;
}

function createGroupResponse(
  db: AppDatabase,
  group: GroupRow,
): Group & {
  memberCount: number;
  totalContributed: number;
  payouts: Payout[];
} {
  const memberRows = db
    .prepare(
      `SELECT u.id, u.name, gm.payout_order,
              COALESCE((SELECT SUM(c.amount)
                        FROM contributions c
                        WHERE c.group_id = gm.group_id AND c.user_id = gm.user_id), 0)
                AS total_contributed
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.payout_order`,
    )
    .all(group.id) as MemberRow[];
  const latestPayout = db
    .prepare(
      `SELECT recipient_id AS memberId
       FROM payouts WHERE group_id = ?
       ORDER BY round_number DESC LIMIT 1`,
    )
    .get(group.id) as { memberId: number } | undefined;
  const expectedOrder = nextPayoutOrder(group.current_round, memberRows.length);
  const members: Member[] = memberRows.map((member) => {
    let payoutStatus: PayoutStatus = "waiting";
    if (member.payout_order === expectedOrder) {
      payoutStatus = "next";
    } else if (latestPayout?.memberId === member.id) {
      payoutStatus = "paid";
    }
    return {
      id: member.id,
      name: member.name,
      payoutOrder: member.payout_order,
      payoutStatus,
      totalContributed: member.total_contributed,
    };
  });
  const contributionRows = db
    .prepare(
      `SELECT id, group_id AS groupId, user_id AS memberId, amount,
              contribution_date AS contributionDate,
              round_number AS round, created_at AS createdAt
       FROM contributions WHERE group_id = ? ORDER BY id DESC LIMIT 30`,
    )
    .all(group.id) as Contribution[];
  const payoutRows = db
    .prepare(
      `SELECT p.recipient_id AS memberId, u.name AS memberName,
              p.round_number AS round, p.amount, p.paid_at AS paidAt
       FROM payouts p JOIN users u ON u.id = p.recipient_id
       WHERE p.group_id = ? ORDER BY p.round_number DESC`,
    )
    .all(group.id) as PayoutRow[];
  const totalRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE group_id = ?",
    )
    .get(group.id) as { total: number };
  const totalContributed = Number(totalRow.total);

  return {
    id: group.id,
    ownerId: group.owner_id,
    name: group.name,
    inviteCode: group.invite_code,
    contributionAmount: group.contribution_amount,
    frequency: group.frequency,
    startDate: group.start_date,
    currentRound: group.current_round,
    role: group.role,
    memberCount: members.length,
    totalContributed,
    members,
    contributions: contributionRows,
    payouts: payoutRows.map((payout) => ({
      memberId: payout.memberId,
      memberName: payout.memberName,
      round: payout.round,
      amount: payout.amount,
      paidAt: payout.paidAt,
    })),
  };
}

export function createApp({
  db,
  sessionSecret,
  secureCookies = false,
}: AppOptions) {
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "10kb" }));
  app.use(createAuthMiddleware(db, sessionSecret));

  app.get("/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok" });
  });

  app.post("/api/auth/register", (req, res) => {
    if (!isRecord(req.body)) {
      return res
        .status(400)
        .json({ error: "Registration details are required" });
    }
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (name.length < 2 || name.length > 60) {
      return res
        .status(400)
        .json({ error: "Name must be between 2 and 60 characters" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (password.length < 10 || password.length > 128) {
      return res
        .status(400)
        .json({ error: "Password must be 10 to 128 characters" });
    }
    if (findUserByEmail(db, email)) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const user = createUser(db, name, email, password);
    createSession(db, user.id, res, sessionSecret, secureCookies);
    res.status(201).json({ user });
  });

  app.post("/api/auth/login", (req, res) => {
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (!email || password.length > 128) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = findUserByEmail(db, email);
    if (!verifyPassword(user, password) || !user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    createSession(db, user.id, res, sessionSecret, secureCookies);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(db, req, res, sessionSecret, secureCookies);
    res.status(204).end();
  });

  app.get("/api/me", requireAuth, (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (user) {
      res.json({ user });
    }
  });

  const groups = express.Router();
  groups.use(requireAuth);

  groups.get("/", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    const rows = db
      .prepare(
        `SELECT g.id, g.name, g.invite_code AS inviteCode,
                g.contribution_amount AS contributionAmount,
                g.frequency, g.start_date AS startDate,
                g.current_round AS currentRound, gm.role,
                (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id)
                  AS memberCount,
                (SELECT COALESCE(SUM(c.amount), 0)
                 FROM contributions c WHERE c.group_id = g.id) AS totalContributed
         FROM groups g JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = ? ORDER BY g.created_at DESC`,
      )
      .all(user.id);
    res.json({ groups: rows });
  });

  groups.post("/", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: "Circle details are required" });
    }
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const contributionAmount = Number(req.body.contributionAmount);
    const frequency = req.body.frequency;
    const startDate = req.body.startDate;
    if (name.length < 3 || name.length > 60) {
      return res
        .status(400)
        .json({ error: "Circle name must be 3 to 60 characters" });
    }
    if (
      !Number.isSafeInteger(contributionAmount) ||
      contributionAmount < 1 ||
      contributionAmount > 1_000_000
    ) {
      return res.status(400).json({
        error: "Contribution must be a whole amount from 1 to 1000000",
      });
    }
    if (frequency !== "weekly" && frequency !== "monthly") {
      return res
        .status(400)
        .json({ error: "Choose weekly or monthly frequency" });
    }
    if (!isDateOnly(startDate)) {
      return res.status(400).json({ error: "Enter a valid start date" });
    }

    const inviteCode = randomBytes(6).toString("hex").toUpperCase();
    const createdAt = new Date().toISOString();
    const createCircle = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO groups
             (owner_id, name, invite_code, contribution_amount, frequency,
              start_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          name,
          inviteCode,
          contributionAmount,
          frequency,
          startDate,
          createdAt,
        );
      const groupId = Number(result.lastInsertRowid);
      db.prepare(
        `INSERT INTO group_members (group_id, user_id, payout_order, role, joined_at)
         VALUES (?, ?, 1, 'owner', ?)`,
      ).run(groupId, user.id, createdAt);
      return groupId;
    });
    const groupId = createCircle();
    const group = getGroupForMember(db, groupId, user.id);
    if (!group) {
      return res
        .status(500)
        .json({ error: "Created circle could not be loaded" });
    }
    res.status(201).json({ group: createGroupResponse(db, group) });
  });

  groups.post("/join", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    const code =
      isRecord(req.body) && typeof req.body.inviteCode === "string"
        ? req.body.inviteCode.trim().toUpperCase()
        : "";
    if (!code) {
      return res.status(400).json({ error: "Invite code is required" });
    }
    const group = db
      .prepare("SELECT id FROM groups WHERE invite_code = ?")
      .get(code) as { id: number } | undefined;
    if (!group) {
      return res.status(404).json({ error: "Circle not found" });
    }
    const existing = db
      .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
      .get(group.id, user.id);
    if (existing) {
      return res
        .status(409)
        .json({ error: "You already belong to this circle" });
    }
    const memberCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?")
      .get(group.id) as { count: number };
    const memberCount = Number(memberCountRow.count);
    if (memberCount >= 20) {
      return res
        .status(409)
        .json({ error: "This circle already has 20 members" });
    }
    db.prepare(
      `INSERT INTO group_members (group_id, user_id, payout_order, role, joined_at)
       VALUES (?, ?, ?, 'member', ?)`,
    ).run(group.id, user.id, memberCount + 1, new Date().toISOString());
    res.status(201).json({ message: "You joined the circle" });
  });

  groups.get("/:groupId", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    const groupId = parseId(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({ error: "Invalid circle ID" });
    }
    const group = getGroupForMember(db, groupId, user.id);
    if (!group) {
      // Use the same response for missing and non-member circles to avoid disclosing private IDs.
      return res.status(404).json({ error: "Circle not found" });
    }
    res.json({ group: createGroupResponse(db, group) });
  });

  groups.post("/:groupId/contributions", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    const groupId = parseId(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({ error: "Invalid circle ID" });
    }
    const group = getGroupForMember(db, groupId, user.id);
    if (!group) {
      return res.status(404).json({ error: "Circle not found" });
    }
    if (!isRecord(req.body)) {
      return res
        .status(400)
        .json({ error: "Contribution details are required" });
    }
    const memberId = Number(req.body.memberId);
    if (!Number.isSafeInteger(memberId) || memberId < 1) {
      return res.status(400).json({ error: "Choose a circle member" });
    }
    const amount = Number(req.body.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Contribution must be a whole amount greater than zero",
      });
    }
    if (amount !== group.contribution_amount) {
      return res
        .status(400)
        .json({ error: "Contribution must match the circle amount" });
    }
    const contributionDate = req.body.date;
    if (!isDateOnly(contributionDate)) {
      return res.status(400).json({ error: "Enter a valid contribution date" });
    }
    if (contributionDate > todayDateOnly()) {
      return res
        .status(400)
        .json({ error: "Contribution date cannot be in the future" });
    }
    const targetMember = db
      .prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?")
      .get(groupId, memberId);
    if (!targetMember) {
      return res.status(400).json({ error: "Choose a member of this circle" });
    }
    if (memberId !== user.id && group.role !== "owner") {
      return res
        .status(403)
        .json({ error: "Only the circle owner can record for another member" });
    }
    const existing = db
      .prepare(
        `SELECT 1 FROM contributions
         WHERE group_id = ? AND user_id = ? AND round_number = ?`,
      )
      .get(groupId, memberId, group.current_round);
    if (existing) {
      return res
        .status(409)
        .json({ error: "You already contributed this round" });
    }

    const createdAt = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO contributions
           (group_id, user_id, round_number, amount, contribution_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        groupId,
        memberId,
        group.current_round,
        amount,
        contributionDate,
        createdAt,
      );
    const contribution: Contribution = {
      id: Number(result.lastInsertRowid),
      groupId,
      memberId,
      amount,
      contributionDate,
      round: group.current_round,
      createdAt,
    };
    res.status(201).json({ contribution });
  });

  groups.post("/:groupId/payouts", (req, res) => {
    const user = userOrUnauthorized(req, res);
    if (!user) {
      return;
    }
    const groupId = parseId(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({ error: "Invalid circle ID" });
    }
    const group = getGroupForMember(db, groupId, user.id);
    if (!group) {
      return res.status(404).json({ error: "Circle not found" });
    }
    if (group.role !== "owner") {
      return res
        .status(403)
        .json({ error: "Only the circle owner can record a payout" });
    }
    const memberRows = db
      .prepare(
        `SELECT gm.user_id, gm.payout_order, u.name
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?`,
      )
      .all(groupId) as {
      user_id: number;
      payout_order: number;
      name: string;
    }[];
    if (memberRows.length < 2) {
      return res
        .status(409)
        .json({ error: "Add at least one more member before a payout" });
    }
    const paidCountRow = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS count FROM contributions
         WHERE group_id = ? AND round_number = ?`,
      )
      .get(groupId, group.current_round) as { count: number };
    const paidCount = Number(paidCountRow.count);
    if (paidCount !== memberRows.length) {
      return res
        .status(409)
        .json({ error: "Every member must contribute before a payout" });
    }

    const expectedOrder = nextPayoutOrder(
      group.current_round,
      memberRows.length,
    );
    const recipient = memberRows.find(
      (member) => member.payout_order === expectedOrder,
    );
    if (!recipient) {
      return res.status(500).json({ error: "Payout schedule is incomplete" });
    }
    const paidAt = new Date().toISOString();
    const amount = group.contribution_amount * memberRows.length;
    // Store the payout and advance the round atomically, so a partial write cannot replay a round.
    const recordPayout = db.transaction(() => {
      db.prepare(
        `INSERT INTO payouts (group_id, recipient_id, round_number, amount, paid_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(groupId, recipient.user_id, group.current_round, amount, paidAt);
      db.prepare(
        "UPDATE groups SET current_round = current_round + 1 WHERE id = ?",
      ).run(groupId);
    });
    recordPayout();
    res.status(201).json({
      payout: {
        memberId: recipient.user_id,
        memberName: recipient.name,
        round: group.current_round,
        amount,
        paidAt,
      } satisfies Payout,
    });
  });

  app.use("/api/groups", groups);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  app.get("/groups/:groupId", (req, res, next) => {
    if (!parseId(req.params.groupId)) {
      return res.status(404).send("Circle page not found");
    }
    res.sendFile(resolve(process.cwd(), "public/index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });
  app.use(express.static(resolve(process.cwd(), "public")));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      if (
        error instanceof SyntaxError &&
        "status" in error &&
        error.status === 400
      ) {
        res.status(400).json({ error: "Request body must be valid JSON" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
