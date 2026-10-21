import type { Metadata } from "next";
import "./globals.css";
import "./collection-features.css";
import { PreferencesProvider } from "@/components/preferences";
export const metadata: Metadata = {
  title: "PlayNext — your next game is here",
  description:
    "Less browsing, more playing. Discover random games, swipe to choose, and find your next favorite with PlayNext.",
  icons: { icon: "/assets/favicon.svg" },
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
