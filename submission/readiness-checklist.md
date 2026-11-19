# Milestone 1 pre-submission checklist

| Requirement                                 | Status                   | Evidence / remaining work                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README has five answers and repo/live links | Partial                  | Five answers and repository link are documented. Public app and `/health` URLs need deployment; they are not fabricated.                                                                                       |
| README screenshot                           | Pending                  | Add a genuine local dashboard screenshot at `submission/evidence/susu-circle-dashboard.png`; label it local, not live.                                                                                         |
| Numbered server/client setup, seed, tests   | Drafted                  | README explains that `public/` is served by Express, schema creation is automatic, accounts are registered manually, and tests use in-memory SQLite.                                                           |
| `.env.example` and `.env` ignore            | Partial                  | Root `.env.example` is used by the server; `.gitignore` excludes `.env`. The static client has no separate environment variables, so `public/.env.example` documents that rather than inventing unused values. |
| Endpoint table covers all routes            | Drafted                  | README lists health, auth, user, group, contribution, payout, static, and unknown API routes.                                                                                                                  |
| Two request/reply examples                  | Drafted                  | Registration and contribution examples are in README; values are illustrative.                                                                                                                                 |
| Three or more explanatory code comments     | Done in this change      | Comments explain unknown-user password timing, session-token hashing/signature validation, private-circle 404 behavior, and atomic payout advancement.                                                         |
| Pre-submission checks                       | Pending final validation | Run typecheck, tests, lint, build, audit, and verify the exact final commit.                                                                                                                                   |
| Fresh-clone report                          | Pending final run        | Complete `submission/fresh-clone-report.md` with observed results and real snags/fixes.                                                                                                                        |
| 30-second explanation                       | Drafted                  | Script is in `submission/30-second-explanation.md`; personalize and rehearse it.                                                                                                                               |
| Rubric-by-rubric self-score                 | Pending user input       | Official rubric and personal score were not provided; fill `submission/self-score.md` using the real rubric.                                                                                                   |
| Public app and `/health`                    | Pending deployment       | Choose a host with persistent SQLite storage and HTTPS, then verify both URLs.                                                                                                                                 |

## Fixes made in this readiness pass

- Added comments explaining four non-obvious security/transaction decisions.
- Rewrote README with setup, initial account creation, route table, and two request/reply examples.
- Documented that there is no seed command: the schema initializes on startup and users are created through sign-up; tests use an isolated in-memory database.
- Added a client-side `.env.example` explaining that the same-origin static client does not need its own variables.
- Added a concise explanation script and a fresh-clone report template.

## Rubric score

The official rubric and scoring scale were not included. Do not treat an AI estimate as the student's self-score. Add each official criterion and your honest score here after receiving the rubric.
