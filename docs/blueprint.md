# BarberWalkin Architecture Blueprint

## Product Goal

BarberWalkin is a German-language, real-time walk-in Queue and Chair management application for barbershops.

The launch MVP must prove three things:

1. a Shop can run its daily walk-in operation with BarberWalkin;
2. Customers use the public Shop page before visiting;
3. Shops will pay to continue using it.

The product has one shared FIFO Queue per Shop. Customers do not authenticate or join remotely. A Shop Admin records Visits and operates the Queue; Customers use the public page only to observe current availability.

Canonical domain language lives in [`../CONTEXT.md`](../CONTEXT.md).

## Delivery Milestones

### Development build

- Anonymous Trial Shop.
- Two-step onboarding.
- Shop and Chair configuration.
- Custom Three.js Chair preview.
- Complete Queue and Visit workflow.
- Authenticated preview of the public page.
- Operational Analytics.
- Development-only fake billing check; no real payment integration.

### Launch MVP

- Email OTP sign-in and anonymous-account upgrade.
- Explicit Shop publication.
- Free and Pro entitlements.
- Polar checkout, webhooks, grace period, and customer portal.
- PostHog Product Analytics.
- Production retention and deletion jobs.
- OpenNext deployment on Cloudflare Workers.

Launch validation succeeds provisionally when three real Shops each operate for 14 days and record at least 100 Visits, their public pages receive real traffic, and at least two Shops make a real payment through Polar.

## Actors and Ownership

### Shop Admin

- A Shop has exactly one Shop Admin account.
- A Shop Admin manages exactly one Shop.
- There are no staff accounts, invitations, roles, organizations, or multi-Shop accounts in the MVP.
- The same Shop Admin account may have simultaneous sessions on multiple devices. Actions are not attributable to individual staff members.
- The Shop Admin owns the Polar subscription and the entitlement applied to their Shop.

### Customer

- A Customer has no BarberWalkin account.
- BarberWalkin records no Customer-identifying details.
- Every Visit is displayed as `Guest`; Queue position distinguishes Visits.
- Customer data and Queue positions are never exposed publicly.

## Authentication and Trial Shops

Authentication uses Better Auth through the Convex integration.

- Anonymous authentication creates a real authenticated user and Trial Shop.
- A Trial Shop is private and can be previewed only by its anonymous Shop Admin.
- An anonymous user may check slug availability but does not publish the Shop.
- Linking and verifying a new email upgrades the anonymous account and transfers the Trial Shop.
- If the email already belongs to an account, the upgrade is rejected with an “email already exists” message. The user must provide a new email.
- Publication is a separate explicit action after email verification and completed onboarding.
- Email OTP is the only production sign-in and account-recovery method. Unknown emails create new accounts.
- Email changes require OTP confirmation of both the current and new address.
- Passwords, social login, staff invitations, and support-assisted ownership transfer are outside the MVP.
- An abandoned Trial Shop is deleted after seven days without a successful authenticated mutation.

### Email delivery

The launch sender is Better Auth Infrastructure email. Development and production must exercise the real email path; a production domain and sender configuration are required before launch.

Better Auth 1.7 is a bounded compatibility spike because the installed `@convex-dev/better-auth@0.12.5` peer range is below 1.7. Version 1.7 is accepted only if all of these pass:

- type checking and production build;
- Convex auth schema generation and deployment;
- anonymous sign-in;
- email OTP sign-in;
- anonymous-to-email linking with Trial Shop transfer;
- session restoration;
- Cloudflare deployment.

Any adapter, type, or runtime incompatibility ends the spike. The fallback is `better-auth@~1.6.15`; do not patch adapter internals or suppress peer errors.

## Routes and Access

| Route | Access | Purpose |
| :--- | :--- | :--- |
| `/` | Public | Marketing page. |
| `/sign-in` | Public | Anonymous trial or email OTP sign-in. |
| `/onboarding` | Authenticated | Shop details followed by initial Chair configuration. |
| `/dashboard` | Shop Admin | Live Queue and Chair operation. |
| `/chairs` | Shop Admin | Chair configuration and 3D preview. |
| `/analytics` | Shop Admin | Operational Analytics according to entitlement. |
| `/settings` | Shop Admin | Shop branding, email, publication, billing, and account deletion. |
| `/{shopSlug}` | Public | Read-only live Shop availability. |
| `/api/webhook/polar` | Verified webhook | Polar subscription synchronization. |

Public slugs are lowercase letters, digits, and hyphens, globally unique, and cannot use reserved application-route names. A rename takes effect immediately: there is no redirect or slug history, and the previous slug is immediately available for another Shop to claim. Broken printed links and immediate reuse are accepted consequences of this rule.

## Onboarding and Shop State

Onboarding has two steps:

1. Shop name, proposed slug, and timezone.
2. Initial Chair labels and colors.

The browser supplies a default timezone, but the Shop Admin can correct it. All authoritative timestamps are generated on the server and stored in UTC; reporting uses the Shop timezone.

Publication and operation are separate:

