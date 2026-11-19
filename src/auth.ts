import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AppDatabase } from "./db.js";

const cookieName = "susu.session";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const dummySalt = Buffer.alloc(16);
const dummyHash = scryptSync("not-a-real-password", dummySalt, 64);

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

type UserRow = AuthUser & {
  password_salt: string;
  password_hash: string;
};

declare module "express-serve-static-core" {
  interface Request {
    authUser?: AuthUser;
  }
}

export function findUserByEmail(
  db: AppDatabase,
  email: string,
): UserRow | undefined {
  return db
    .prepare(
      `SELECT id, name, email, password_salt, password_hash
       FROM users WHERE email = ?`,
    )
    .get(email) as UserRow | undefined;
}

export function createUser(
  db: AppDatabase,
  name: string,
  email: string,
  password: string,
): AuthUser {
  const salt = randomBytes(16);
  const passwordHash = scryptSync(password, salt, 64);
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_salt, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      email,
      salt.toString("hex"),
      passwordHash.toString("hex"),
      createdAt,
    );

  return {
    id: Number(result.lastInsertRowid),
    name,
    email,
  };
}

export function verifyPassword(
  user: UserRow | undefined,
  password: string,
): boolean {
  if (!user) {
    // Keep unknown emails on the same expensive path to reduce account-enumeration timing clues.
    scryptSync(password, dummySalt, dummyHash.length);
    return false;
  }

  const expected = Buffer.from(user.password_hash, "hex");
  const actual = scryptSync(
    password,
    Buffer.from(user.password_salt, "hex"),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

function sessionHash(sessionId: string): string {
  // A database read alone should not reveal a directly reusable session token.
  return createHash("sha256").update(sessionId).digest("hex");
}

function signature(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

function getSessionId(req: Request, secret: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const cookie = cookies
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));
  if (!cookie) {
    return undefined;
  }

  const value = cookie.slice(cookieName.length + 1);
  const [sessionId, suppliedSignature, extra] = value.split(".");
  if (!sessionId || !suppliedSignature || extra !== undefined) {
    return undefined;
  }

  const expectedSignature = Buffer.from(signature(sessionId, secret));
  const actualSignature = Buffer.from(suppliedSignature);
  // Reject tampered cookie IDs before looking up a session in the database.
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return undefined;
  }

  return sessionId;
}

export function createAuthMiddleware(
  db: AppDatabase,
  secret: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = getSessionId(req, secret);
    if (!id) {
      next();
      return;
    }

    const user = db
      .prepare(
        `SELECT u.id, u.name, u.email
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.session_hash = ? AND s.expires_at > ?`,
      )
      .get(sessionHash(id), Date.now()) as AuthUser | undefined;

    if (user) {
      req.authUser = user;
    } else {
      db.prepare("DELETE FROM sessions WHERE session_hash = ?").run(
        sessionHash(id),
      );
    }
    next();
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function createSession(
  db: AppDatabase,
  userId: number,
  res: Response,
  secret: string,
  secureCookie: boolean,
): void {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + sessionLifetimeMs;
  db.prepare(
    "INSERT INTO sessions (session_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(sessionHash(id), userId, expiresAt);

  const cookieValue = `${id}.${signature(id, secret)}`;
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeMs / 1000}${secure}`,
  );
}

export function destroySession(
  db: AppDatabase,
  req: Request,
  res: Response,
  secret: string,
  secureCookie: boolean,
): void {
  const id = getSessionId(req, secret);
  if (id) {
    db.prepare("DELETE FROM sessions WHERE session_hash = ?").run(
      sessionHash(id),
    );
  }
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}
