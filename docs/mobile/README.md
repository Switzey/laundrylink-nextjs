# LaundryLink Mobile Migration — Starting Point

**Status:** Architecture and bootstrap plan. Not a production deployment.

This folder is the entry point for building a native React Native/Expo client while preserving the existing Next.js website, backend, Turso/libSQL database and admin operations.

## Read in order

1. [Reuse audit](./reuse-audit.md) — what is confirmed reusable, what requires extraction, and the remaining production risks.
2. [Architecture](./architecture.md) — mobile clients, Next.js JSON API, shared application services, sessions, jobs and data model.
3. [API contract v1](./api-contract-v1.md) — proposed versioned HTTP contract and implementation gates.
4. [Delivery checklist](./delivery-checklist.md) — order of work and measurable acceptance criteria.

## Start Expo locally

Use Node.js 24.x for the **existing Next.js repository**, matching `package.json`. Expo's generator requires an appropriate supported Node LTS release.

From the repository root:

```bash
node scripts/bootstrap-expo-mobile.mjs
cd apps/mobile
npx expo install expo-secure-store expo-auth-session expo-web-browser expo-linking
npx expo start
```

The bootstrap script creates `apps/mobile` using the official `create-expo-app` generator. It refuses to overwrite an existing mobile directory. It does **not** connect to production, generate credentials, apply migrations, or deploy.

The generator's Expo SDK template and native developer build support should be reviewed before release. The default project includes Expo Router and TypeScript. For development on physical devices, check Expo Go compatibility; native features may require a custom development build.

After generation configure an application scheme (e.g. `laundrylink`), Android package identifier, iOS bundle identifier, `EXPO_PUBLIC_API_BASE_URL` for your staging API, and route guards. **Never** store database URLs, payment secret keys, Twilio tokens or other backend credentials in Expo client variables; `EXPO_PUBLIC_` values are visible in shipped bundles.

## Source control safety

Implement on a reviewed feature branch. Do not replace, reinitialize or migrate the existing Turso production database as part of Expo setup. The live Next.js web experience must continue working during the transition. Never merge or deploy an unreviewed migration or payment integration.
