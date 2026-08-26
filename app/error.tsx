"use client";

import { ErrorFallback } from "./error-fallback";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <ErrorFallback retry={retry} />;
}
