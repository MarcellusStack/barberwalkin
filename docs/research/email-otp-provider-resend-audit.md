# Research Report: Email Provider (Resend vs Better Auth Infrastructure) for BarberWalkin Email OTP

**Date:** 2026-08-28  
**Author:** Antigravity  
**Topic:** Investigation of Email Delivery Infrastructure, Better Auth Email OTP Plugin, and Resend Integration for BarberWalkin  
**Status:** Completed  

---

## 1. Executive Summary

This research report investigates the email delivery architecture for BarberWalkin's Email OTP authentication flow across **Better Auth (v1.6.15)**, **Convex Backend**, **Next.js App Router**, and **Resend**.

### Key Findings Matrix

| Dimension | Fact / Primary Source Finding | Architectural Implication for BarberWalkin |
| :--- | :--- | :--- |
| **Better Auth Hosted Email** | ❌ **Better Auth does NOT provide a hosted email server or SMTP relay.** It is strictly "Bring-Your-Own-Provider" (BYO-Provider). | BarberWalkin MUST integrate an external transactional email provider (Resend). |
| **Blueprint "Better Auth Infrastructure"** | Refers to Better Auth's plugin hook architecture (`emailOTP.sendVerificationOTP`) running within the backend auth infrastructure, not a managed SaaS email box. | The blueprint requirement is fulfilled by integrating Resend into Better Auth's hook running inside Convex HTTP actions. |
| **Execution Runtime** | Better Auth runs on the **Convex backend HTTP Actions runtime** (`convex/http.ts` via `authComponent.registerRoutes`). | External network requests (`fetch` to Resend API) execute inside Convex, NOT on the Next.js/Cloudflare client proxy. |
| **Resend Integration Strategy** | Native `fetch("https://api.resend.com/emails")` vs `resend` npm package. | Direct `fetch` in `lib/email-delivery.ts` provides zero runtime dependency overhead, universal compatibility across Convex & Cloudflare Workers, and seamless test isolation. |
| **Environment Variable Scope** | Convex has its own isolated environment variables set via `npx convex env set`. | `RESEND_API_KEY` and `EMAIL_FROM` must be configured in Convex (`npx convex env set RESEND_API_KEY ...`), not just in `.env.local`. |

---

## 2. Detailed Answers to Core Research Questions

