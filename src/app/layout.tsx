import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { FlowMemory } from "@/components/flow";
import { SubmitGuard } from "@/components/submit-guard";
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
          <div className="brand-mark">
            <div className="brand-orbit" />
            <p className="brand-name">Rustenburg Today</p>
            <p className="brand-line">Discover. Connect. Learn. Trade. Experience. Grow.</p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
