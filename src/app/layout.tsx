import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastContainer } from "@/components/ui/Toast";
import { MetaPixel } from "@/components/MetaPixel";
import "@/lib/env";
import "./globals.css";

// 2. CONFIGURE FONTS
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

export const metadata: Metadata = {
  title: {
    default: "Rune | Writing Workspace for Novelists",
    template: "%s | Rune",
  },
  description:
    "Rune is the writing workspace built specifically for novelists. Organize chapters and scenes, build momentum, and finish your manuscript.",
  metadataBase: new URL("https://www.rune-app.com"),
  openGraph: {
    title: "Rune | Writing Workspace for Novelists",
    description:
      "Rune is the writing workspace built specifically for novelists. Organize chapters and scenes, build momentum, and finish your manuscript.",
    url: "https://www.rune-app.com",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      {/* 3. APPLY VARIABLES TO BODY */}
      <body 
        className={`${inter.variable} ${newsreader.variable} min-h-full flex flex-col font-sans antialiased`}
      >
        <Script
          src="https://cdn.promotekit.com/pk.js"
          data-promotekit="64ee5083-c2fe-4f2a-83d5-f617165dc363"
          strategy="afterInteractive"
        />
        <MetaPixel />
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}