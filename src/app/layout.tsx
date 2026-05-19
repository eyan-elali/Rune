import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastContainer } from "@/components/ui/Toast";
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
    // This controls what shows up on your main landing pages
    default: "Rune — Craft Your Epic", 
    // This allows sub-pages to say things like "Arena | Rune" smoothly
    template: "%s | Rune", 
  },
  description:
    "A gamified, focus-driven writing workspace built specifically for epic fantasy authors.",
  // Crucial update: point your base url to your live production domain
  metadataBase: new URL("https://rune-app.com"), 
  openGraph: {
    title: "Rune — Craft Your Epic",
    description:
      "A gamified, distraction-free writing environment. Focus Mode. Battle Arena. Race Mode.",
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
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}