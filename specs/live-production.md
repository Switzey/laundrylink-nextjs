# LaundryLink Live Production Test Plan

## Safety contract

- Target only `https://www.laundrylink.com.ng`.
- Use dedicated QA accounts supplied through `E2E_LIVE_*` secrets.
- Do not use real payment instruments.
- Do not approve, suspend, delete, publish, or edit real production records.
- Do not submit orders by default.
- Email delivery and account creation require separate explicit opt-in flags and sandbox inboxes.
- SMS verification requires a provider sandbox or test number and is not enabled by the read-only suite.

## Public and responsive coverage

1. Render home, cleaner search, login, registration, and password recovery on desktop and mobile.
2. Assert HTTP success, primary heading visibility, no horizontal overflow, no console errors, and no page errors.
3. Discover same-origin links and report responses at or above HTTP 400.
4. Search for a cleaner, open its profile, select a service, and preserve checkout intent through the login redirect.
5. Validate required fields without submitting production data.

## Security and API coverage

1. Verify anonymous users cannot access customer, vendor, or admin dashboards.
2. Opt in to one invalid-login test when production rate-limit impact is acceptable.
3. Verify Google and Apple controls reach their provider authorization services.
4. Check HSTS, CSP, frame protection, MIME sniffing protection, and referrer policy.
5. Verify `/api/health` returns JSON success.
6. Verify unknown API routes do not expose stack traces.

## Accessibility coverage

1. Run axe WCAG A/AA scans on each public page in desktop and mobile projects.
2. Fail on serious and critical automated violations.
3. Attach the full axe result JSON to the Playwright result.
4. Supplement automation with manual keyboard and screen-reader testing before release.

## Credential-gated coverage

1. Customer: login, secure cookie, dashboard, profile, order tracking, admin denial, and non-submitted checkout preparation.
2. Vendor: login, vendor workspace, onboarding state, and admin denial.
3. Admin: login and read-only review of the administration dashboard.
4. Registration and password recovery: run only with disposable/sandbox inboxes and explicit opt-in flags.

## Intentionally excluded from production automation

- Real payments.
- Automatic order submission.
- Vendor approval or suspension.
- Profile, service, payout, or document mutations.
- Review deletion.
- Account deletion.
- Production email or SMS delivery without sandbox routing.