- **Published** controls whether the public slug is reachable.
- **Open** controls whether the Shop currently accepts new Visits.
- A Trial Shop cannot be Published.
- A Published Shop can be Open or closed.
- Closing prevents new Visits but preserves the current Queue.
- While closed, Waiting Visits may become In Service or Left, and In Service Visits may become Completed.
- Reopening preserves the operational state.
- The closed public page shows branding and “Geschlossen” only; it does not show stale Queue or Chair state.

Record Open/Close periods so historical Chair utilization uses actual operating time.

## Queue and Visit Lifecycle

The Queue is FIFO by default. A Shop Admin can explicitly reorder Waiting Visits.

- New Visits append to the end.
- Moving a Visit shifts the intervening Visits by one.
- In Service Visits are no longer in the Queue.
- Arrival time remains immutable historical data; explicit Queue order is the mutable source of current position.

The Visit lifecycle is:

```text
Waiting ──→ In Service ──→ Completed
   └────────────────────→ Left
```

- **Add:** creates a Waiting Visit and records server time.
- **Seat:** assigns a Waiting Visit to one active, unoccupied Chair and records server time.
- **Complete:** ends an In Service Visit and records server time. Completed means the service engagement ended, even if interrupted.
- **Leave:** applies only to a Waiting Visit and records server time.
- Completed and Left are terminal states.

### Undo

The last reversible transition may be undone for ten seconds when no later action conflicts:

- undo Seat returns the Visit to its prior Queue position;
- undo Complete restores In Service only if the Chair remains free;
- undo Left restores the prior Queue position.

Store only the last reversible transition and prior state; do not introduce event sourcing. If the precondition no longer holds, reject the undo and show the current reactive state.

## Chair Model and Invariants

A Chair represents one staffed service position. The MVP does not separately model Barbers, shifts, services, or appointments.

- A Chair has a required label, validated color, explicit display order, and active/inactive state.
- Labels are 1–40 characters and unique among the Shop's non-archived Chairs.
- Colors are stored as validated six-digit hex values.
- Occupancy is derived from the current In Service Visit; there is no writable `available` field.
- Only an active, unoccupied Chair can receive a Waiting Visit.
- A Chair has at most one In Service Visit, and a Visit occupies at most one Chair.
- An occupied Chair cannot be deactivated or removed.
- Completing its Visit makes the Chair free.
- Deactivating a free Chair removes it from public capacity.
- Removing a Chair archives it. Historical Visits retain their Chair relationship.
- An archived label may be reused without changing history.

Record Chair activation periods so utilization can be calculated against historical active capacity.

## 3D Chair Preview

The 3D preview is an intentional configuration feature and product differentiator.

- Build one custom barber-chair model manually with Three.js/React Three Fiber.
- The Shop Admin opens it from Chair configuration in a lazy-loaded modal.
- The configured Chair color is applied to the model.
- The preview supports rotation and zoom.
- It is admin-only and is not loaded on the public page.
- Room layout, avatars, service animation, model selection, and imported marketplace models are outside the MVP.

The final geometry will be informed by previously written reference code supplied later.

## Public Shop Projection

An unauthenticated public subscription returns only:

- Shop name, optional description, and optional logo;
- Open status;
- each active Chair's label, color, order, and occupied/free state;
- total Waiting count.

It never returns auth records, billing state, raw Visits, Queue positions, timestamps, Customer information, internal IDs, or Trial Shops. Public queries use an explicit whitelist rather than serializing internal documents.

Public branding constraints:

- Shop name: 1–80 characters;
- description: optional, at most 280 characters;
- logo: optional JPEG, PNG, or WebP, at most 2 MB;
- no gallery, address, contact directory, or built-in crop editor.

Estimated waiting time is outside the MVP. It requires a later design covering service types, observed duration, Queue order, and active capacity.

## Plans and Billing

The development build uses a development-only fake billing check so Free and Pro behavior can be exercised without Polar. Fake billing state must not enter production or become the source of truth for launch entitlements.

### Free Plan

- At most two active Chairs.
- Current-day Waiting, In Service, Completed, and Left counts.

### Pro Plan

- Unlimited active Chairs.
- Historical 7-, 30-, and 90-day analytics.
- Duration averages, utilization, and trends.

Both plans may configure and archive additional Chairs. Free enforcement blocks activation of a third Chair; it never hides an active Chair or live operation.

Polar owns checkout, invoices, cancellations, and payment status. Signed, idempotent webhooks synchronize subscription state onto the Shop Admin. Server-side entitlement calculation uses synchronized plan, status, and grace data; checkout-return parameters never grant Pro access. Billing management opens Polar's customer portal.

If Pro lapses:

1. retain full Pro access for seven days;
2. never disrupt an Open Shop or In Service Visit;
3. after grace, require the Shop Admin to select at most two active Chairs before the next opening;
4. keep other Chairs configured but inactive;
5. retain all Visits and analytics.

The Pro price remains a launch decision.

## Analytics

Operational Analytics are derived from Convex data and remain distinct from PostHog Product Analytics.