### Question 1: Does Better Auth have its own built-in / hosted email sending server?
* **Primary Source:** [Better Auth Core Documentation](https://better-auth.com/docs/concepts/email) & [Better Auth Plugins: Email OTP](https://better-auth.com/docs/plugins/email-otp)
* **Finding:**
  Better Auth is a headless/self-hosted authentication framework. Unlike hosted SaaS platforms (such as Clerk or Supabase managed tier), **Better Auth does NOT host SMTP servers, MTA relays, or email-sending IP pools**.
  - All email features (e.g., `emailOTP`, `emailVerification`, `forgetPassword`) require defining a callback hook (e.g. `sendVerificationOTP({ email, otp, type })`).
  - If no email provider is wired inside `sendVerificationOTP`, Better Auth cannot deliver emails.

### Question 2: What did the project blueprint mean by "Better Auth Infrastructure email"?
* **Primary Source:** [docs/blueprint.md:L74-L77](file:///c:/Users/Pohl/Documents/Github/barberwalkin/docs/blueprint.md#L74-L77) & [docs/blueprint.md:L321](file:///c:/Users/Pohl/Documents/Github/barberwalkin/docs/blueprint.md#L321)
* **Finding:**
  - The blueprint specifies: *"The launch sender is Better Auth Infrastructure email. Development and production must exercise the real email path; a production domain and sender configuration are required before launch."*
  - This phrasing was written from a high-level perspective to distinguish authentication-related transactional emails (managed by the Better Auth backend lifecycle) from separate product marketing or customer notification emails.
  - In technical terms, "Better Auth Infrastructure email" means the **Better Auth `emailOTP` lifecycle handler configured in Convex, backed by a production transactional email service (Resend)**.

### Question 3: How does Resend integrate with Better Auth and Convex HTTP actions / Next.js?
* **Primary Sources:**
  - [Resend Better Auth Guide](https://resend.com/docs/send-with-better-auth#send-one-time-codes-optional)
  - [Convex HTTP Actions](https://docs.convex.dev/functions/http-actions)
  - `@convex-dev/better-auth` router implementation (`createClient.registerRoutes`)
* **Finding:**
  1. **Request Flow:**
     - User requests OTP on the frontend -> calls `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })`.
     - Next.js route `app/api/auth/[...all]/route.ts` proxies the request via `convexBetterAuthNextJs` to Convex HTTP endpoint (`NEXT_PUBLIC_CONVEX_SITE_URL/api/auth/email-otp/send-verification-otp`).
     - Convex router (`convex/http.ts`) routes the request to Better Auth's handler running inside a Convex HTTP Action.
     - Better Auth generates a cryptographically secure 6-digit OTP and invokes `sendVerificationOTP({ email, otp, type })` in `convex/betterAuth/auth.ts`.
     - `sendVerificationOTP` delegates to `deliverEmailOtp` in `lib/email-delivery.ts`.
  2. **Convex Runtime Compatibility:**
     - Convex HTTP actions run with full Web Standard Fetch API support.
     - `fetch("https://api.resend.com/emails")` works natively without extra configuration or native Node.js binaries.
     - Using native `fetch` avoids adding unnecessary npm dependencies and guarantees compatibility across both the Convex backend and Cloudflare Workers (OpenNext).

### Question 4: What environment variables and domain setup are needed for Resend?
* **Primary Source:** [Resend Domains Documentation](https://resend.com/docs/dashboard/domains) & [Resend API Reference](https://resend.com/docs/api-reference/emails/send-email)
* **Finding:**

#### A. Resend Account & Domain Verification Setup
1. **Sandbox / Development (`onboarding@resend.dev`):**
   - Free tier default.
   - Can send immediately with `RESEND_API_KEY` without DNS setup.
   - **Limitation:** Can only deliver emails to the email address registered with the Resend account.
2. **Production (`barberwalkin.de`):**
   - Add domain `barberwalkin.de` in Resend Dashboard -> Domains.
   - Configure DNS records at the domain registrar / DNS provider (e.g. Cloudflare DNS):
     - **DKIM:** TXT / CNAME record for `resend._domainkey.barberwalkin.de` (cryptographic sender signature).
     - **SPF:** TXT / MX record for `bounces.barberwalkin.de` (authorizes Resend mail servers).
     - **DMARC:** TXT record for `_dmarc.barberwalkin.de` (`v=DMARC1; p=none;`).
   - Once verified in Resend, any address like `BarberWalkin <auth@barberwalkin.de>` or `noreply@barberwalkin.de` can send to all recipients worldwide.

#### B. Required Environment Variables
* `RESEND_API_KEY`: Resend API key starting with `re_...`.
* `EMAIL_FROM`: Sender string, e.g. `"BarberWalkin <auth@barberwalkin.de>"` (production) or `"BarberWalkin <onboarding@resend.dev>"` (sandbox dev).

#### C. Setting Environment Variables across Runtimes
* **Convex Deployment (Crucial!):**
  Because the auth handler and `deliverEmailOtp` execute on Convex, these secrets MUST be configured in Convex:
  ```bash
  # Local / Dev Convex deployment:
  npx convex env set RESEND_API_KEY re_dev_123456789
  npx convex env set EMAIL_FROM "BarberWalkin <onboarding@resend.dev>"

  # Production Convex deployment:
  npx convex env set RESEND_API_KEY re_prod_987654321 --prod
  npx convex env set EMAIL_FROM "BarberWalkin <auth@barberwalkin.de>" --prod
  ```
* **Next.js (`.env.local` / Cloudflare Workers):**
  - Next.js acts as a thin proxy for auth requests, but keeping `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local` is recommended for local utility scripts and direct server actions.

---

## 3. Recommended Code Architecture for `lib/email-delivery.ts`

The email delivery module should maintain dual-mode support:
1. **Live Resend Delivery** when `process.env.RESEND_API_KEY` is provided.
2. **Deterministic In-Memory Delivery** when in test mode (`NODE_ENV === "test"` or `!process.env.RESEND_API_KEY`), preserving the existing Playwright E2E test suite without flaky external network calls.
