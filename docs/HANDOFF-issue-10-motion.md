# Handoff: Issue #10 — Integrate Motion with reduced-motion behavior

Repo: `MarcellusStack/barberwalkin`
Issue: https://github.com/MarcellusStack/barberwalkin/issues/10 (label `ready-for-agent`, parent #1, blocked by #4 [done], blocks #12)
Working branch: `main` (clean baseline commit `7fd8367`). Changes below are uncommitted.

## Status: implementation complete and green; NOT yet committed. Full suite + production build + /code-review remain.

The user's instruction for this session: "please provide a handoff, don't write any code anymore." So the code is done as far as it should go; the next agent should finish verification + review + commit. No further code changes are expected unless verification surfaces a real defect.

## What was implemented (uncommitted diff)

Scope: "Add one lazy, subtle Motion transition and prove deterministic reduced-motion behavior without making application state depend on animation." German UI (see `CONTEXT.md` glossary, `docs/blueprint.md` line 311-312: motion limited to subtle Queue/modal transitions; reduced-motion support is a required accessibility baseline).

1. `components/motion-reveal.tsx` (new, "use client"):
   - A `MotionReveal({children})` wrapper using `motion` + `useReducedMotion` from `motion/react`.
   - Reads `prefers-reduced-motion` via `useReducedMotion()`. `reduce = prefersReducedMotion === true` (treats `null` as "do not reduce", safe on first render/hydration).
   - `reduce` → `initial === animate` (`{opacity:1, y:0}`) + `transition duration:0` → no visible motion.
   - `!reduce` → `initial {opacity:0, y:8}`, `animate {opacity:1, y:0}`, `transition {duration:0.25, ease:"easeOut"}` → subtle fade+rise.
   - Exposes test hooks: `data-motion-reveal=""` and `data-reduced-motion="true"|"false"`.
   - Application state (the sign-in form / Mantine form values) is independent of animation: the reveal is purely presentational; a user with reduced motion still gets the same functional UI, just without the transition.

2. `components/sign-in-form.tsx` (modified):
   - Import `MotionReveal`.
   - Wrapped the OTP `TextInput` block (rendered only when `otpSent`) in `<MotionReveal>`. This is the single subtle transition: the "Bestätigungscode" field lazily appears after the user requests a code. No logic/state changed.

3. `tests/browser/motion-reduced-motion.spec.ts` (new): two Playwright tests at the highest practical seam (browser e2e, matching repo convention in `tests/browser/*`):
   - Non-reduced: OTP field is absent before submit, present after; `data-reduced-motion="false"`; `opacity:1`.
   - Reduced (`page.emulateMedia({ reducedMotion: "reduce" })`): same visibility, but `data-reduced-motion="true"`; `opacity:1` — proving deterministic reduced-motion behavior.
   - Both fulfill the OTP send route at the network layer (see "Critical pre-existing gotcha" below) so the Motion assertion is decoupled from a flaky dev auth endpoint. This route-fulfill pattern already exists in the repo (`tests/browser/sign-in.spec.ts` line ~59).

## Verification done this session

- `npm run typecheck` (tsc --noEmit): exit 0.
- `npm run lint` (eslint .): exit 0.
- Single spec: `npx playwright test tests/browser/motion-reduced-motion.spec.ts` → 2 passed.
  - NOTE: on Windows PowerShell 5.1, `npm`/`npx` `.ps1` shims are blocked by execution policy. Use `npm.cmd run …` / `npx.cmd …` (or `npm.cmd run test:browser`). `Tee-Object` to a log file is handy for capturing output.

## Still to do (ordered)

1. Run the full dev browser suite once: `npm.cmd run test:browser`. Expect: motion-reduced-motion spec passes (2). The ONLY expected failure is the PRE-EXISTING flaky test below — do not attribute it to this change.
2. Prove production-build compatibility (explicit acceptance criterion: "integration tickets also prove development and production-build compatibility"): `npm.cmd run test:browser:production` (runs `next build` then the production Playwright config). The motion spec should also pass against the production build.
3. (Recommended) Run the two specs again back-to-back / `--repeat-each 3` to confirm determinism.
4. `code-review` skill on the working-tree diff (see Suggested skills).
5. Commit to `main` (user explicitly wants a commit). Suggested message:
   `feat: integrate Motion transition with reduced-motion support (#10)`
   Stage only the 3 files: `components/motion-reveal.tsx`, `components/sign-in-form.tsx`, `tests/browser/motion-reduced-motion.spec.ts`. Do NOT commit `.env.local` or any secrets. Do NOT close the GitHub issue (per repo `docs/implement-example.md` guidance, only close after integration + all checks green — and only if the user asked; user asked to commit, not to close).

## Critical pre-existing gotcha (do NOT "fix" — out of scope for #10)

The auth e2e OTP flow is flaky in the dev server: the POST to `/api/auth/email-otp/send-verification-otp` returns **404 from the Next dev server** on roughly the 2nd browser-initiated send within a single dev-server session (route handler at `app/api/auth/[...all]/route.ts` + `lib/auth-server.ts` `convexBetterAuthNextJs`). Symptoms: "Bestätigungscode konnte nicht gesendet werden." fallback.

Proven pre-existing (not caused by Motion):
- Stashed all Motion changes (`git stash push -u …`), ran `tests/browser/auth-otp.spec.ts` on the clean baseline → the "positive path" test (line ~68) still failed identically; 8/9 passed.
- A controlled 2-test probe confirmed the 2nd send 404s even when the second test uses `reducedMotion: "no-preference"`.

This is why the motion spec fulfills the OTP-send route rather than relying on the real endpoint. If the next agent wants, this flaky auth e2e could become its own ticket — but do not mix it into #10. (The dev auth `BETTER_AUTH_SECRET` lives in `playwright.config.ts` env — it is a throwaway dev secret; do not echo it into docs/commits.)

## Suggested skills

- `code-review` — review the working-tree diff (fixed point: `HEAD` / `main` at `7fd8367`) along Standards + Spec axes before committing. This is the explicit next step in the `implement` flow.
- (optional) `triage` — if the pre-existing flaky auth e2e is to be reported as its own issue with a proper label from `docs/agents/triage-labels.md`.
- `implement` — the current skill driving this work; resume its tail (full suite → code-review → commit) rather than starting fresh.

## Key file references

- New: `components/motion-reveal.tsx`, `tests/browser/motion-reduced-motion.spec.ts`
- Modified: `components/sign-in-form.tsx` (import + OTP-field wrap)
- Conventions/context: `CONTEXT.md` (German domain glossary), `docs/blueprint.md` (Interface Direction, line ~311-312), `tests/browser/sign-in.spec.ts` (route-fulfill + German assertion style), `playwright.config.ts` (dev webServer) / `playwright.production.config.ts` (prod).
- Motion API: installed `motion@13.1.1` → `import { motion, useReducedMotion } from "motion/react"`. `useReducedMotion()` reads `matchMedia("(prefers-reduced-motion)")` synchronously (verified in `node_modules/framer-motion/dist/framer-motion.js`); returns `true`/`false`/`null`. Docs: https://motion.dev/docs/react
