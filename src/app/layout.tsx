import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SautiSafe - Safer reporting, in the language workers actually speak",
  description:
    "Code-switched voice reporting assistant for industrial safety incidents and near misses. Transcribes Luganda/Swahili/English, extracts structured safety fields, asks focused follow-ups, flags urgent risks, and benchmarks speech models.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SautiSafe",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
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
    { media: "(prefers-color-scheme: light)", color: "#1f63ad" },
    { media: "(prefers-color-scheme: dark)", color: "#0a2a5e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 5,
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
            <ConvexClientProvider>
              {children}
              <Toaster richColors position="top-center" />
              <ServiceWorkerRegister />
            </ConvexClientProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
