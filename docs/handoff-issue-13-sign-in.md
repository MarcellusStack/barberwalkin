# Handoff: Issue #13 — Build the Sign-In Screen

## Task

Implement issue #13 (`[T12] Build the sign-in screen`) end-to-end.
Spec source: `docs/blueprint.md` (route table, line 95) and GitHub issue #13.

Requirements (from issue):
- Accessible German email entry (Mantine `useForm`), anonymous-trial entry
- Loading states, retry states, generic auth errors (all in German)
- Standalone `SignInForm` component + `/sign-in` page
- Automated browser coverage at the highest practical seam
- Lint, typecheck, `test:browser` all green

## What's done (uncommitted, working tree)

### New files
| File | Purpose |
|---|---|
| `lib/auth-error-message.ts` | `translateAuthError()` extracted from `auth-probe.tsx`, now shared |
| `components/sign-in-form.tsx` | Standalone `SignInForm` using Mantine `useForm`; handles email→OTP send→verify→resend, anonymous sign-in, loading (`phase` state), German errors/success, signed-in view |
| `app/sign-in/page.tsx` | Server component page: German heading + `SignInForm` |
| `tests/browser/sign-in.spec.ts` | 5 Playwright tests: empty initial state, loading state (route-delay), retry after delivery error, anonymous positive path + reload + sign-out, anonymous error path |

### Modified files
| File | Change |
|---|---|
| `components/auth-probe.tsx` | Removed inline `translateAuthError` (~30 lines); now imports from `lib/auth-error-message.ts` |
| `tests/browser/auth-otp.spec.ts` | All `page.goto("/")` → `page.goto("/sign-in")`; replaced `Nicht angemeldet` / `Verifiziert` assertions with `Angemeldet als` / `Erfolgreich angemeldet!`; validation test no longer expects `Authentifizierungsfehler` for empty email (Mantine field-level error is correct) |

### Verification status
- `npm run lint` — **pass**
- `npm run typecheck` — **pass**
- `npx playwright test sign-in.spec` — **5/5 pass** (when run in isolation)
- `npx playwright test auth-otp.spec` — **8/9 pass** in isolation; the `validiert leere und ungültige E-Mail-Eingaben` test is flaky (intermittent)
- Full `npx playwright test` — **flaky**: 4–7 tests fail per run, but the failures rotate between runs

## Blocker: pre-existing flaky tests in `auth-integration.spec.ts`

`auth-integration.spec.ts` was **not modified** by this work. Three of its tests fail intermittently:

```
auth-integration.spec.ts:200  rendert Startseite im unauthentifizierten Zustand
auth-integration.spec.ts:220  durchläuft den positiven Pfad: Anonyme Anmeldung…
auth-integration.spec.ts:261  behandelt Fehlerpfad bei fehlgeschlagener anonymer Anmeldung…
```

Failure mode: `getByText('Authentifizierung & Backend-Status')` or `getByText('Nicht angemeldet')` times out (5 s). The dev log shows `[AUTH ROUTE] GET error: TypeError: fetch failed` around the same time.

**Diagnosis (not yet confirmed):** These tests hit the home page (`/`), which renders `AuthProbe`. `AuthProbe` calls `useQuery(api.auth.getCurrentUser)` and `useQuery(api.probe.getServerStatus)` via Convex. If the Convex test server isn't fully ready on first page load, the queries fail and the component doesn't render the expected text within 5 s. This is a **test-environment timing issue**, not a regression from the sign-in work.

**To confirm it's pre-existing:** `git stash && npx playwright test auth-integration.spec` on a clean tree. If it still fails, it's pre-existing.

## Remaining work before commit

1. **Remove debug instrumentation** from `tests/browser/sign-in.spec.ts` line 73 test (`RETRY-CASE`):
   - Delete `const responses: string[] = []`, the `page.on("response", …)` handler, both `console.log("DEBUG RESPONSES:", …)` calls, and `page.waitForTimeout(1500)`.
   - Restore the test title to something clean (currently `retry nach Zustellungsfehler RETRY-CASE: Formular und Button bleiben verfuegbar`).

2. **Diagnose the `auth-integration.spec.ts` flakiness** (see above). If pre-existing, note it in the commit message or leave a TODO. If caused by the `auth-probe.tsx` refactor (unlikely — only the error-translation function was extracted), revert and re-extract differently.

3. **Re-run full suite** until a clean pass:
   ```
   npx playwright test          # dev build
   npx playwright test --config=playwright.production.config.ts   # production build
   ```

4. **Code review** per the `implement` skill (call `/code-review`).

5. **Commit** to `main` with a message matching the repo style (German feature descriptions, `feat:` prefix).

## Environment notes

- Windows PowerShell 5.1; run npm via `cmd /c "npm run …"` to avoid execution-policy errors.
- Playwright `-g` filter does not work with non-ASCII test titles in this environment — use the full spec file name instead.
- Playwright config: `workers: 1`, dev server on port 3100, Convex test server on 3210/3211.
- A stale `next dev` process (PID varies) can block Playwright's web server; kill it if you see `Another next dev server is already running`.

## Suggested skills

| Skill | Why |
|---|---|
| `diagnosing-bugs` | Triage the `auth-integration.spec.ts` flaky failures — confirm pre-existing vs regression, find root cause |
| `code-review` | Review the full diff (sign-in form, page, extracted lib, spec changes) before committing, per the `implement` skill |
| `implement` | Primary skill for this task — already in use; re-invoke after fixing the debug-cleanup + flaky-test questions to run the final verification pass and commit |
