import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getServerStatus = query({
  args: {},
  handler: async () => {
    return {
      status: "ok",
      serverTimeUtc: Date.now(),
      message: "Convex-Backend ist betriebsbereit.",
    };
  },
});

export const getProbeStatus = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const probe = await ctx.db
      .query("probes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    return probe;
  },
});

export const setProbeStatus = mutation({
  args: {
    name: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("probes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    const timestamp = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        message: args.message,
        updatedAt: timestamp,
      });
      return {
        _id: existing._id,
        name: args.name,
        status: args.status,
        message: args.message,
        updatedAt: timestamp,
      };
    }

    const id = await ctx.db.insert("probes", {
      name: args.name,
      status: args.status,
      message: args.message,
      updatedAt: timestamp,
    });

    return {
      _id: id,
      name: args.name,
      status: args.status,
      message: args.message,
      updatedAt: timestamp,
    };
  },
});

export const clearProbe = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("probes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});
