import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google"; // 1. IMPORT
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastContainer } from "@/components/ui/Toast";
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
  title: "Rune — Write with Intention",
  description: "A distraction-free writing environment for thoughtful prose.",
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