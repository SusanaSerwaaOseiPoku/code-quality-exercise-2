import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type AppDatabase = InstanceType<typeof Database>;

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    contribution_amount INTEGER NOT NULL CHECK (contribution_amount > 0),
    current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round > 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_order INTEGER NOT NULL CHECK (payout_order > 0),
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id),
    UNIQUE (group_id, payout_order)
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL CHECK (round_number > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    created_at TEXT NOT NULL,
    UNIQUE (group_id, user_id, round_number),
    FOREIGN KEY (group_id, user_id)
      REFERENCES group_members(group_id, user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL CHECK (round_number > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    paid_at TEXT NOT NULL,
    UNIQUE (group_id, round_number),
    FOREIGN KEY (group_id, recipient_id)
      REFERENCES group_members(group_id, user_id)
  );
`;

export function createDatabase(filePath: string): AppDatabase {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(resolve(filePath)), { recursive: true });
  }

  const db = new Database(filePath);
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  return db;
}
