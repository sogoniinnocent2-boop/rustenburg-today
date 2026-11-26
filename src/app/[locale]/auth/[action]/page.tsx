import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { Field, HiddenLocale, Notice, PageIntro, button, control } from "@/components/chrome";
import { forgotAction, resetAction, signInAction, signUpAction, verifyAction } from "@/server/actions";
import { safeReturn } from "@/lib/safe-return";
import { appleConfigured } from "@/server/apple";
import { facebookConfigured } from "@/server/facebook";
import { googleConfigured } from "@/server/google";

const pages = new Set(["sign-in", "sign-up", "verify", "forgot", "reset"]);

export default async function AuthPage({ params, searchParams }: { params: Promise<{ locale: string; action: string }>; searchParams: Promise<{ error?: string; notice?: string; token?: string; dev?: string; next?: string }> }) {
  const { locale, action } = await params;
  const query = await searchParams;
  if (!pages.has(action)) notFound();
  return (
    <div className="mx-auto max-w-md">
      <PageIntro locale={locale} title={action === "sign-up" ? t(locale, "register") : action === "forgot" ? t(locale, "forgot") : action === "reset" ? t(locale, "reset") : action === "verify" ? t(locale, "verify") : t(locale, "signIn")} summary={t(locale, "auth.blurb")} />
      <Notice error={query.error} notice={query.notice} />
      {query.dev ? <p className="mb-4 text-sm text-emerald">{t(locale, "dev.mail")}</p> : null}
      {action === "sign-in" || action === "sign-up" ? <ProviderRow locale={locale} /> : null}
      {action === "sign-in" ? <form action={signInAction} className="mt-4 space-y-3">{common(locale)}{safeReturn(locale, query.next || "") ? <input type="hidden" name="next" value={safeReturn(locale, query.next || "") || ""} /> : null}<Field label={t(locale, "email")}><input name="email" type="email" autoComplete="username" required className={control} /></Field><Field label={t(locale, "password")}><input name="password" type="password" autoComplete="current-password" required className={control} /></Field><button className={button}>{t(locale, "signIn")}</button><p className="text-sm"><a href={localePath(locale, "/auth/forgot")}>{t(locale, "forgot")}</a></p></form> : null}
      {action === "sign-up" ? <form action={signUpAction} className="space-y-3">{common(locale)}{safeReturn(locale, query.next || "") ? <input type="hidden" name="next" value={safeReturn(locale, query.next || "") || ""} /> : null}<Field label={t(locale, "name")}><input name="displayName" required className={control} /></Field><Field label={t(locale, "email")}><input name="email" type="email" required className={control} /></Field><Field label={t(locale, "password")}><input name="password" type="password" required className={control} /></Field><Field label={t(locale, "dob")}><input name="dateOfBirth" type="date" required className={control} /></Field><label className="flex gap-2 text-sm"><input type="checkbox" name="terms" value="yes" required />{t(locale, "consent.terms")}</label><label className="flex gap-2 text-sm"><input type="checkbox" name="guardian" value="yes" />{t(locale, "consent.guardian")}</label><button className={button}>{t(locale, "register")}</button></form> : null}
      {action === "verify" ? <form action={verifyAction} className="space-y-3">{common(locale)}{safeReturn(locale, query.next || "") ? <input type="hidden" name="next" value={safeReturn(locale, query.next || "") || ""} /> : null}<Field label="Token"><input name="token" defaultValue={query.token} required className={control} /></Field><button className={button}>{t(locale, "verify")}</button></form> : null}
      {action === "forgot" ? <form action={forgotAction} className="space-y-3">{common(locale)}<Field label={t(locale, "email")}><input name="email" type="email" required className={control} /></Field><button className={button}>{t(locale, "send")}</button></form> : null}
      {action === "reset" ? <form action={resetAction} className="space-y-3">{common(locale)}<input type="hidden" name="token" value={query.token || ""} /><Field label={t(locale, "password")}><input name="password" type="password" required className={control} /></Field><button className={button}>{t(locale, "save")}</button></form> : null}
    </div>
  );
}

function common(locale: string) {
  return <HiddenLocale locale={locale} />;
}

function ProviderRow({ locale }: { locale: string }) {
  return (
    <div className="space-y-2">
      <GoogleEntry locale={locale} />
      <ProviderLink locale={locale} configured={appleConfigured()} href={`/api/auth/apple?locale=${locale}`} label={t(locale, "apple.continue")} missing={t(locale, "apple.missing")} mark={<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path fill="currentColor" d="M13.2 9.5c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.7-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.2c.7-1 1.2-2 1.5-3.1-3.9-1.5-3.9-5.5 0-6.4zM11.1 3.2c.6-.8 1.1-1.8.9-2.9-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2.1-.5 2.8-1.3z" /></svg>} />
      <ProviderLink locale={locale} configured={facebookConfigured()} href={`/api/auth/facebook?locale=${locale}`} label={t(locale, "facebook.continue")} missing={t(locale, "facebook.missing")} mark={<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M14.5 8.5V6.8c0-.7.5-1.1 1.2-1.1H17V3h-2.1C12.2 3 11 4.4 11 6.6v1.9H9v2.7h2V21h3.5v-9.8h2.3l.4-2.7h-2.7z" /></svg>} />
    </div>
  );
}

function GoogleEntry({ locale }: { locale: string }) {
  const label = (
    <span className="inline-flex items-center gap-2">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-3.1 5.2-5.9 6.5l6.3 5.3C37.4 41.3 44 36 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
      {t(locale, "google.continue")}
    </span>
  );
  if (!googleConfigured()) return <p className="rounded-2xl bg-white/70 p-3 text-sm text-graphite">{label}. {t(locale, "google.missing")}</p>;
  return <a className={`${button} inline-flex`} href={`/api/auth/google?locale=${locale}`}>{label}</a>;
}

function ProviderLink({ configured, href, label, missing, mark }: { locale: string; configured: boolean; href: string; label: string; missing: string; mark: ReactNode }) {
  const content = <span className="inline-flex items-center gap-2">{mark}{label}</span>;
  if (!configured) return <p className="rounded-2xl bg-white/70 p-3 text-sm text-graphite">{content}. {missing}</p>;
  return <a className={`${button} inline-flex`} href={href}>{content}</a>;
}