Launch metrics:

- Waiting now;
- In Service now;
- Completed Visits;
- Left Visits;
- average wait duration;
- average service duration;
- Chair utilization;
- daily Visit trend.

Definitions:

- wait duration = `seatedAt - enteredAt`;
- service duration = `completedAt - seatedAt`;
- Left Visits do not contribute to average wait or service duration;
- Chair utilization = total In Service time divided by total active-Chair time while the Shop was Open;
- reporting windows use the Shop timezone.

Calculate analytics directly from indexed Visits and recorded Open/Chair activation periods at launch. Do not add precomputed rollups until measured volume requires them.

PostHog captures only Product Analytics. The exact privacy mode remains a launch decision; the closeout recommendation is EU hosting, cookieless anonymous tracking, no person profiles, and a small allowlist of manual events with autocapture and session replay disabled.

## Data Shape

The persistence model needs these concepts; exact Convex validators belong in implementation:

- **Shop Admin entitlement:** plan, subscription status, Polar customer/subscription identifiers, cancellation time, and grace-period end.
- **Shop:** Shop Admin reference, name, slug, description, logo storage reference, timezone, Published/Open state, last authenticated mutation, and pending deletion time.
- **Chair:** Shop reference, label, color, display order, active state, and archive time.
- **Visit:** Shop and optional Chair references, status, explicit Queue order, lifecycle timestamps, and minimal undo state.
- **Open period:** Shop reference with open and close timestamps.
- **Chair activation period:** Chair reference with activation and deactivation timestamps.

Use constrained status validators rather than free-form strings. Better Auth owns its user/session tables; application code should not duplicate them.

## Deletion and Retention

There is one **Delete Account and Shop** action.

- It immediately unpublishes the Shop and disables access.
- The Shop Admin may recover it for 30 days.
- Final deletion removes the Shop, Chairs, Visits, slug, auth account, and subscription linkage.
- Polar cancellation is performed separately before final deletion.
- A final deletion releases the current slug immediately.
- Non-identifying Visit history remains for the lifetime of an active Shop.
- Abandoned Trial Shops follow the separate seven-day inactivity cleanup.

## Realtime, Authorization, and Failure Behavior

- Convex is the source of truth for Queue, Visit, Chair, and entitlement state.
- Every protected query and mutation authorizes the Shop Admin at the server boundary.
- Every mutation validates its expected current state transactionally.
- Stale concurrent actions are rejected clearly; Convex subscriptions then render the current state.
- On connection loss, show a reconnecting banner and disable mutations.
- Do not implement local offline mutation queues, locks, presence, or custom conflict resolution.
- Polar webhooks verify signatures and handle duplicates and out-of-order delivery.
- Server time is authoritative for lifecycle, undo, grace, and cleanup behavior.

## Interface Direction

- German-only UI; code identifiers and engineering documentation remain English.
- Admin dashboard optimized for tablet, then phone and desktop.
- Public Shop page optimized for phone.
- Geist Sans for body/headings and Geist Mono for timestamps and tabular figures.
- Flat, border-first Mantine surfaces with no decorative shadows.
- Green for free Chairs, red for occupied/destructive states, and orange for entitlement notices.
- Motion is limited to subtle Queue and modal transitions.
- Accessibility basics, keyboard operation, visible focus, reduced-motion support, and readable contrast are required.

## Technology and Deployment

| Layer | Choice |
| :--- | :--- |
| Framework | Next.js App Router with React 19 |
| Backend and realtime | Convex |
| Authentication | Better Auth with `@convex-dev/better-auth`, Anonymous, and Email OTP plugins |
| Email | Better Auth Infrastructure |
| UI | Mantine Core and Mantine Form |
| Validation | Convex validators at server boundaries; Zod only where client-form validation materially benefits |
| Motion | Motion |
| 3D | Three.js, React Three Fiber, and Drei |
| Billing | Polar |
| Product analytics | PostHog, launch-only |
| Deployment | OpenNext on Cloudflare Workers |

Cloudflare is a settled deployment decision based on successful prior applications. See [`adr/0001-deploy-on-cloudflare-workers.md`](adr/0001-deploy-on-cloudflare-workers.md).

All dynamic operational state and invalidation remain in Convex. No KV, R2, or D1 cache binding is required for application state. Before writing Next.js-specific code, read the matching versioned guides under `node_modules/next/dist/docs/` as required by the repository instructions.

## Explicitly Deferred

- multiple Shop Admins, staff accounts, roles, or invitations;
- multiple Shops or organizations;
- Barbers, shifts, Services, appointments, or remote Queue joining;
- Customer identity, contact details, notifications, or private Queue links;
- estimated waiting time;
- opening schedules;
- Premium plan;
- precomputed analytics rollups;
- public 3D rendering, room layouts, or multiple Chair models;
- offline operation;
- additional interface languages.

## Remaining Launch Inputs

These are intentionally unresolved rather than silently assumed:

1. Pro price in euros.
2. Final PostHog privacy/consent mode.
3. The old Three.js Chair code used as geometry inspiration.
