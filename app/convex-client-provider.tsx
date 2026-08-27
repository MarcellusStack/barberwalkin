"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { validateConvexUrl } from "./env";

interface ConvexStatusContextValue {
  isConfigured: boolean;
  url: string | null;
  error: string | null;
}

const ConvexStatusContext = createContext<ConvexStatusContextValue>({
  isConfigured: false,
  url: null,
  error: null,
});

export function useConvexStatus() {
  return useContext(ConvexStatusContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const validation = useMemo(() => validateConvexUrl(envUrl), [envUrl]);

  const client = useMemo(() => {
    if (validation.isValid && validation.url) {
      return new ConvexReactClient(validation.url);
    }
    return null;
  }, [validation.isValid, validation.url]);

  const statusValue = useMemo<ConvexStatusContextValue>(
    () => ({
      isConfigured: validation.isValid,
      url: validation.url,
      error: validation.error,
    }),
    [validation],
  );

  if (client) {
    return (
      <ConvexStatusContext.Provider value={statusValue}>
        <ConvexProvider client={client}>{children}</ConvexProvider>
      </ConvexStatusContext.Provider>
    );
  }

  return (
    <ConvexStatusContext.Provider value={statusValue}>
      {children}
    </ConvexStatusContext.Provider>
  );
}
