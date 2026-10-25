import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Every page reads live data from Postgres; nothing is prerendered at build time.
export const dynamic = "force-dynamic";

const sans = Source_Sans_3({ variable: "--font-sans", subsets: ["latin"] });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Viking Warriors", template: "%s · Viking Warriors" },
  description: "Viking Warriors cricket team: stats, leaderboards, matches and match-fee finance.",
  applicationName: "Viking Warriors",
  appleWebApp: { capable: true, title: "Vikings", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f5a46" },
    { media: "(prefers-color-scheme: dark)", color: "#16201b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
      {/* Browser extensions (e.g. ColorZilla) add attributes to <body> before hydration. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
