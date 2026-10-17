# LaundryLink Backend Reuse Audit

Audit performed against repository `Switzey/laundrylink-nextjs`, `main` at `0e617f38d7e73ca758ee3d7a4755ca048744021b`. This is a **source audit**, not proof of the currently deployed Vercel commit or a live production integration test.

## Verified baseline

- Next.js 16.3.8, React 19.3, TypeScript, Node.js 24, npm 11, `@libsql/client` and Turso/libSQL (local SQLite).
- `src/lib/db.ts` exposes `all`, `one`, `run`, `transaction` with parameterized queries and a transaction context. No Prisma ORM is currently installed.
- Browser login and mutations use server-only code, web cookie sessions and Next.js Server Actions. Session tokens are opaque, hashed server-side, and delivered as HttpOnly cookies.
- Zod validation, authorization, phone/email policy, pricing engine, booking policy, vendor eligibility and file validation exist.
- Database migration scripts and `npm run check` / Vitest / Playwright tests exist. The latest observed `main` GitHub CI run concluded successfully.
- `src/app/api` contains selected JSON endpoints such as account and booking availability, but no complete `/api/v1` mobile contract.

## Reuse decision matrix

| Module | Source evidence | Decision | Conditions |
| --- | --- | --- | --- |
| Database and queries | `src/lib/db.ts`, `scripts/*.mjs` | **Reuse** | Keep Turso/libSQL initially; use additive migrations and isolated staging DB |
| Pricing and fee computation | `src/lib/pricing-engine.ts` | **Reuse** | API owns price calculation; never trust mobile totals |
| Booking and order transition policy | `src/lib/booking-policy.ts`, `src/lib/order-policy.ts` | **Reuse** | Add shared application services for web and mobile |
| Marketplace / vendor eligibility | `src/lib/marketplace.ts`, `src/lib/vendor-eligibility.ts` | **Reuse** | Recheck eligibility in order transaction |
| Email/password validation | `src/lib/auth-validation.ts`, `src/app/actions/auth.ts` | **Extract** | Web actions redirect; native needs JSON errors and mobile token issuance |
| Web sessions | `src/lib/auth.ts` | **Extend** | Preserve web cookies; add independently revocable mobile token flow |
| Google / Apple OAuth | `src/lib/oauth.ts`, OAuth route handlers | **Adapt** | Native PKCE/deep links and verified server-side exchange; do not reuse browser callbacks unchanged |
| Customer order creation | `src/app/actions/orders.ts` | **Extract** | Shared order service, idempotency, ownership, authoritative quote and transactional guard |
| Vendor onboarding | `src/app/actions/onboarding.ts` | **Extract** | Versioned JSON/upload APIs, existing validations and admin approval |
| Existing admin pages | `src/app/admin/**` | **Reuse** | Keep Next.js web admin as primary operations console |
| Rider assignment and payout | Roles exist in `src/lib/types.ts`; no complete dispatch/settlement engine in repo | **Build** | Dedicated trip/assignment/proof/ledger model required |
| Real payment processing | Orders create `payments` records with pending status but no completed provider settlement flow | **Build** | Signed verified webhooks, reconciliation, refunds and audited ledger |
| Notifications | Existing notification writes | **Extend** | Push device tokens, durable queue, deep links, retry/dedupe |
| Security and audit | `src/lib/authorization.ts`, `src/lib/audit.ts` | **Reuse & extend** | Mobile authorization must enforce RBAC, origin rules differ for bearer clients |

## Deployment findings to recheck

**These are documented findings as of 2026-10-15, not a claim of today's live status.**

- `docs/deployment-reconciliation.md` recorded production schema/secret gaps: insufficient `AUDIT_LOG_SALT`, missing phone-verification and vendor eligibility migrations, and missing email/OAuth/Twilio integrations in the checked environment.
- `docs/qa/live-production-report-2026-10-15.md` recorded `/api/health` returning 404 on the deployed site even though the route exists in code; Apple sign-in unavailable; cleaner sorting accessible-name error; verified label contrast failure; authenticated production tests not run without dedicated QA identities.
- Production deployment may lag behind GitHub `main`. Confirm Vercel Settings > Git, the deployed SHA and isolated secrets before release.

## Hard gates before mobile writes to live customer records

1. Verify Vercel production commit, readiness endpoint and staging environment; protect current production branch.
2. Back up production Turso; run migration compatibility checks and phone-verification impact audit against staging first.
3. Verify mail / OAuth / SMS configuration and safely test protected auth flows.
4. Extract a service boundary without changing existing Server Action behavior.
5. Add mobile API auth, role checks, idempotency and automated integration tests.
6. Implement payments, logistics, refunds and ledger as new bounded modules behind feature flags.

Do not assume deployment health, provider readiness or production schema from repository source alone.
