# FinTrack: launch readiness (2026-10-27)

What is verified, what is not, and what to do before and after each deploy.
"Verified" means I observed it; everything else is marked as such.

## 1. Production configuration

| Item | State |
|---|---|
| Vercel Root Directory | `apps/web` (confirmed by the owner) |
| Build command | `npm run vercel-build` → `prisma generate && prisma migrate deploy && next build`. **A deploy migrates that environment's database.** |
| Daily cron | `/api/public/cron/recurring` at `0 3 * * *` (UTC), registered via `apps/web/vercel.json`. |
| Bank-sync cron | Route exists (`/api/public/cron/bank-sync`), authenticated, **deliberately not scheduled**. |
| Environment variables present (names only, via the Vercel API) | `DATABASE_URL` (production, preview and development entries), `SESSION_SECRET`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `XAI_API_KEY`, `XAI_MODEL`, `AUTH_DEV_SHOW_CODE` |
| `AUTH_DEV_SHOW_CODE` in production | Set, but the code ignores it on Vercel production/preview (`isDevShowCode`), so login codes are never returned. |
| Not verifiable from here | Whether the preview `DATABASE_URL` points at a different database than production. **Check this**, because a preview deploy migrates whatever it points at. |

## 2. Migrations

All four recent migrations are **additive only**; none rewrites or drops existing data:

1. `20261027120000_recurring_occurrences`: occurrence key on transactions, run status on rules.
2. `20261027140000_accounts_and_transfers`: accounts, transfers, adjustments.
3. `20261027160000_transfer_fee_expense`: links a transfer's fee expense to the transfer.
4. `20261027180000_bank_import_groundwork`: bank connections and imports.

Before any deploy that includes a migration:
- Take a Neon snapshot or branch (the restore point). There is no automatic undo.
- Run the suite on a throwaway database first (see section 5).
- After the deploy: Neon `_prisma_migrations` should list the new names with a finished timestamp and no failure.

Rollback of an additive migration is "stop using it, then drop the new objects"; the old app version keeps working on the extra tables and columns.

**Pending clean-up (deliberately not done):** the leftover `Transaction.overspend` column. Drop it in its own migration once the live app no longer selects it: `ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "overspend";`. `prisma migrate diff` will always propose this drop; every migration here removes it from the generated SQL on purpose.

## 3. Backups and recovery (not verified)

I could not inspect Neon. Before launch, confirm yourself:
- [ ] The Neon plan's point-in-time-restore window (how far back you can recover).
- [ ] You have done one **practice restore** to a Neon branch and opened the app against it.
- [ ] You know who can reach the Neon console if you cannot.
- Users can download their own data (Plan page → Your data), which is a user-level backup but not a database backup.

## 4. Monitoring (minimal today)

- The recurring job logs one line per run with counts only: `[recurring] run finished {…}`; the HTTP response is `ok:false` if any rule failed. Rules also show their last problem on the Plan page.
- Errors log the error kind only, never amounts, notes or user ids.
- **Not set up:** alerting. Suggested: a Vercel log-drain or alert on `[recurring] … failedRules` > 0 and on `Run failed`, and an uptime check on `/login`.

## 5. Tests (what each one proves)

| Layer | Command | What it covers |
|---|---|---|
| Domain unit tests | `npm run test:domain` | Pure financial rules: allocation, carry-over, accounts, transfers, performance, insights, imports. |
| Web tests, in-memory database | `cd apps/web && npx vitest run` | Services and API routes with ownership, validation, atomicity. |
| Web tests, real PostgreSQL | `TEST_DATABASE_URL=postgresql://<you>@localhost:5432/fintrack_test npx vitest run` | The same tests on real constraints, locks and transactions. The harness refuses any non-local or non-"test" database. |
| Financial-integrity suite | `src/test/integrity.test.ts` (runs in both of the above) | 120 seeded random operations for two users, with every balance, total, bucket and fee re-derived independently after each one. Checked to fail when the balance maths is broken. |
| End-to-end, real browser | `cd apps/web && E2E_DATABASE_URL=postgresql://<you>@localhost:5432/fintrack_test E2E_BROWSER_CHANNEL=chrome npx playwright test` | Accounts, transfer with fee, bucket block, trends, export, read-only bank import, plus phone-width and form-label checks on six pages. **Refuses to start unless the database is local and named "test".** |
| CI | `.github/workflows/ci.yml` | Migrates a throwaway PostgreSQL, type check, domain + web tests (both databases), audit fails on **critical** production vulnerabilities. End-to-end tests are not in CI yet. |

## 6. Security

- Headers on every response (nosniff, no framing, referrer and permissions policies, HSTS) and a production Content-Security-Policy (self only). Checked on a local production build.
- `npm audit --omit=dev`: critical advisories cleared by upgrading Next. **Remaining (high/moderate, not fixed):** `zod` 3.x (the fix is a major upgrade to 4; request arrays are now size-bounded), `@prisma/config`'s `deepmerge-ts` (build tool), and a `postcss` copy pinned inside `next`. Plan the zod and Prisma upgrades as their own change.
- Rate limits: logins, codes, reset, and data export. Cron endpoints fail closed without `CRON_SECRET`.
- Account balances, transfers, imports and exports are scoped to the signed-in user on the server; there are tests that another user cannot reach them.

## 7. Open decisions and gaps

1. **Bank transactions that already happened** and exceed their bucket: the zero-block currently keeps them in the review queue. Decide whether they may be recorded outside the block, or with no bucket.
2. **Provider:** none chosen. Real bank data needs a provider agreement, legal advice on consent and data protection, and encrypted token storage (key in environment variables) before any real connection.
3. Net worth, interest, investment valuation, refunds and one-off expense flags are not modelled; the Trends page says so.
4. Money in existing transactions is still a `Float`; new tables use integer minor units. Converting the old column is a separate, riskier change.
5. A nonce-based Content-Security-Policy would remove the remaining `'unsafe-inline'`.
