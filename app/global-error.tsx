"use client";

import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Geist } from "next/font/google";
import { ErrorFallback } from "./error-fallback";
import { theme } from "@/theme";
import "@mantine/core/styles.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="de" className={geist.variable} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body className={geist.className}>
        <MantineProvider forceColorScheme="light" theme={theme}>
          <ErrorFallback retry={retry} />
        </MantineProvider>
      </body>
    </html>
  );
}
