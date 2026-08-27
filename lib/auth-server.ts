import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { getPublicConvexSiteUrl, getPublicConvexUrl } from "@/lib/env";

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: getPublicConvexUrl() || "http://127.0.0.1:3210",
  convexSiteUrl: getPublicConvexSiteUrl() || "http://127.0.0.1:3211",
});
