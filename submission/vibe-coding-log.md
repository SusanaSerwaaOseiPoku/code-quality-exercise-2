# Vibe Coding Log

This log records AI-assisted work on the Milestone 1 project. Review it, correct anything that does not match your own experience, and add your own checks before submitting.

## What AI helped create or change

- Expanded the existing Susu Circle TypeScript domain model into a local Express and SQLite application.
- Added registration, login/logout, session handling, circle creation and joining, contribution recording, and owner-recorded payout progression.
- Added a browser interface, environment example, project scripts, and an API integration test.
- Drafted the README, demo script, and submission templates. These drafts are not a substitute for your own presentation or reflection.

## What was checked during development

- `npm run typecheck`
- `npm test` — health, authentication, member privacy, joining, contributions, payout progression, and logout.
- `npm run lint`
- `npm run build`
- `npm audit`
- Manual local browser flow with two accounts, a circle, contributions, and a recorded payout.

These are development checks performed during implementation, not a claim that the student independently reviewed every line or completed the live-site requirements. Re-run the checks and capture the requested screenshots before submission.

## What I still need to check myself

- Re-run each command in the README and save separate, genuine screenshots of the passing test and lint output in `submission/evidence/`.
- Verify `/health` and login on the deployed live site after deployment.
- Create two rehearsal accounts with non-reused passwords; never commit their credentials.
- Read the authentication, membership, contribution, and payout code and make sure I can explain it.
- Present with a timer, collect real partner feedback, make the weakest point better, and repeat the demo.
- Make a backup recording and verify that it plays.
- Replace the reflection template with answers to the exact Week 23 questions in my own words.
