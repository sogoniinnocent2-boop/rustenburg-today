import Link from "next/link";
import { notFound } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { PageIntro, Prose } from "@/components/chrome";
import { blockAction, followAction } from "@/server/actions";
import { listPublicProfile } from "@/server/auth";
import { followCounts, isFollowing } from "@/server/community";
import { currentUser } from "@/server/session";
import { HiddenLocale, button } from "@/components/chrome";

export default async function PersonPage({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale, username } = await params;
  const profile = listPublicProfile(username);
  if (!profile) notFound();
  const user = await currentUser();
  const counts = followCounts(profile.user.id);
  return (
    <div>
      <PageIntro locale={locale} title={profile.user.displayName} summary={`@${profile.user.username}`} />
      {profile.user.avatarUrl ? <img src={profile.user.avatarUrl} alt="" className="mt-4 h-20 w-20 rounded-full object-cover" /> : null}
      {profile.user.biography ? <Prose text={profile.user.biography} /> : null}
      <p className="mt-3 text-sm">{counts.followers} followers · {counts.following} following</p>
      {user && user.id !== profile.user.id ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={followAction}><HiddenLocale locale={locale} /><input type="hidden" name="username" value={username} /><button className={button}>{isFollowing(user.id, username) ? "Unfollow" : t(locale, "follow")}</button></form>
          <form action={blockAction}><HiddenLocale locale={locale} /><input type="hidden" name="username" value={username} /><button className={button}>Block</button></form>
        </div>
      ) : null}
      <ul className="mt-6 space-y-3">{profile.posts.map((post) => <li key={post.id} className="rounded-2xl bg-white p-4 dark:bg-white/5"><Link href={localePath(locale, `/community/${post.id}`)}>{post.body}</Link></li>)}</ul>
    </div>
  );
}
