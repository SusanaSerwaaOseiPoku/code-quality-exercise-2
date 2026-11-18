# Susu Circle — Milestone 1

A small web app for organizing rotating savings circles. Members can create a circle, invite members, record each round's contributions, and track the payout order. The app records activity; it does **not** transfer, hold, or process money.

## Submission links and status

- GitHub repository: https://github.com/SusanaSerwaaOseiPoku/susu-circle-milestone
- Latest checks: [GitHub Actions run 1](https://github.com/SusanaSerwaaOseiPoku/susu-circle-milestone/actions/runs/44319457449) — typecheck, tests, lint, build, and dependency audit passed.
- Live site: **Pending deployment**
- Live API health check: **Pending deployment** (`/health`)

The app has been exercised locally, but it is not publicly deployed yet. Do not present a localhost URL as the live site. Deployment needs a host with persistent storage for SQLite and HTTPS.

## Run locally

Requirements: Node.js 20 or newer and npm.

```powershell
npm ci
Copy-Item .env.example .env
```

Set `SESSION_SECRET` in `.env` to a private random value of at least 32 characters. For example, generate one with:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Keep `.env` private; only `.env.example` belongs in Git.

```powershell
npm run dev
```

Open `http://localhost:3000`. The development server creates its SQLite database at `data/susu-circle.sqlite`.

## Checks

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm audit
```

The API integration test covers health, registration, private-circle access, joining, contributions, payout progression, and logout. Capture and add separate screenshots of the passing test and lint results in `submission/evidence/` before calling the submission complete.
The GitHub Actions workflow runs the typecheck, tests, lint, build, and dependency audit on pushes and pull requests.

## Main API routes

- `GET /health` — database-backed health check.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` — account and session actions.
- `GET /api/groups`, `POST /api/groups`, `POST /api/groups/join`, `GET /api/groups/:groupId` — list, create, join, and view circles.
- `POST /api/groups/:groupId/contributions` — record the signed-in member's contribution for the current round.
- `POST /api/groups/:groupId/payouts` — circle owner records the round payout after all members contribute.

Amounts are whole-number units with no currency conversion. Payout entries are records only and are not proof that money changed hands.

## Security and deployment limits

The app hashes passwords with scrypt, signs opaque session cookies, stores only session hashes, uses parameterized SQL, and restricts circle data to members. Production must use HTTPS and a strong private `SESSION_SECRET`. This class MVP is not a financial service or a production-ready money-handling system; a real launch would need a security review, operational controls, backups, monitoring, and appropriate legal and privacy review. SQLite also requires persistent storage on the chosen host.

## Rehearsal and remaining personal work

- [Five-minute demo script](submission/demo-script.md)
- [Vibe Coding Log](submission/vibe-coding-log.md)
- [Readiness checklist and self-score](submission/readiness-checklist.md)
- [Reflection template](submission/reflection.md)

The test accounts should be created by you during rehearsal using two distinct email addresses and passwords; there are no seeded or shared credentials. Make a backup recording, present to a partner with a timer, collect their feedback, and practice the demo a second time. These personal activities and evidence are not represented as completed by this repository.

## Milestone 2 idea

I would add opt-in reminders before each contribution deadline. This could help members stay on schedule and reduce the owner's follow-up work.
