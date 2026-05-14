import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col font-rune-serif">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
