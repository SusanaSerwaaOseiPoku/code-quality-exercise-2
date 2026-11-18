import "dotenv/config";
import { createApp } from "./app.js";
import { createDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? "./data/susu-circle.sqlite";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const secureCookies = process.env.NODE_ENV === "production";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
if (sessionSecret.length < 32) {
  throw new Error(
    "Set SESSION_SECRET to a random value of at least 32 characters",
  );
}

const db = createDatabase(databasePath);
const app = createApp({ db, sessionSecret, secureCookies });

app.listen(port, "0.0.0.0", () => {
  console.log(`Susu Circle listening on port ${port}`);
});
