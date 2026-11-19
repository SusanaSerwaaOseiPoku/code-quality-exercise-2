import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db.js";

const db = createDatabase(":memory:");
const app = createApp({
  db,
  sessionSecret: "test-session-secret-with-more-than-thirty-two-characters",
});
const owner = request.agent(app);
const member = request.agent(app);
const stranger = request.agent(app);

after(() => {
  db.close();
});

test("members can run a contribution round without seeing private circles", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const health = await request(app).get("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ok" });

  const anonymousGroups = await request(app).get("/api/groups");
  assert.equal(anonymousGroups.status, 401);

  const ownerRegistration = await owner.post("/api/auth/register").send({
    name: "Ama Owner",
    email: "ama@example.test",
    password: "correct-horse-owner",
  });
  assert.equal(ownerRegistration.status, 201);
  assert.deepEqual(Object.keys(ownerRegistration.body.user).sort(), [
    "email",
    "id",
    "name",
  ]);

  const memberRegistration = await member.post("/api/auth/register").send({
    name: "Esi Member",
    email: "esi@example.test",
    password: "correct-horse-member",
  });
  assert.equal(memberRegistration.status, 201);
  const strangerRegistration = await stranger.post("/api/auth/register").send({
    name: "Kojo Stranger",
    email: "kojo@example.test",
    password: "correct-horse-stranger",
  });
  assert.equal(strangerRegistration.status, 201);

  const missingStartDate = await owner.post("/api/groups").send({
    name: "Incomplete Circle",
    contributionAmount: 50,
    frequency: "weekly",
  });
  assert.equal(missingStartDate.status, 400);

  const created = await owner.post("/api/groups").send({
    name: "Market Women Circle",
    contributionAmount: 50,
    frequency: "monthly",
    startDate: today,
  });
  assert.equal(created.status, 201);
  const groupId = created.body.group.id as number;
  const inviteCode = created.body.group.inviteCode as string;
  assert.equal(created.body.group.frequency, "monthly");
  assert.equal(created.body.group.startDate, today);
  assert.equal(created.body.group.members[0].payoutStatus, "next");

  const groupPage = await request(app).get(`/groups/${groupId}`);
  assert.equal(groupPage.status, 200);
  assert.match(groupPage.text, /Susu Circle/);

  const hiddenGroup = await stranger.get(`/api/groups/${groupId}`);
  assert.equal(hiddenGroup.status, 404);

  const joined = await member.post("/api/groups/join").send({ inviteCode });
  assert.equal(joined.status, 201);
  const groupForMember = await member.get(`/api/groups/${groupId}`);
  assert.equal(groupForMember.status, 200);
  assert.equal(groupForMember.body.group.memberCount, 2);

  const deniedContribution = await owner
    .post(`/api/groups/${groupId}/contributions`)
    .send({
      memberId: ownerRegistration.body.user.id,
      amount: 25,
      date: today,
    });
  assert.equal(deniedContribution.status, 400);

  const futureContribution = await owner
    .post(`/api/groups/${groupId}/contributions`)
    .send({
      memberId: ownerRegistration.body.user.id,
      amount: 50,
      date: "2999-01-01",
    });
  assert.equal(futureContribution.status, 400);

  const unauthorizedContribution = await member
    .post(`/api/groups/${groupId}/contributions`)
    .send({
      memberId: ownerRegistration.body.user.id,
      amount: 50,
      date: today,
    });
  assert.equal(unauthorizedContribution.status, 403);

  const firstContribution = await owner
    .post(`/api/groups/${groupId}/contributions`)
    .send({
      memberId: ownerRegistration.body.user.id,
      amount: 50,
      date: today,
    });
  const secondContribution = await member
    .post(`/api/groups/${groupId}/contributions`)
    .send({
      memberId: memberRegistration.body.user.id,
      amount: 50,
      date: today,
    });
  assert.equal(firstContribution.status, 201);
  assert.equal(secondContribution.status, 201);
  assert.equal(firstContribution.body.contribution.contributionDate, today);

  const persistedGroup = await owner.get(`/api/groups/${groupId}`);
  assert.equal(persistedGroup.status, 200);
  assert.equal(persistedGroup.body.group.contributions.length, 2);
  assert.equal(
    persistedGroup.body.group.contributions[0].contributionDate,
    today,
  );

  const payout = await owner.post(`/api/groups/${groupId}/payouts`).send({});
  assert.equal(payout.status, 201);
  assert.equal(payout.body.payout.memberId, ownerRegistration.body.user.id);

  const nextRound = await member.get(`/api/groups/${groupId}`);
  assert.equal(nextRound.body.group.currentRound, 2);
  assert.equal(
    nextRound.body.group.members.find(
      (entry: { id: number }) => entry.id === memberRegistration.body.user.id,
    ).payoutStatus,
    "next",
  );
  assert.equal(nextRound.body.group.payouts[0].memberName, "Ama Owner");

  await owner.post("/api/auth/logout").send({});
  const loggedOutGroups = await owner.get("/api/groups");
  assert.equal(loggedOutGroups.status, 401);
});

test("migrates existing groups and contributions with date fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "susu-circle-migration-"));
  const databasePath = join(directory, "legacy.sqlite");

  try {
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE groups (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        invite_code TEXT NOT NULL,
        contribution_amount INTEGER NOT NULL,
        current_round INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE contributions (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        round_number INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO groups VALUES
        (1, 1, 'Legacy Circle', 'OLD123', 25, 1, '2026-03-10T12:30:00.000Z');
      INSERT INTO contributions VALUES
        (1, 1, 1, 1, 25, '2026-03-11T12:30:00.000Z');
    `);
    legacy.close();

    const migrated = createDatabase(databasePath);
    try {
      assert.deepEqual(
        migrated
          .prepare("SELECT frequency, start_date FROM groups WHERE id = 1")
          .get(),
        { frequency: "weekly", start_date: "2026-03-10" },
      );
      assert.deepEqual(
        migrated
          .prepare("SELECT contribution_date FROM contributions WHERE id = 1")
          .get(),
        { contribution_date: "2026-03-11" },
      );
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
