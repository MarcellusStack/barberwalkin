import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import { theme } from "@/theme";
import { ConvexClientProvider } from "@/providers/convex-client-provider";
import { getToken } from "@/lib/auth-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BarberWalkin – Walk-ins einfach organisieren",
  description:
    "BarberWalkin organisiert Warteschlange und Stühle für Walk-in-Barbershops in Echtzeit.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getToken().catch(() => null);

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body className={geistSans.className}>
        <MantineProvider forceColorScheme="light" theme={theme}>
          <ConvexClientProvider initialToken={token}>
            {children}
          </ConvexClientProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
