import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { FlowMemory } from "@/components/flow";
import { SubmitGuard } from "@/components/submit-guard";
import { BrandLogo } from "@/components/brand-logo";
import { t } from "@/lib/i18n";
import "./globals.css";

const flowBoot = `try{if(sessionStorage.getItem("rt-flow")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("flow-skip")}catch(e){}`;

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await headers()).get("x-rt-locale") || "en";
  const theme = (await cookies()).get("rt_theme")?.value === "dark" ? "dark" : "";
  const lang = locale === "af" ? "af" : locale === "tn" ? "tn" : "en";
  return (
    <html lang={lang} className={`${serif.variable} ${sans.variable} ${theme}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: flowBoot }} />
        <FlowMemory />
        <SubmitGuard />
        <div className="brand-flow" aria-hidden="true">
          <div className="brand-mark brand-mark-logo">
            <div className="brand-orbit" />
            <BrandLogo size="splash" decorative />
            <p className="brand-line">{t(lang, "tagline")}</p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
