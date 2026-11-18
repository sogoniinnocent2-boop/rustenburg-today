import { notFound } from "next/navigation";
import { t } from "@/lib/i18n";
import { PageIntro, Prose } from "@/components/chrome";

const docs: Record<string, { title: "terms" | "privacy" | "guidelines"; body: string }> = {
  terms: {
    title: "terms",
    body: "Rustenburg Today provides an independent digital city service for Rustenburg and surrounding communities. Creating an account means you agree to give accurate information, keep your password private, and use the platform lawfully. You keep ownership of content you submit, and you give the platform a licence to store, display and moderate it. Paid features, when enabled, are confirmed only by the payment provider’s server message. Demonstration records are labelled and are not offers. The platform can suspend accounts that break these terms or the community guidelines.",
  },
  privacy: {
    title: "privacy",
    body: "We collect the account details you submit, the content you publish, technical session data and records needed to keep the service safe. We do not sell personal information. Date of birth is used only to apply age rules and is not shown on your public profile. You can correct your profile, download a copy of your account data, and ask for the account to be closed. Closing an account removes the password and replaces the public name. Messages, reports and audit records may be kept where the law or a dispute requires it. Contact the operator at the address published on this site for a privacy request. This notice is the platform’s own explanation of its handling of personal information and should be read with the Protection of Personal Information Act.",
  },
  guidelines: {
    title: "guidelines",
    body: "Do not post threats, harassment, hate, sexual content involving anyone under 18, private identity numbers, or someone’s home address. Crime and safety notes from residents stay unpublished until a moderator reviews them. Do not present the platform as the municipality. Label sponsored material. Only upload media you have the right to share. Health pages are a directory, not medical advice. Youth content is moderated. Report content that breaks these rules. Moderators record the reason when they remove something.",
  },
};

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  const page = docs[doc];
  if (!page) notFound();
  return <div><PageIntro locale={locale} title={t(locale, page.title)} /><Prose text={page.body} /></div>;
}
