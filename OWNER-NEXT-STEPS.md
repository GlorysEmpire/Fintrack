# Before the next phase: the bucket rule, and your checklist

## Part 1. The bucket rule: my view

**Your recommendation is right:** let the user approve the exception directly, with an explicit confirmation and a full audit trail, rather than forcing a separate "reallocate first" step.

Why it's better than reallocate-first:
- It keeps the transaction true to reality (rule 1): the expense happened, in the bucket it belongs to.
- The reallocation is only ever created *because of a real expense*, so a bucket can't be "topped up artificially" with free-standing moves.
- One decision, one record, one place to look later.

### What exists today
An expense bigger than its bucket's balance is **refused**: nothing is saved, and the app never suggests another bucket. That was your 5 October rule. The new rule replaces the second half of it, so it's your call to change it, and I'd treat the 5 October wording as superseded.

### What I'd build
When an expense is more than its bucket holds:
1. Show the shortfall ("Spend has ₦8,100; this needs ₦9,000; short by ₦900").
2. The user may **fund the shortfall from another bucket** that can cover it, and must confirm and give a short reason.
3. FinTrack saves, **in one all-or-nothing write**: the expense (in its own bucket) and a **reallocation record** (from bucket, to bucket, exactly the shortfall, date, reason, linked to the expense).
4. The source bucket goes down and the target goes up by that amount, so the month stays consistent: `closing = opening + allocated + reallocated in - reallocated out - spent`.
5. Everywhere the spending shows (bucket cards, Trends, Steward), it is visible that the plan was **deviated from**, which bucket funded it, and by how much. A "plan deviations" list is the audit trail.
6. Deleting that expense (inside the 48-hour window) deletes its reallocation with it.

What stays the same: nothing can go below zero; a bucket that can't cover the shortfall can't be a source; there is no way to move money between buckets without a real expense behind it.

### What changes in the system
- One new table (additive migration), and the **core month-by-month bucket maths** gains reallocation in and out. This touches carry-over, plan-change previews, the cached opening balances, Trends and the Steward. It is the riskiest kind of change, so it needs its own full test pass, including the random integrity suite.
- Bank imports and transfer fees use the same path, which **settles open decision 1** (what to do with a bank transaction that already happened and exceeds its bucket).
- Recurring rules stay as they are: an occurrence a bucket can't cover is still skipped and you're told. A rule must not approve an exception for you.

### Three small choices I need from you
1. **Protected buckets:** may Emergency and Save (carry-over buckets) fund an exception? I'd allow it, but with a stronger warning and a required reason.
2. **Reason:** required (my recommendation) or optional?
3. **Limit:** exactly the shortfall only (my recommendation), or any amount?

I won't build any of this until you confirm.

---

## Part 2. What you need to do yourself, step by step

Everything below is on your Mac or in your dashboards. I haven't pushed or changed anything live.

### Step 1. Know what is where (corrected: everything IS pushed)
I first wrote that the Phase 5 commits were only on your Mac. That was wrong: I hadn't checked. Vercel's API shows the newest **production** deployment is commit `b27ccf2` (my latest commit), state Ready, pushed to GitHub on 28 Oct. So all my work is on GitHub and deployed.
- Phase 5 added **no new migration**; the four earlier ones were applied by the Phase 4 deploy.
- The repo is **public** on GitHub. I checked: the only environment file tracked is `apps/web/.env.example`, so no secrets are in it.

So Step 5 ("push") below is already done. Skip it, and go straight to checking the deploy and CI.

### Step 2. Run the tests (about 3 minutes)
In the repo folder:
```
npm run lint
npm run test:domain
cd apps/web && npx vitest run
```
All should pass. These use no real database.

### Step 3. Try the app locally, safely
**Warning:** `apps/web/.env` points at your live database. Don't run `npm run dev` or `npm run build` as it is, because that would use live data.

Use a separate local database instead:
```
createdb fintrack_dev
cd apps/web
DATABASE_URL=postgresql://$(whoami)@localhost:5432/fintrack_dev npx prisma migrate deploy
cd ../..
DATABASE_URL=postgresql://$(whoami)@localhost:5432/fintrack_dev SESSION_SECRET=any-long-random-text AUTH_DEV_SHOW_CODE=true BANK_MOCK_ENABLED=true RESEND_API_KEY= npm run dev
```
Open http://localhost:3456. The login code shows on screen. Then try:
- Set up a plan, add two accounts, record a transfer with a fee, and see the balances.
- Try an expense bigger than a bucket: it should be refused.
- Open Trends and Plan → Your data (download a CSV).
- Bank imports → connect the demo bank, link an account, sync, record one item.

### Step 3b (optional). Run the browser tests
```
cd apps/web
E2E_DATABASE_URL=postgresql://$(whoami)@localhost:5432/fintrack_test E2E_BROWSER_CHANNEL=chrome npx playwright test
```
It refuses to run unless the database is local and its name contains "test".

### Step 4. Protect the live database before anything new is deployed
In Neon:
1. Create a **branch** from your main database. This is your restore point.
2. Check how far back **point-in-time restore** goes on your plan.
3. Do one **practice restore** (open the branch, confirm the data is there). A backup you have never restored is only a guess.
4. Run `select migration_name, finished_at from _prisma_migrations order by 1;` in Neon's SQL editor and confirm the four `20261027…` rows have a finished time. That confirms the migrations really applied.

### Step 5. Check the deploy (the push already happened)
In Vercel:
1. Deployments → the `b27ccf2` one is **Ready** (confirmed by me).
2. Open its build log and find the `prisma migrate deploy` lines ("No pending migrations" is expected this time).
3. If it fails, the old version stays live. Send me the log.

### Step 6. Check the first CI run
GitHub → the repo → **Actions** → the newest "CI" run.
- Green: good.
- Red: open the failing step and send me the text. The end-to-end job is the likeliest to need a tweak, because I couldn't run it on GitHub from here.

### Step 7. Check Vercel settings
- Settings → **Build and Deployment**: Root Directory is `apps/web`.
- Settings → **Cron Jobs**: `/api/public/cron/recurring` is listed at 03:00 UTC. (The bank-sync job is intentionally not scheduled.)
- Settings → **Environment Variables**: `CRON_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, Upstash and Resend keys exist.
- **Important:** compare the **Preview** `DATABASE_URL` with the **Production** one. If they point at the same Neon database, a preview deploy would migrate production.

### Step 8. Use the live site for 10 minutes
Accounts, a transfer with a fee, Trends, the export download, Plan → Recurring. Tell me anything that looks wrong.

### Step 9. Decide the open questions
1. The three bucket-rule choices above (protected buckets, reason, limit).
2. **Bank provider:** which to approach (I'd contact Mono and Stitch), after legal advice on consent.
3. **Provider tokens:** encrypt them with a key stored in Vercel's environment variables?
4. Add **alerts** (Vercel) on the recurring job's failures?
5. Plan a separate change for the remaining dependency upgrades (zod 4, Prisma).

When steps 1 to 8 are done and you've answered step 9, tell me, and I'll build the bucket-exception rule first.
