import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  shops: defineTable({
    adminId: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    timezone: v.string(),
    isPublished: v.boolean(),
    isOpen: v.boolean(),
    lastAuthenticatedMutationAt: v.optional(v.number()),
    pendingDeletionAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_adminId", ["adminId"]),

  chairs: defineTable({
    shopId: v.id("shops"),
    label: v.string(),
    color: v.string(),
    order: v.number(),
    isActive: v.boolean(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_active", ["shopId", "isActive"]),

  visits: defineTable({
    shopId: v.id("shops"),
    chairId: v.optional(v.id("chairs")),
    status: v.union(
      v.literal("waiting"),
      v.literal("in_service"),
      v.literal("completed"),
      v.literal("left"),
    ),
    order: v.number(),
    enteredAt: v.number(),
    seatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    undoState: v.optional(v.any()),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_status", ["shopId", "status"]),

  openPeriods: defineTable({
    shopId: v.id("shops"),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
  }).index("by_shopId", ["shopId"]),

  chairActivationPeriods: defineTable({
    chairId: v.id("chairs"),
    activatedAt: v.number(),
    deactivatedAt: v.optional(v.number()),
  }).index("by_chairId", ["chairId"]),

  entitlements: defineTable({
    adminId: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro")),
    subscriptionStatus: v.optional(v.string()),
    polarCustomerId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    gracePeriodEndsAt: v.optional(v.number()),
  }).index("by_adminId", ["adminId"]),

  probes: defineTable({
    name: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),
});
