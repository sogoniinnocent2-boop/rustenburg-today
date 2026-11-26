import { redirect } from "next/navigation";
import { localePath } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

export default async function DeskRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; tab?: string[] }>;
}) {
  const { locale, tab } = await params;
  const suffix = tab?.length ? `/${tab.join("/")}` : "";
  redirect(localePath(locale, `/department${suffix}`));
}
