# BarberWalkin — Unified Architecture Blueprint (MVP)

## Product Snapshot

BarberWalkin is a real-time queue and chair management application designed for walk-in barbershops.

- **Barbers & Owners:** Sign in via email magic code or instant guest session, complete onboarding, and manage active chairs and the customer queue in real time.
- **Customers (No Auth):** Visit a public shop slug route (`/{shopSlug}`) to view live waiting counts and chair availability without creating an account or logging in.
- **Monetization:** Tiered billing via Polar controls active chair visibility limits, grace periods, and access to advanced analytics.

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js (App Router, React 19) | Client UI shell and server routes |
| **Backend & Realtime** | Convex (`convex/react`) | Reactive real-time document database, file storage, and server mutations |
| **Authentication** | [Better Auth (Convex Integration)](https://better-auth.com/docs/integrations/convex) (`better-auth`, `@better-auth/convex`) | Email magic codes and anonymous guest sessions with upgrade paths |
| **UI Primitives** | Mantine UI + Mantine Form | Border-first components and form state with Zod validation |
| **Motion** | Motion (`motion/react`) | Spring-based layout and queue entry/exit transitions |
| **3D Preview** | Three.js + React Three Fiber + Drei | Single-chair 3D visual preview modal |
| **Billing** | Polar (`@polar-sh/sdk`) | Subscriptions, customer portal, grace periods, and webhooks |
| **Analytics** | PostHog | User interactions, client funnels, and error monitoring |
| **Deployment** | OpenNext on Cloudflare Workers | Edge execution without external cache bindings |

---

## Documentation & LLM Resources (`llms.txt`)

Curated references and LLM-friendly documentation endpoints for development and AI assistance:

| Library / Service | LLM Resource (`llms.txt`) | Documentation Reference |
| :--- | :--- | :--- |
| **Better Auth** | [`https://better-auth.com/llms.txt`](https://better-auth.com/llms.txt) | [Convex Integration Guide](https://better-auth.com/docs/integrations/convex) |
| **Next.js** | [`https://nextjs.org/docs/llms.txt`](https://nextjs.org/docs/llms.txt) | [Next.js Documentation](https://nextjs.org/docs) |
| **Convex** | [`https://docs.convex.dev/llms.txt`](https://docs.convex.dev/llms.txt) | [Convex Documentation](https://docs.convex.dev) |
| **Polar** | [`https://polar.sh/docs/llms.txt`](https://polar.sh/docs/llms.txt) | [Polar Documentation](https://polar.sh/docs) |
| **Mantine** | [`https://mantine.dev/llms.txt`](https://mantine.dev/llms.txt) | [Mantine Documentation](https://mantine.dev) |
| **Zod** | [`https://zod.dev/llms.txt`](https://zod.dev/llms.txt) | [Zod Documentation](https://zod.dev) |
| **PostHog** | [`https://posthog.com/llms.txt`](https://posthog.com/llms.txt) | [PostHog Documentation](https://posthog.com/docs) |

---

## Route Map & Access

| Route | Access | Purpose |
| :--- | :--- | :--- |
| `/` | Public | Marketing landing page and core value proposition. |
| `/sign-in` | Public | Email magic code and guest sign-in. |
| `/onboarding` | Authenticated | 3-step setup: profile, shop slug/name, initial chair configuration. |
| `/dashboard` | Owner | Real-time queue and chair operation controls. |
| `/seats` | Owner | Chair CRUD, color customization, and 3D preview. |
| `/analytics` | Owner | KPI cards and trend charts (advanced metrics plan-gated). |
| `/settings` | Owner | Profile (guest upgrade), shop logo/info, and Polar billing portal. |
| `/{shopSlug}` | Public | Real-time customer view of queue length and seat availability. |
| `/api/webhook/polar` | Webhook | Polar subscription status sync and plan updates. |

---

## Data Model (Example Convex Schema)

```typescript
// convex/schema.ts (Example Schema Representation)
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Better Auth user and session tables are managed via the Better Auth Convex adapter

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    isGuest: v.boolean(),
    polarCustomerId: v.optional(v.string()),
    subscriptionTier: v.optional(v.string()), // "free" | "pro" | "premium"
    subscriptionStatus: v.optional(v.string()), // "active" | "canceled" | "past_due" | "revoked"
    cancelAt: v.optional(v.number()), // Unix ms
    gracePeriodEnd: v.optional(v.number()), // Unix ms for lapsed subscription access
  }).index("by_email", ["email"]),

  shops: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    owners: v.array(v.id("users")), // Supports multi-owner / guest links
    logoStorageId: v.optional(v.id("_storage")), // Convex built-in file storage
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["active"]),

  seats: defineTable({
    shopId: v.id("shops"),
    label: v.string(),
    color: v.string(),
    active: v.boolean(),
    available: v.boolean(),
    order: v.optional(v.number()),
  }).index("by_shop", ["shopId"]),

  visits: defineTable({
    shopId: v.id("shops"),
    seatId: v.optional(v.id("seats")), // Retained after seat deletion for analytics
    customerName: v.optional(v.string()),
    status: v.union(
      v.literal("waiting"),
      v.literal("in_service"),
      v.literal("completed"),
      v.literal("left")
    ),
    queuePosition: v.optional(v.number()),
    enteredAt: v.number(), // Indexed for 7d/30d/90d analytics
    seatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
  })
    .index("by_shop_status", ["shopId", "status"])
    .index("by_shop_entered", ["shopId", "enteredAt"]),
});
```

---

## Core Operations & Business Rules

### Public Live Subscriptions
Public queries for `/{shopSlug}` stream shop metadata, active seats, and waiting counts directly to unauthenticated clients. If a shop is marked `active: false`, the query returns a closed shop fallback.

### Queue Lifecycle
- **Add:** Creates a visit with `status: "waiting"` and records `enteredAt`.
- **Seat:** Updates visit to `status: "in_service"`, sets `seatId` and `seatedAt`, and toggles the seat's `available` field to `false`.
- **Complete:** Updates visit to `status: "completed"`, sets `completedAt`, and resets the seat's `available` field to `true`.
- **Leave:** Marks visit as `status: "left"` and sets `leftAt`.

### Relationship & Deletion Semantics
- Deleting a shop cascades to delete all linked seats and visits in a single mutation.
- Deleting a seat unlinks it from active views but preserves historical `visits` records with `seatId` for accurate analytics.

### Plan & Grace Period Enforcement
- Free plan caps visible active chairs (e.g., maximum 2).
- Accounts in `gracePeriodEnd` retain full features until the timestamp expires.

### Guest Upgrade Flow
- Guest accounts attempting to start Polar checkout or manage billing are prompted to link an email address first.

---

## Theme & UI Direction

- **Design Inspiration:** Minimalist, clean, high-contrast, border-based interface inspired by Vercel and ChatGPT.
- **Surfaces & Layout:** Flat surfaces utilizing Mantine `Paper` with `withBorder` and `shadow="none"`.
- **Typography:** Geist Sans for body/headings (`fontWeight: 600`) and Geist Mono for timestamps, IDs, and tabular figures.
- **Status Colors:**
  - **Available / Free:** `green`
  - **Occupied / In-Service / Destructive:** `red`
  - **Upgrade / Plan Limits / Notices:** `orange`
- **Micro-Interactions:** Subtle spring animations via `motion/react` (`stiffness: 300-500`, `damping: 30`) for queue transitions and modal entries.

---

## Deployment Architecture

- **Host:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`).
- **Caching Strategy:** Zero KV, R2, or D1 cache bindings required; all dynamic real-time state and invalidation are handled directly via Convex client subscriptions.