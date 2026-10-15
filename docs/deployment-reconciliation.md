# Deployment reconciliation

Snapshot date: 2026-10-15 (Africa/Lagos)

## Intended production branch

`main` is the intended production branch for `Switzey/laundrylink-nextjs`.

- GitHub reports `main` as the repository default branch.
- `origin/main` is `ae19f5e2a1f0247951945445ca071286f34acc2c` (`Preserve checkout intent through authentication`).
- `origin/codex/nextjs-migration` is `f36819850ce4408a67a7391c699ebd7b0f9252ef` (`feat: add secure vendor onboarding flow`).
- `ae19f5e` is the merge base. There are no commits unique to `main`; the migration branch is one direct descendant commit ahead.
- This reconciliation branch adds the security, phone verification, vendor eligibility, CI, and release-readiness work on top of `f368198`.

The reconciliation must be reviewed through a pull request into `main`. Do not force-push or delete either existing branch.

## Observed Vercel deployment state

GitHub's deployment records provide the following evidence:

- The latest recorded Production deployment is commit `ae19f5e`, created on 2026-10-01, with deployment URL `https://laundrylink-next-22cbsjrmf-switzey.vercel.app`.
- Commit `f368198` was deployed only as a Preview on 2026-10-06, with deployment URL `https://laundrylink-next-3cvw5umaf-switzey.vercel.app`.
- The canonical application URL `https://laundrylink-next.vercel.app` currently responds from Vercel.
- The local directory is linked to the Vercel project named `laundrylink-next`.

The Vercel project API rejected the available deployment OIDC credential with HTTP 403. Therefore the project's configured Production Branch setting could not be read directly. Before merging, an authorized Vercel account must confirm that Settings > Git > Production Branch is `main`. The deployment history strongly supports that relationship, but it is not a substitute for the project setting.

## Functionality preserved by the pull request

Compared with `origin/main`, the pull request preserves and adds:

- Checkout return-intent behavior already present on `main`.
- Secure multi-step vendor onboarding from `f368198`, including encrypted identity and payout data and validated vendor uploads.
- Exact-number account and vendor-business phone verification with stale-code and race-condition protection.
- Central vendor publication and booking eligibility shared by marketplace pages and order creation.
- Separate verification approval, publication, accepting-orders, and suspension states.
- Production health/readiness checks, structured security logging, and the supported Next.js/Node dependency set.

Pausing or suspending a vendor does not remove existing orders. New orders are rejected server-side whenever the centralized eligibility check fails.

## CI and workflow state

The previous GitHub workflow tested Node 18, 20, and 22. Its recorded runs failed because `node:sqlite` was unavailable on Node 20, while this application requires Node 24.

The reconciliation changes CI to:

- Node 24.x, matching `package.json`.
- Current official `actions/checkout@v7` and `actions/setup-node@v7` releases.
- One `npm run check` gate covering TypeScript, ESLint, automated tests, production dependency audit, and a production build.
- Read-only repository permissions, concurrency cancellation, and a 20-minute timeout.

## Database and environment release gates

The production readiness check on 2026-10-15 reached the hosted database but reported these blockers:

- `AUDIT_LOG_SALT` is shorter than the required 32 unpredictable characters.
- `phone_verification_attempts` is missing.
- Exact-number account and vendor-business phone columns are missing.
- Vendor publication and suspension columns are missing.
- The centralized `vendor_eligibility` view is missing.

Email, Google, Apple, and Twilio integrations were also absent from the pulled production environment. These integrations are optional at runtime, but unavailable flows remain disabled. Twilio must be configured and tested before intentionally invalidating legacy phone verification state.

The read-only compatibility check cloned all 18 production table definitions into a disposable local database, applied the auth/onboarding/security sequence twice, found every required object, and reported zero foreign-key failures. The production database itself was not modified.

Local validation on Node 24 completed successfully:

- TypeScript: passed.
- ESLint: passed.
- Automated tests: 21 passed, 0 failed.
- Production dependency audit: 0 vulnerabilities.
- Next.js 16.3.8 optimized production build: passed.

Required release order:

1. Confirm the Vercel Production Branch is `main` and that Preview and Production use isolated databases and credentials.
2. Rotate `AUDIT_LOG_SALT` and retain the existing stable `PAYOUT_ENCRYPTION_KEY`.
3. Configure and test Twilio Verify if phone-gated vendor registration is expected at release.
4. Back up the production Turso database.
5. Run `scripts/audit-phone-verification.mjs` against staging, then production, and review the reported impact.
6. Run `scripts/check-migration-compatibility.mjs` to test the hosted schema upgrade in a disposable local database.
7. Run `scripts/migrate-phone-verification.mjs`; it applies auth, onboarding, and security schemas in dependency order and deliberately invalidates unbound legacy phone verification.
8. Run `scripts/check-production-readiness.mjs` and require zero failures.
9. Validate the Preview deployment and core authentication, marketplace, vendor, and existing-order workflows.
10. Merge only with explicit authorization. A merge to `main` may trigger Vercel production deployment automatically.

No production migration, merge, or deployment is performed by the reconciliation pull request.
