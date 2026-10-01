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

Required hosted variables are `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `AUDIT_LOG_SALT`. Set `APP_ORIGIN` to the canonical HTTPS origin. Vercel supplies deployment URL variables automatically; use `TRUSTED_ORIGINS` only for additional trusted reverse-proxy origins.

Run the idempotent schema migration against each hosted database before deploying:

```bash
node --env-file=.env.staging.local scripts/migrate-security.mjs
node --env-file=.env.production.local scripts/migrate-security.mjs
```

An empty Turso database can be initialized with `npm run db:setup:turso`. The seeder creates sanitized demo data and refuses a custom seed containing users outside its explicit demo allowlist.

Rotate an account password from a trusted terminal by supplying `USER_EMAIL` and `NEW_PASSWORD` as process environment variables, then running `npm run user:set-password`. The command never prints the password and revokes every existing session for that account.

## Security model

- Every Server Action authenticates and authorizes on the server. UI visibility is never treated as authorization.
- Ownership-sensitive updates include the authenticated user or cleaner identity in their database predicates.
- Opaque session tokens are stored only in secure HTTP-only cookies; only SHA-256 token hashes are stored in the database.
- Server Actions enforce trusted origins, bounded request bodies, Zod input schemas, and persistent database-backed rate limits.
- React output escaping and a Content Security Policy protect rendered user content; no raw HTML rendering is used.
- File uploads are not supported by the current product. Any future upload endpoint must add explicit MIME allowlists, byte-size limits, randomized storage names, and content scanning before it is enabled.
- Database triggers, foreign keys, unique indexes, and checks reject invalid roles, states, prices, ratings, and session records.
- Security-sensitive mutations write structured audit records. Request failures are emitted as structured server logs without secrets or raw IP addresses.
- User-facing error boundaries return generic recovery messages; stack traces and database errors remain server-side.

## Checks

```bash
npm run check
```

This runs TypeScript, ESLint, the dependency security audit, and a production build.
