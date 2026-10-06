# LaundryLink Next.js

LaundryLink is a full-stack TypeScript application built with the Next.js App Router, React Server Components, Server Actions, and Turso/libSQL.

## Requirements

- Node.js 20.9 or newer
- npm 10 or newer

## Local development

```bash
npm install
npm run db:setup
npm run db:migrate:security
npm run dev
```

Open `http://127.0.0.1:3000`. Copy `.env.example` to `.env.local` and provide local values. The local SQLite database under `data/` and all `.env*` files except `.env.example` are excluded from Git.

The optional demo seed uses `DEMO_PASSWORD`, or `development-password` when the variable is unset. Demo credentials are for local development only and must not be reused in staging or production.

## Environments

Use isolated credentials and databases for each environment:

| Environment | `APP_ENV` | Database | Purpose |
| --- | --- | --- | --- |
| Local | `development` | Local SQLite | Developer testing |
| Vercel Preview | `staging` | Dedicated staging Turso DB | QA and acceptance |
| Vercel Production | `production` | Dedicated production Turso DB | Live customer data |

Required hosted variables are `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUDIT_LOG_SALT`, and `PAYOUT_ENCRYPTION_KEY`. The payout key must be a base64-encoded 32-byte secret and must remain stable so encrypted identity and bank data can be decrypted during review. Set `APP_ORIGIN` to the canonical HTTPS origin. Vercel supplies deployment URL variables automatically; use `TRUSTED_ORIGINS` only for additional trusted reverse-proxy origins.

Authentication integrations are optional but must be configured before their flows become available:

| Capability | Variables | Provider configuration |
| --- | --- | --- |
| Verification and reset email | `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Verify the sending domain in Resend. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Register `${APP_ORIGIN}/api/auth/oauth/google/callback`. |
| Apple sign-in | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` | Register `${APP_ORIGIN}/api/auth/oauth/apple/callback`; the secret is Apple's signed client-secret JWT. |
| Phone verification | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Create a Twilio Verify service with SMS enabled. |

Never commit provider credentials. Configure separate values for preview and production deployments. Email registration is closed when email delivery is unavailable, and vendor registration is also closed when phone verification is unavailable, so accounts cannot be created in an unverifiable state.

Run the idempotent onboarding migration against each hosted database before deploying. It applies the onboarding schema first and then refreshes the security constraints:

```bash
node --env-file=.env.staging.local scripts/migrate-onboarding.mjs
node --env-file=.env.production.local scripts/migrate-onboarding.mjs
```

An empty Turso database can be initialized with `npm run db:setup:turso`. The seeder creates sanitized demo data and refuses a custom seed containing users outside its explicit demo allowlist.

Rotate an account password from a trusted terminal by supplying `USER_EMAIL` and `NEW_PASSWORD` as process environment variables, then running `npm run user:set-password`. The command never prints the password and revokes every existing session for that account.

## Security model

- Every Server Action authenticates and authorizes on the server. UI visibility is never treated as authorization.
- Ownership-sensitive updates include the authenticated user or cleaner identity in their database predicates.
- Opaque session tokens are stored only in secure HTTP-only cookies; only SHA-256 token hashes are stored in the database.
- Google, Apple, and email/password identities all resolve to the same `users` table. Verified provider emails may link to an existing identity; provider subject identifiers are uniquely constrained.
- Roles are `CUSTOMER`, `VENDOR_OWNER`, `VENDOR_MANAGER`, `VENDOR_STAFF`, `RIDER`, `SUPPORT_AGENT`, `ADMIN`, and `SUPER_ADMIN`. Protected pages and every mutation enforce role permissions on the server.
- Server Actions enforce trusted origins, bounded request bodies, Zod input schemas, and persistent database-backed rate limits.
- React output escaping and a Content Security Policy protect rendered user content; no raw HTML rendering is used.
- Vendor uploads enforce byte-size limits, declared MIME allowlists, file-signature checks, sanitized names, authorized retrieval, and content-disposition headers. Executable formats and SVG are rejected; add malware scanning before accepting broader document formats.
- Vendor identity and bank account numbers are encrypted at rest with AES-256-GCM and are masked in owner and admin review views.
- Database triggers, foreign keys, unique indexes, and checks reject invalid roles, states, prices, ratings, and session records.
- Security-sensitive mutations write structured audit records. Request failures are emitted as structured server logs without secrets or raw IP addresses.
- User-facing error boundaries return generic recovery messages; stack traces and database errors remain server-side.

## Checks

```bash
npm run check
```

This runs TypeScript, ESLint, the production dependency security audit, and a production build. Run `npm run security:audit:all` separately to review development-only tooling advisories.
