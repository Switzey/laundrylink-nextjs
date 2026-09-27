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

Vercel deployments copy the safe demo database to the function's writable `/tmp` directory. This keeps login and mutation flows usable for previews, but data created on Vercel is temporary and can reset when a function instance is recycled. Use a managed database before accepting production customer data.

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
