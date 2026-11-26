import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { AdminShell } from "@/components/admin-shell";
import { Shell } from "@/components/chrome";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await currentUser();
  const path = (await headers()).get("x-rt-path") || "";
  if (
    path === `/${locale}/admin` || path.startsWith(`/${locale}/admin/`)
    || path === `/${locale}/desk` || path.startsWith(`/${locale}/desk/`)
    || path === `/${locale}/department` || path.startsWith(`/${locale}/department/`)
  ) {
    return <AdminShell locale={locale as Locale} user={user}>{children}</AdminShell>;
  }
  return <Shell locale={locale as Locale} user={user}>{children}</Shell>;
}
