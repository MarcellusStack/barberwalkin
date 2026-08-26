# BarberWalkin

BarberWalkin models the live walk-in operation of a barbershop and the public information customers use before visiting.

## Language

**Shop**:
A barbershop whose walk-in operation is managed in BarberWalkin. A Shop has one Shop Admin.
_Avoid_: Store, location, account

**Shop Admin**:
The single account permitted to manage a Shop and its live operation. The Shop Admin owns the subscription that governs the Shop's entitlements.
_Avoid_: Operator, owner, user, staff member

**Chair**:
One staffed service position representing the Shop's current service capacity. A Chair is active or inactive, and its occupancy is determined by whether it has an In Service Visit.
_Avoid_: Seat, station, barber

**Archived Chair**:
A Chair removed from current operation but retained as part of historical Visits.
_Avoid_: Deleted chair, inactive chair

**Queue**:
The ordered collection of Visits currently waiting for service at a Shop. Visits enter in arrival order, but the Shop Admin can explicitly reorder them.
_Avoid_: Waitlist, line

**Customer**:
A person seeking walk-in service from a Shop. A Customer does not need a BarberWalkin account, and BarberWalkin records no identifying details about them.
_Avoid_: Client, user

**Visit**:
One Customer's occurrence at a Shop. A Visit is Waiting, In Service, Completed, or Left; only a Waiting Visit can become Left, while an In Service Visit ends as Completed even if its service was interrupted. Completed and Left are final.
_Avoid_: Appointment, booking, ticket

**Published Shop**:
A Shop whose public slug can be visited. An anonymous trial Shop cannot be published.
_Avoid_: Active shop, live shop

**Open Shop**:
A Published Shop that is currently accepting walk-in Customers.
_Avoid_: Active shop, online shop

**Trial Shop**:
An unpublished Shop created by an anonymous Shop Admin for evaluating the operational workflow. It can be published only after the Shop Admin links and verifies an email address.
_Avoid_: Guest shop, demo shop

**Operational Analytics**:
Measures of a Shop's operation derived from its Chairs and Visits.
_Avoid_: Product analytics, PostHog analytics

**Product Analytics**:
Measures of how people use BarberWalkin itself, distinct from a Shop's Operational Analytics.
_Avoid_: Shop analytics, business analytics

**Free Plan**:
The launch entitlement that permits up to two active Chairs and current-day Operational Analytics.
_Avoid_: Basic plan, trial plan

**Pro Plan**:
The paid launch entitlement that permits unlimited active Chairs and historical Operational Analytics.
_Avoid_: Premium plan, paid plan
