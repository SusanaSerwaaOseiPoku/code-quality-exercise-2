import assert from "node:assert/strict";
import { after, test } from "node:test";
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

  const created = await owner.post("/api/groups").send({
    name: "Market Women Circle",
    contributionAmount: 50,
  });
  assert.equal(created.status, 201);
  const groupId = created.body.group.id as number;
  const inviteCode = created.body.group.inviteCode as string;
  assert.equal(created.body.group.members[0].payoutStatus, "next");

  const hiddenGroup = await stranger.get(`/api/groups/${groupId}`);
  assert.equal(hiddenGroup.status, 404);

  const joined = await member.post("/api/groups/join").send({ inviteCode });
  assert.equal(joined.status, 201);
  const groupForMember = await member.get(`/api/groups/${groupId}`);
  assert.equal(groupForMember.status, 200);
  assert.equal(groupForMember.body.group.memberCount, 2);

  const deniedContribution = await owner
    .post(`/api/groups/${groupId}/contributions`)
    .send({ amount: 25 });
  assert.equal(deniedContribution.status, 400);

  const firstContribution = await owner
    .post(`/api/groups/${groupId}/contributions`)
    .send({ amount: 50 });
  const secondContribution = await member
    .post(`/api/groups/${groupId}/contributions`)
    .send({ amount: 50 });
  assert.equal(firstContribution.status, 201);
  assert.equal(secondContribution.status, 201);

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
