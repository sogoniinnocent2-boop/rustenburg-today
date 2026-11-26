import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { FlowMemory } from "@/components/flow";
import { SubmitGuard } from "@/components/submit-guard";
import { BrandLogo } from "@/components/brand-logo";
import { t } from "@/lib/i18n";
import "./globals.css";

const flowBoot = `try{if(sessionStorage.getItem("rt-flow")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("flow-skip");var m=document.cookie.match(/(?:^|; )rt_theme=([^;]*)/);if(m&&m[1]==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const serif = Newsreader({ subsets: ["latin", "latin-ext"], variable: "--font-newsreader", display: "swap" });
const sans = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source-sans", display: "swap" });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export const metadata: Metadata = {
  title: { default: "Rustenburg Today", template: "%s · Rustenburg Today" },
  description: "Your city. Your stories. Your opportunities. The digital city for Rustenburg, North West.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: flowBoot }} />
        <FlowMemory />
        <SubmitGuard />
        <div className="brand-flow" aria-hidden="true">
          <div className="brand-mark brand-mark-logo">
            <div className="brand-orbit" />
            <BrandLogo size="splash" decorative />
            <p className="brand-line">{t("en", "tagline")}</p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
