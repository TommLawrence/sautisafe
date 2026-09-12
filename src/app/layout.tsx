import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SautiSafe — Safer reporting, in the language workers actually speak",
  description:
    "Code-switched voice reporting assistant for industrial safety incidents and near misses. Transcribes Luganda/Swahili/English, extracts structured safety fields, asks focused follow-ups, flags urgent risks, and benchmarks speech models.",
  keywords: [
    "SautiSafe",
    "industrial safety",
    "incident reporting",
    "code-switching",
    "Luganda",
    "Swahili",
    "speech-to-text",
    "speech benchmark",
    "voice AI",
    "AI for Africa",
  ],
  authors: [{ name: "SautiSafe" }],
  openGraph: {
    title: "SautiSafe",
    description:
      "Code-switched voice reporting assistant for industrial safety incidents and near misses.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SautiSafe",
    description:
      "Safer reporting, in the language workers actually speak.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f7a73" },
    { media: "(prefers-color-scheme: dark)", color: "#0b3b38" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster richColors position="top-center" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
