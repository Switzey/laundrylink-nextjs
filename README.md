# LaundryLink Next.js

The full-stack TypeScript edition of LaundryLink. It replaces the Laravel runtime with Next.js server components, server actions, cookie sessions, and Node's native SQLite driver.

## Requirements

- Node.js 24 or newer
- npm 11 or newer

## Run locally

```bash
npm install
npm run db:setup
npm run dev
```

Open `http://127.0.0.1:3000`.

The local SQLite database is stored at `data/laundrylink.sqlite` and is intentionally excluded from Git because it contains account data. The setup command creates a safe demo database when no local database exists. Set `DATABASE_PATH` to an absolute SQLite path when a different database should be used.

## Vercel deployment

Production uses Turso's managed SQLite-compatible database through `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Without those variables, the app uses the local database at `data/laundrylink.sqlite`.

To initialize an empty Turso database, run `npm run db:setup:turso`. The migration generates a fresh sanitized seed and refuses to upload a custom source containing accounts outside the documented `@example.com` demo allowlist.

## Demo accounts

All seeded demo accounts use the password `password`.

| Role | Email |
| --- | --- |
| Administrator | `admin@example.com` |
| Customer | `customer@example.com` |
| Cleaner | `cleaner@example.com` |

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Runtime architecture

- Next.js App Router and React server components
- TypeScript server actions for mutations
- Native `node:sqlite` parameterized queries
- Bcrypt-compatible authentication with HTTP-only cookie sessions
- Tailwind CSS 4 and the LaundryLink brand palette
