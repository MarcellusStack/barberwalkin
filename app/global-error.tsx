"use client";

import { MantineProvider } from "@mantine/core";
import { Geist } from "next/font/google";
import { ErrorFallback } from "./error-fallback";
import "@mantine/core/styles.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="de">
      <body className={geist.className}>
        <MantineProvider defaultColorScheme="light">
          <ErrorFallback retry={retry} />
        </MantineProvider>
      </body>
    </html>
  );
}
