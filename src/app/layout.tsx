import "./globals.css";
import type { Metadata, Viewport } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Script from "next/script";
import WhatsAppFloatingButton from "@/components/WhatsAppFloatingButton";

const baseUrl = "https://brickinfinity.com";

/* =====================================================
   GLOBAL SEO METADATA
===================================================== */

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),

  title: {
    default: "BrickInfinity | Buy, Rent & List Properties",
    template: "%s | BrickInfinity",
  },

  description:
    "BrickInfinity is a modern real estate marketplace to buy, rent, and list properties with verified listings and secure lead management.",

  applicationName: "BrickInfinity",

  alternates: {
    canonical: baseUrl,
  },

  keywords: [
    "real estate",
    "buy property",
    "rent property",
    "property marketplace",
    "India real estate",
    "BrickInfinity",
  ],

  authors: [{ name: "BrickInfinity" }],
  creator: "BrickInfinity",
  publisher: "BrickInfinity",

  referrer: "origin-when-cross-origin",

  openGraph: {
    title: "BrickInfinity | Real Estate Marketplace",
    description:
      "Discover verified properties for sale and rent. List your property and manage leads securely.",
    url: baseUrl,
    siteName: "BrickInfinity",
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "BrickInfinity Real Estate Marketplace",
      },
    ],
    locale: "en_IN",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "BrickInfinity | Real Estate Marketplace",
    description:
      "Buy, rent, and list properties on a secure and modern real estate platform.",
    images: ["/og-default.jpg"],
  },

  robots: {
    index: true,
    follow: true,
  },

  icons: {
    icon: "/favicon.ico",
  },
};

/* =====================================================
   GLOBAL VIEWPORT
===================================================== */

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E53935" },
    { media: "(prefers-color-scheme: dark)", color: "#0F2747" },
  ],
};

/* =====================================================
   ROOT LAYOUT
===================================================== */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BrickInfinity",
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans min-h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-dark)] antialiased"
      >
        {/* GLOBAL BRAND SCHEMA */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />

        {/* NAVBAR */}
        <Navbar />

        {/* PAGE CONTENT */}
        <main className="flex-1 w-full">{children}</main>

        {/* FLOATING WHATSAPP CTA */}
        <WhatsAppFloatingButton />

        {/* FOOTER */}
        <Footer />

        {/* OneSignal Push Notifications */}
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          defer
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "f1b16fd2-3076-4c6d-b360-893c7841d0fc",
              });
            });
          `}
        </Script>
      </body>
    </html>
  );
}
