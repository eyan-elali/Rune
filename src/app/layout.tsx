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
    default: "Rune — The Creative Forge for Serious Authors",
    template: "%s | Rune",
  },
  description:
    "A professional writing workspace with deep focus tools, manuscript tracking, and a gamified Arena mode designed to silence your internal editor and drive raw creative output.",
  metadataBase: new URL("https://www.rune-app.com"),
  openGraph: {
    title: "Rune — The Creative Forge for Serious Authors",
    description:
      "Stop writing in sterile office software. Command a canvas built for long-form novelists.",
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
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}