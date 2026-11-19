# Milestone 1 pre-submission checklist

| Requirement                                 | Status              | Evidence / remaining work                                                                                                                                                                                      |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README has five answers and repo/live links | Partial             | Five answers and repository link are documented. Public app and `/health` URLs need deployment; they are not fabricated.                                                                                       |
| README screenshot                           | Done                | README embeds genuine local screenshots of group validation/success and contribution validation/success in `submission/evidence/`; they are labeled local, not live.                                           |
| Numbered server/client setup, seed, tests   | Drafted             | README explains that `public/` is served by Express, schema creation is automatic, accounts are registered manually, and tests use in-memory SQLite.                                                           |
| `.env.example` and `.env` ignore            | Partial             | Root `.env.example` is used by the server; `.gitignore` excludes `.env`. The static client has no separate environment variables, so `public/.env.example` documents that rather than inventing unused values. |
| Endpoint table covers all routes            | Done                | README lists health, auth, user, group, contribution, payout, static, deep-link page, and unknown API routes.                                                                                                  |
| Two request/reply examples                  | Done                | Group creation and contribution examples include the current required fields and illustrative replies.                                                                                                         |
| Three or more explanatory code comments     | Done in this change | Comments explain unknown-user password timing, session-token hashing/signature validation, private-circle 404 behavior, and atomic payout advancement.                                                         |
| Pre-submission checks                       | Partial             | Typecheck, tests, lint, and build pass. Run `npm audit` and verify the exact final commit before submission.                                                                                                   |
| Fresh-clone report                          | Pending final run   | Complete `submission/fresh-clone-report.md` with observed results and real snags/fixes.                                                                                                                        |
| 30-second explanation                       | Drafted             | Script is in `submission/30-second-explanation.md`; personalize and rehearse it.                                                                                                                               |
| Rubric-by-rubric self-score                 | Pending user input  | Official rubric and personal score were not provided; fill `submission/self-score.md` using the real rubric.                                                                                                   |
| Public app and `/health`                    | Pending deployment  | Choose a host with persistent SQLite storage and HTTPS, then verify both URLs.                                                                                                                                 |

## Fixes made in this readiness pass

- Added comments explaining four non-obvious security/transaction decisions.
- Rewrote README with setup, initial account creation, route table, and two request/reply examples.
- Documented that there is no seed command: the schema initializes on startup and users are created through sign-up; tests use an isolated in-memory database.
- Added a client-side `.env.example` explaining that the same-origin static client does not need its own variables.
- Added a concise explanation script and a fresh-clone report template.

## Group and contribution forms update

- Added frequency and start date to group creation, plus a member/amount/date contribution form with field-level validation.
- Added API-side validation and persistence for the new fields, including a migration for existing databases.
- Verified typecheck, API tests, lint, build, group creation and deep-link refresh, future-date validation, and contribution persistence after a browser refresh.
- Captured and embedded four genuine local UI screenshots. A clean-clone report and public deployment are still pending; no live URL is claimed.

## Rubric score

The official rubric and scoring scale were not included. Do not treat an AI estimate as the student's self-score. Add each official criterion and your honest score here after receiving the rubric.
