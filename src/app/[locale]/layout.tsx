import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { Shell } from "@/components/chrome";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await currentUser();
  return <Shell locale={locale as Locale} user={user}>{children}</Shell>;
}
