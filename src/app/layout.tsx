import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ToastContainer } from "@/components/ui/Toast";
import "@/lib/env";
import { PRODUCT_NAME, SITE_URL } from "@/lib/brand";
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

const DESCRIPTION =
  "Sutura is the writing workspace built specifically for novelists. Organize chapters and scenes, build momentum, and finish your manuscript.";

export const metadata: Metadata = {
  title: {
    default: "Sutura | Writing Workspace for Novelists",
    template: "%s | Sutura",
  },
  description: DESCRIPTION,
  applicationName: PRODUCT_NAME,
  // The canonical address is the apex (www redirects to it: next.config.ts).
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "Sutura | Writing Workspace for Novelists",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: PRODUCT_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sutura | Writing Workspace for Novelists",
    description: DESCRIPTION,
  },
  // Made from the approved favicon source (public/brand/sutura/web). The dark
  // ink is drawn on transparency, so a dark browser chrome gets the light ink.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/sutura/web/icon-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/sutura/web/icon-dark-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/brand/sutura/web/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/sutura/web/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        {/* No third-party marketing scripts here: they load only on the
            public front door (MarketingTrackers), never in the app. */}
        <ThemeProvider>
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}