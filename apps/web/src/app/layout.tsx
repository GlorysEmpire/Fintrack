import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// latin-ext carries the naira sign (₦), so amounts never fall back to a system glyph
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const display = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinTrack — Personal finance OS",
  description:
    "Custom budget waterfalls, multi-currency tracking, and a finance-native AI advisor.",
  applicationName: "FinTrack",
  // Home-screen install on iPhone (Android reads /manifest.webmanifest)
  appleWebApp: { capable: true, title: "FinTrack", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0c1210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
