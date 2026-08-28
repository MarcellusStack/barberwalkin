# Research Report: Better Auth & Convex Integration Audit

**Date:** 2026-08-27  
**Author:** Antigravity  
**Topic:** Audit of Better Auth + Convex integration against official docs and primary sources  
**Status:** Completed  

---

## 1. Executive Summary

This research report audits the Better Auth and Convex integration in `barberwalkin` by cross-referencing the local implementation files against the official documentation from:
- [Better Auth Convex Integration Docs](https://better-auth.com/docs/integrations/convex) (`https://better-auth.com/llms.txt/docs/integrations/convex.md`)
- [Better Auth Core LLMs Index](https://better-auth.com/llms.txt)
- [Convex Documentation Index](https://docs.convex.dev/llms.txt)
- Project specification: [docs/blueprint.md](file:///c:/Users/Pohl/Documents/Github/barberwalkin/docs/blueprint.md)

### Verification Summary Matrix

| Integration Aspect | Doc Standard | Codebase Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Auth Config Provider** | `getAuthConfigProvider()` in `convex/auth.config.ts` | [convex/auth.config.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/auth.config.ts) | ✅ **Compliant** |
| **Component Definition** | `defineComponent("betterAuth")` | [convex/betterAuth/convex.config.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/convex.config.ts) | ✅ **Compliant** |
| **App Registration** | `app.use(betterAuth)` in `convex/convex.config.ts` | [convex/convex.config.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/convex.config.ts) | ✅ **Compliant** |
| **Adapter Functions** | `createApi(schema, createAuthOptions)` | [convex/betterAuth/adapter.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/adapter.ts) | ✅ **Compliant** |
| **HTTP Routes** | `authComponent.registerRoutes(http, createAuth)` | [convex/http.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/http.ts) | ✅ **Compliant** |
| **Next.js Proxy Handler** | `convexBetterAuthNextJs` route handler | [app/api/auth/[...all]/route.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/app/api/auth/[...all]/route.ts) & [lib/auth-server.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/lib/auth-server.ts) | ✅ **Compliant** |
| **Client Provider** | `ConvexBetterAuthProvider` with `initialToken` | [providers/convex-client-provider.tsx](file:///c:/Users/Pohl/Documents/Github/barberwalkin/providers/convex-client-provider.tsx) & [app/layout.tsx](file:///c:/Users/Pohl/Documents/Github/barberwalkin/app/layout.tsx) | ✅ **Compliant** |
| **Secret Management** | Strictly set via `npx convex env set BETTER_AUTH_SECRET` | [convex/betterAuth/auth.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/auth.ts#L28-L30) | ⚠️ **Suspicious (Hardcoded Fallback)** |
| **Plugin Configuration** | Server options & client plugins must match schema/flow | [convex/betterAuth/auth.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/auth.ts#L32) vs [schema.ts](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/schema.ts) | ⚠️ **Suspicious (Omitted Plugins)** |
| **Version Compatibility** | Peer dependency range `<= 1.6.x` with `@convex-dev/better-auth` | [package.json](file:///c:/Users/Pohl/Documents/Github/barberwalkin/package.json#L15-L30) | ℹ️ **Intentional & Protected** |

---

## 2. Detailed Findings & Suspicious Items

### ⚠️ Finding 1: Insecure Hardcoded Fallback Secret in Convex Runtime
* **Primary Source:** Better Auth Convex Integration Guide (Step 3: "Set environment variables") & Convex Security Guidelines:
  > *"Since the Better Auth instance runs on Convex, environment variables used by the auth instance should be configured through the Convex CLI or dashboard, not in `.env.local`."*
* **Code Location:** [convex/betterAuth/auth.ts:L28-L30](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/auth.ts#L28-L30)
  ```ts
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "development-secret-barberwalkin-32ch",
  ```
* **Why it's suspicious:**
  - Convex cloud deployments do not inherit host machine environment variables.
  - If `BETTER_AUTH_SECRET` is not set on the Convex deployment via `npx convex env set BETTER_AUTH_SECRET ...`, Better Auth will **silently fall back** to the hardcoded string `"development-secret-barberwalkin-32ch"`.
  - An attacker could forge or tamper with session signatures, password reset hashes, and state parameters if this fallback is used in any deployed environment.
* **Recommendation:**
  In `convex/betterAuth/auth.ts`, fail loudly if `BETTER_AUTH_SECRET` is missing when not running in local test mode, or ensure deployment scripts strictly enforce `npx convex env set BETTER_AUTH_SECRET`.

---

### ⚠️ Finding 2: Missing Plugins in Server Options vs `schema.ts` & Project Blueprint
* **Primary Source:** Better Auth Integration Docs ([convex.md](https://better-auth.com/llms.txt/docs/integrations/convex.md)), Better Auth Plugins ([plugins.md](https://better-auth.com/llms.txt/docs/plugins.md)), and [docs/blueprint.md:L60-L72](file:///c:/Users/Pohl/Documents/Github/barberwalkin/docs/blueprint.md#L60-L72):
  > *"Authentication uses Better Auth through the Convex integration. Anonymous authentication creates a real authenticated user and Trial Shop... Email OTP is the only production sign-in and account-recovery method."*
* **Code Location:**
  - [convex/betterAuth/auth.ts:L21-L34](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/auth.ts#L21-L34):
    ```ts
    export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
      return {
        appName: "BarberWalkin",
        baseURL: process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        secret: process.env.BETTER_AUTH_SECRET || "development-secret-barberwalkin-32ch",
        database: authComponent.adapter(ctx),
        plugins: [convex({ authConfig })],
      } satisfies BetterAuthOptions;
    };
    ```
  - [convex/betterAuth/schema.ts:L12-L13](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/betterAuth/schema.ts#L12-L13):
    ```ts
    isAnonymous: v.optional(v.union(v.null(), v.boolean())),
    userId: v.optional(v.union(v.null(), v.string())),
    ```
  - [lib/auth-client.ts:L4-L10](file:///c:/Users/Pohl/Documents/Github/barberwalkin/lib/auth-client.ts#L4-L10):
    ```ts
    export const authClient = createAuthClient({
      baseURL: ...,
      plugins: [convexClient()],
    });
    ```
* **Why it's suspicious:**
  - The schema already contains the table fields generated for the `anonymous` plugin (`isAnonymous`, `userId`), but `convex/betterAuth/auth.ts` does not include `anonymous()` in its `plugins` list.
  - If `npx auth generate` is executed, it will remove `isAnonymous` from `schema.ts` because `auth.ts` does not declare the `anonymous()` plugin.
  - When the frontend attempts to call `authClient.signIn.anonymous()` or email OTP authentication, Better Auth will fail with endpoint not found / `UNKNOWN_ACTION` unless:
    1. The plugin is added to `createAuthOptions` in `convex/betterAuth/auth.ts` (`plugins: [convex({ authConfig }), anonymous(), emailOTP(...)]`).
    2. The corresponding client plugin is added to `lib/auth-client.ts` (`plugins: [convexClient(), anonymousClient()]`).

---

### ⚠️ Finding 3: `baseURL` Resolution in `lib/auth-client.ts`
* **Primary Source:** Better Auth Client Concepts ([client.md](https://better-auth.com/llms.txt/docs/concepts/client.md)) & Next.js Integration Guide ([next.md](https://better-auth.com/llms.txt/docs/integrations/next.md)):
  > *"When `createAuthClient` runs in the browser, `baseURL` automatically resolves to `window.location.origin` if omitted."*
* **Code Location:** [lib/auth-client.ts:L4-L8](file:///c:/Users/Pohl/Documents/Github/barberwalkin/lib/auth-client.ts#L4-L8)
  ```ts
  export const authClient = createAuthClient({
    baseURL:
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    plugins: [convexClient()],
  });
  ```
* **Why it's suspicious:**
  - If `NEXT_PUBLIC_SITE_URL` contains a trailing slash (e.g. `https://example.com/`), `createAuthClient` can construct double slashes in API calls (e.g. `https://example.com//api/auth/sign-in`).
  - The official doc example for Next.js Convex integration leaves `baseURL` unset on the client:
    ```ts
    export const authClient = createAuthClient({
      plugins: [convexClient()],
    });
    ```
  - In browser contexts, omitting `baseURL` ensures that client fetches always hit the same origin (`/api/auth/[...all]`), which is properly intercepted by the Next.js App Router route handler and proxied to Convex.

---

### ℹ️ Finding 4: Better Auth 1.6 vs 1.7 Version Pinning
* **Primary Source:** [docs/blueprint.md:L78-L88](file:///c:/Users/Pohl/Documents/Github/barberwalkin/docs/blueprint.md#L78-L88) & Better Auth 1.7 Upgrade Guide ([1-7-upgrade-guide.md](https://better-auth.com/llms.txt/docs/guides/1-7-upgrade-guide.md))
* **Current Status:**
  - `package.json` pins `"better-auth": "~1.6.15"` and `"@convex-dev/better-auth": "^0.12.5"`.
  - `@convex-dev/better-auth@0.12.5` has a strict peer dependency `better-auth: ">=1.6.11 <1.7.0"`.
* **Verdict:**
  - This is **intentional and correct**. Attempting to upgrade `better-auth` to 1.7.x before `@convex-dev/better-auth` publishes an update supporting 1.7 adapter breaking changes will break type generation and runtime query resolution.

---

### 💡 Finding 5: `getCurrentUser` (JWT Identity) vs `getAuthUser` (Convex DB Document)
* **Primary Source:** Convex Auth Functions ([functions-auth.md](https://docs.convex.dev/llms.txt)) & Better Auth safeGetAuthUser API
* **Code Location:** [convex/auth.ts:L4-L16](file:///c:/Users/Pohl/Documents/Github/barberwalkin/convex/auth.ts#L4-L16)
  ```ts
  export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
      return await ctx.auth.getUserIdentity();
    },
  });

  export const getAuthUser = query({
    args: {},
    handler: async (ctx) => {
      return await authComponent.safeGetAuthUser(ctx);
    },
  });
  ```
* **Context:**
  - `ctx.auth.getUserIdentity()` decodes the JWT issued by Better Auth (`tokenIdentifier`, `subject`, `name`, `email`). It does NOT query the database.
  - `authComponent.safeGetAuthUser(ctx)` queries the `user` table inside the Better Auth Convex component and returns the actual record.
  - For quick UI header status, `getCurrentUser` is faster (no DB read). For database operations, mutations, or verifying `isAnonymous` database state, `getAuthUser` or `authComponent.getAuthUser(ctx)` should be used.

---

## 3. Status & Action Taken

1. [x] **Updated `convex/betterAuth/auth.ts`:**
   - Removed the hardcoded development secret fallback (`|| "development-secret-barberwalkin-32ch"`). Missing `BETTER_AUTH_SECRET` now fails immediately.
2. [ ] **Plugins (`anonymous`, `emailOTP`):**
   - Scheduled for Issue #6 and Issue #7.
3. [x] **Updated `lib/auth-client.ts`:**
   - Removed redundant manual `baseURL` override in `createAuthClient` to match official Better Auth Next.js Convex integration docs.
4. [x] **Version Pinning (Better Auth 1.6.15 vs 1.7):**
   - Confirmed bounded spike status: `@convex-dev/better-auth@0.12.5` requires `<1.7.0` due to adapter API breaks in 1.7.0. Sticking to `~1.6.15` until Convex updates `@convex-dev/better-auth`.
