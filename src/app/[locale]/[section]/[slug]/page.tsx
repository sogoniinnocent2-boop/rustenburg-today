import Link from "next/link";
import { notFound } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { sectionBySlug } from "@/lib/sections";
import { videoEmbed } from "@/lib/text";
import { Field, HiddenLocale, Money, Notice, PageIntro, Prose, When, button, control } from "@/components/chrome";
import { getArticle, listArticleComments, newsCategories, relatedStories } from "@/server/editorial";
import { newsItemBySlug, openNow } from "@/server/citydesk";
import { Still } from "@/components/still";
import { ShareLink } from "@/components/share";
import { getPost } from "@/server/community";
import { getPodcast, getVideo } from "@/server/media";
import { getBusiness, getProduct } from "@/server/commerce";
import { getCourse, getCreatorPost, getRecord, listEvents, listFixtures, listMenu, listPlayers, moduleKeyForSection, publicQuiz } from "@/server/city";
import { get, all } from "@/server/db";
import { storyIsFollowed } from "@/server/alerts";
import { currentUser } from "@/server/session";
import { applyAction, attendAction, bookmarkAction, certificateAction, commentAction, deskAction, enrolAction, enquiryAction, lessonAction, orderAction, quizAction, reactionAction, reportAction, simpleAction, propertyVisitAction, cityDeskAction, topicAction, translationAction, storyAction, ticketOrderAction, voteAction } from "@/server/actions";

function TrackStory({ locale, kind, id, back, on }: { locale: string; kind: string; id: string; back: string; on: boolean }) {
  return (
    <form action={storyAction}>
      <HiddenLocale locale={locale} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="return" value={back} />
      <button className={button}><span className="pulse-lamp is-live" aria-hidden="true" />{on ? "Tracking" : "Track this story"}</button>
    </form>
  );
}

export default async function DetailPage({ params, searchParams }: { params: Promise<{ locale: string; section: string; slug: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { locale, section, slug } = await params;
  const query = await searchParams;
  const meta = sectionBySlug(section);
  if (!meta) notFound();
  const user = await currentUser();
  if (section === "news") {
    const category = newsCategories().find((item) => item.slug === slug);
    if (category) {
      const { listArticles } = await import("@/server/editorial");
      const news = listArticles({ locale, category: slug });
      return <div><PageIntro locale={locale} title={category.name} summary={t(locale, "sum.news")} />{news.items.map((story) => <p key={story.id} className="mb-3"><Link className="font-serif text-2xl" href={localePath(locale, `/news/${story.slug}`)}>{story.title}</Link></p>)}</div>;
    }
    const article = getArticle(slug, locale);
    if (!article) {
      const wire = newsItemBySlug(slug);
      if (!wire) notFound();
      return (
        <article>
          <PageIntro locale={locale} kicker={String(wire.story_kind)} title={String(wire.headline)} summary={String(wire.summary)} />
          <p className="text-sm">{String(wire.publisher)}{wire.author_name ? ` · ${wire.author_name}` : ""}{wire.original_published_at ? ` · ${String(wire.original_published_at).slice(0, 10)}` : ""}</p>
          <p className="mt-2 text-sm">Rights: {String(wire.rights_status)}. This page stores a headline and a short permitted summary. It is not a republication of the original article, so it does not estimate a reading time.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {wire.canonical_url ? <a className={button} href={String(wire.canonical_url)} rel="noopener noreferrer">Open the original report</a> : null}
            <ShareLink className={button} title={String(wire.headline)} url={String(wire.canonical_url || localePath(locale, `/news/${slug}`))} />
            {user ? <TrackStory locale={locale} kind="news" id={String(wire.id)} back={localePath(locale, `/news/${slug}`)} on={storyIsFollowed(user.id, "news", String(wire.id))} /> : null}
          </div>
          <Related locale={locale} category={String(wire.category_slug || "")} newsId={String(wire.id)} />
          {wire.correction_note ? <p className="mt-4 rounded-2xl bg-gold/20 p-4 text-sm">{String(wire.correction_note)}</p> : null}
        </article>
      );
    }
    const comments = listArticleComments(article.id);
    return (
      <article>
        <Notice error={query.error} notice={query.notice} />
        <PageIntro locale={locale} kicker={article.category} title={article.title} summary={article.excerpt} />
        {article.demo ? <p className="mb-4 text-sm font-semibold uppercase text-emerald">{t(locale, "demo")}</p> : null}
        {article.fallback ? <p className="mb-4 text-sm">{t(locale, "fallback.language")}</p> : null}
        <Prose text={article.body} />
        <p className="mt-6 text-sm text-muted">{article.author} · {article.readingMinutes} min, counted from this article · <When locale={locale} value={article.publishedAt} /></p>
        {article.sources.length ? <ul className="mt-4 text-sm">{article.sources.map((source) => <li key={source.source_name}>{source.source_name}</li>)}</ul> : null}
        {article.corrections.map((item) => <p key={item.created_at} className="mt-4 rounded-2xl bg-gold/20 p-4 text-sm"><strong>Correction.</strong> {item.note}</p>)}
        <div className="mt-6 flex flex-wrap gap-3">
          <ShareLink className={button} title={article.title} url={localePath(locale, `/news/${article.slug}`)} />
          {user ? <form action={bookmarkAction}><HiddenLocale locale={locale} /><input type="hidden" name="type" value="article" /><input type="hidden" name="id" value={article.id} /><input type="hidden" name="return" value={localePath(locale, `/news/${article.slug}`)} /><button className={button}>{t(locale, "bookmark")}</button></form> : null}
          {user ? <TrackStory locale={locale} kind="article" id={article.id} back={localePath(locale, `/news/${article.slug}`)} on={storyIsFollowed(user.id, "article", article.id)} /> : null}
          {user ? <form action={topicAction}><HiddenLocale locale={locale} /><input type="hidden" name="category" value={article.categorySlug} /><input type="hidden" name="return" value={localePath(locale, `/news/${article.slug}`)} /><button className={button}>Follow {article.category}</button></form> : null}
        </div>
        <Related locale={locale} category={article.categorySlug} articleId={article.id} />
        {user && (user.roles.includes("editor") || user.roles.includes("administrator")) ? <TranslationDesk locale={locale} articleId={article.id} back={localePath(locale, `/news/${article.slug}`)} /> : null}
        <CommentBox locale={locale} kind="article" id={article.id} back={localePath(locale, `/news/${article.slug}`)} user={Boolean(user)} />
        <ul className="mt-6 space-y-3">{comments.map((comment) => <li key={comment.id} className="rounded-2xl bg-white p-4 dark:bg-white/5"><strong>{comment.display_name}</strong><p>{comment.body}</p></li>)}</ul>
        <ReportBox locale={locale} type="article" id={article.id} back={localePath(locale, `/news/${article.slug}`)} user={Boolean(user)} />
      </article>
    );
  }
  if (section === "community") {
    const post = getPost(slug, user?.id);
    if (!post) notFound();
    const poll = post.poll as { options: Array<{ id: string; text: string; votes: number }>; voted: string | null } | null;
    const media = (post.media as Array<{ media_url: string; media_type: string; alt_text: string | null }>) || [];
    const tags = (post.tags as string[]) || [];
    const back = localePath(locale, `/community/${slug}`);
    return (
      <article>
        <PageIntro locale={locale} title={String(post.display_name)} summary={String(post.post_type)} />
        {media.filter((item) => item.media_type === "image").map((item) => <img key={item.media_url} className="mb-4 max-h-96 w-full rounded-3xl object-cover" src={item.media_url} alt={item.alt_text || ""} />)}
        {media.filter((item) => item.media_type === "embed" && (item.media_url.startsWith("https://www.youtube-nocookie.com/embed/") || item.media_url.startsWith("https://player.vimeo.com/video/"))).map((item) => <iframe key={item.media_url} className="mb-4 aspect-video w-full rounded-3xl" src={item.media_url} title="Embedded video" allowFullScreen />)}
        <Prose text={String(post.body)} />
        {tags.length ? <p className="mt-3 text-sm">{tags.map((tag) => <Link key={tag} className="mr-2 font-semibold" href={localePath(locale, `/topics/${tag}`)}>#{tag}</Link>)}</p> : null}
        {poll ? <ul className="mt-4 space-y-2">{poll.options.map((option) => <li key={option.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 dark:bg-white/5"><span>{option.text}</span><span className="text-sm">{option.votes}</span>{user && !poll.voted ? <form action={voteAction}><HiddenLocale locale={locale} /><input type="hidden" name="option" value={option.id} /><input type="hidden" name="return" value={back} /><button className={button}>Vote</button></form> : poll.voted === option.id ? <span className="text-sm font-semibold">Your vote</span> : null}</li>)}</ul> : null}
        {user ? <div className="mt-4 flex flex-wrap gap-2">{(["like", "useful", "support"] as const).map((kind) => { const mine = post.reaction === kind; const count = Number((post.reactionCounts as Record<string, number> | undefined)?.[kind] || 0); const label = mine ? (kind === "like" ? "Liked" : kind === "useful" ? "Marked useful" : "Supported") : (kind === "like" ? "Like" : kind === "useful" ? "Useful" : "Support"); return <form key={kind} action={reactionAction}><HiddenLocale locale={locale} /><input type="hidden" name="id" value={slug} /><input type="hidden" name="return" value={back} /><button className={button} name="reaction" value={kind} aria-pressed={mine}>{label}{count ? ` · ${count}` : ""}</button></form>; })}</div> : null}
        <CommentBox locale={locale} kind="post" id={slug} back={back} user={Boolean(user)} />
        <ul className="mt-4 space-y-2">{(post.comments as Array<{ id: string; parent_id: string | null; body: string; display_name: string }>).map((comment) => <li key={comment.id} className="rounded-2xl bg-white p-3 dark:bg-white/5">{comment.parent_id ? <span className="text-xs uppercase">Reply</span> : null}<p><strong>{comment.display_name}</strong> {comment.body}</p>{user ? <form action={commentAction} className="mt-2 flex gap-2"><HiddenLocale locale={locale} /><input type="hidden" name="kind" value="post" /><input type="hidden" name="id" value={slug} /><input type="hidden" name="parent" value={comment.id} /><input type="hidden" name="return" value={back} /><input name="body" required className={control} placeholder="Reply" /><button className={button}>Reply</button></form> : null}</li>)}</ul>
      </article>
    );
  }
  if (section === "podcasts") {
    const show = getPodcast(slug);
    if (!show) notFound();
    const episodes = show.episodes as Array<Record<string, unknown>>;
    return <div><PageIntro locale={locale} title={String(show.title)} summary={String(show.description)} />{show.is_demo ? <p className="mb-4 text-sm font-semibold uppercase">{t(locale, "demo")}</p> : null}{episodes.map((episode) => <article key={String(episode.id)} className="mb-4 rounded-3xl bg-white p-5 dark:bg-white/5"><h2 className="font-serif text-2xl">{String(episode.title)}</h2><p className="my-2 text-sm">{String(episode.description)}</p>{episode.audio_url ? <audio controls src={String(episode.audio_url)} className="w-full" /> : null}{episode.transcript ? <p className="mt-3 text-sm text-muted">{String(episode.transcript)}</p> : null}</article>)}</div>;
  }
  if (section === "tv") {
    const video = getVideo(slug);
    if (!video?.embed) notFound();
    const embed = videoEmbed(String(video.video_provider), String(video.video_provider_id));
    return <div><PageIntro locale={locale} title={String(video.title)} summary={String(video.description)} />{embed ? <iframe className="aspect-video w-full rounded-3xl" src={embed} title={String(video.title)} allowFullScreen /> : null}</div>;
  }
  if (section === "business") {
    const business = getBusiness(slug);
    if (!business) notFound();
    const latitude = Number(business.latitude);
    const longitude = Number(business.longitude);
    const mapped = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0);
    return <div><PageIntro locale={locale} title={String(business.name)} summary={String(business.description)} />{business.verification_status !== "verified" ? <p>{t(locale, "unverified")}</p> : null}<p className="mt-2 text-sm">{hoursLabel(business.hours as Array<{ weekday: number; opening_time: string; closing_time: string }>)}</p>{business.place_name ? <p className="mt-2 text-sm">{String(business.place_name)}</p> : null}<p className="mt-2">{String(business.phone || "")}</p>{mapped ? <p className="mt-2"><a className="font-semibold text-[#1d4e89]" href={`https://www.openstreetmap.org/directions?to=${latitude}%2C${longitude}`}>Directions</a></p> : null}{user ? <form action={bookmarkAction} className="mt-3"><HiddenLocale locale={locale} /><input type="hidden" name="type" value="business" /><input type="hidden" name="id" value={String(business.id)} /><input type="hidden" name="return" value={localePath(locale, `/business/${slug}`)} /><button className={button}>{t(locale, "bookmark")}</button></form> : null}{user ? <form action={enquiryAction} className="mt-4 max-w-xl space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="kind" value="business" /><input type="hidden" name="id" value={String(business.id)} /><input type="hidden" name="return" value={localePath(locale, `/business/${slug}`)} /><textarea name="message" required className={control} /><button className={button}>{t(locale, "send")}</button></form> : null}</div>;
  }
  if (section === "marketplace") {
    const product = getProduct(slug);
    if (!product) notFound();
    return (
      <div>
        <Notice error={query.error} notice={query.notice} />
        <PageIntro locale={locale} title={String(product.title)} summary={String(product.description)} disclaimer={t(locale, "disclaimer.payments")} />
        <p className="font-serif text-3xl"><Money cents={Number(product.price_cents)} /></p>
        <div className="mt-4 grid gap-3">{(product.images as Array<{ image_url: string }>).map((image) => <Still key={image.image_url} src={image.image_url} alt={String(product.title)} />)}</div>
        {user ? <form action={orderAction} className="mt-4 max-w-md space-y-3"><HiddenLocale locale={locale} /><input type="hidden" name="id" value={String(product.id)} /><input type="hidden" name="slug" value={slug} /><Field label={t(locale, "price")}><input className={control} name="quantity" defaultValue="1" /></Field><button className={button}>{t(locale, "order")}</button></form> : <Link href={localePath(locale, "/auth/sign-in")}>{t(locale, "signIn")}</Link>}
        {user ? <form action={enquiryAction} className="mt-4 max-w-xl space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="kind" value="product" /><input type="hidden" name="id" value={String(product.id)} /><input type="hidden" name="return" value={localePath(locale, `/marketplace/${slug}`)} /><textarea name="message" className={control} required placeholder={t(locale, "description")} /><button className={button}>{t(locale, "send")}</button></form> : null}
      </div>
    );
  }
  if (section === "jobs") {
    const job = get<Record<string, unknown>>("SELECT * FROM jobs WHERE id = ? AND status = 'published'", slug);
    if (!job) notFound();
    const destination = get<{ destination_url: string | null }>("SELECT destination_url FROM job_verifications WHERE job_id = ? AND destination_url IS NOT NULL ORDER BY checked_at DESC LIMIT 1", slug);
    return <div><Notice error={query.error} /><PageIntro locale={locale} title={String(job.title)} summary={String(job.description)} /><p className="text-sm uppercase text-emerald">{String(job.job_type)}</p><p className="mt-2 text-sm">{job.closing_date ? `Closes ${String(job.closing_date).slice(0, 10)}` : "No closing date is recorded."}</p>{destination?.destination_url ? <p className="mt-2"><a className="font-semibold text-[#1d4e89]" href={destination.destination_url} rel="noopener noreferrer">Open the application page</a></p> : null}<p className="mt-3 max-w-xl text-sm">Do not pay a fee to apply. Report this vacancy if the employer asks for money or banking details.</p>{user ? <form action={bookmarkAction} className="mt-3"><HiddenLocale locale={locale} /><input type="hidden" name="type" value="job" /><input type="hidden" name="id" value={slug} /><input type="hidden" name="return" value={localePath(locale, `/jobs/${slug}`)} /><button className={button}>{t(locale, "bookmark")}</button></form> : null}{user ? <form action={cityDeskAction} className="mt-3 max-w-xl space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="report-vacancy" /><input type="hidden" name="return" value={`/jobs/${slug}`} /><input type="hidden" name="id" value={slug} /><textarea name="reason" required className={control} placeholder="What looks wrong" /><button className={button}>Report vacancy</button></form> : null}{user ? <form action={applyAction} className="mt-4 max-w-xl space-y-3"><HiddenLocale locale={locale} /><input type="hidden" name="id" value={slug} /><Field label="Cover letter"><textarea name="coverLetter" className={control} rows={5} required /></Field><Field label="CV PDF"><input name="cv" type="file" accept="application/pdf" /></Field><button className={button}>{t(locale, "apply")}</button></form> : null}</div>;
  }
  if (section === "learn") {
    const course = getCourse(slug, user?.id);
    if (!course) notFound();
    const quizzes = course.quizzes as Array<{ id: string; title: string }>;
    const lessons = course.lessons as Array<{ id: string; title: string; content_text?: string }>;
    const enrolled = Boolean(course.enrolment);
    return (
      <div>
        <Notice error={query.error} notice={query.notice} />
        <PageIntro locale={locale} title={String(course.title)} summary={String(course.description)} disclaimer={t(locale, "disclaimer.learn")} />
        <p>{Number(course.price_cents) ? <Money cents={Number(course.price_cents)} /> : t(locale, "free")}</p>
        <ul className="mt-4 space-y-4">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="rounded-2xl bg-white p-4 dark:bg-white/5">
              <h2 className="font-serif text-2xl">{lesson.title}</h2>
              {enrolled && lesson.content_text ? <p className="mt-2 whitespace-pre-wrap">{lesson.content_text}</p> : null}
              {enrolled ? <form action={lessonAction} className="mt-3"><HiddenLocale locale={locale} /><input type="hidden" name="id" value={lesson.id} /><input type="hidden" name="slug" value={slug} /><button className={button}>{t(locale, "save")}</button></form> : null}
            </li>
          ))}
        </ul>
        {user ? <form action={enrolAction} className="mt-4"><HiddenLocale locale={locale} /><input type="hidden" name="id" value={String(course.id)} /><input type="hidden" name="slug" value={slug} /><button className={button}>{t(locale, "enrol")}</button></form> : null}
        {enrolled ? <form action={certificateAction} className="mt-4"><HiddenLocale locale={locale} /><input type="hidden" name="id" value={String(course.id)} /><input type="hidden" name="slug" value={slug} /><button className={button}>{t(locale, "certificate")}</button></form> : null}
        {quizzes.map((quiz) => <Quiz key={quiz.id} id={quiz.id} title={quiz.title} locale={locale} slug={slug} enrolled={enrolled} />)}
      </div>
    );
  }
  if (section === "events") {
    const event = listEvents().find((item) => item.slug === slug || item.id === slug);
    if (!event) notFound();
    const types = all<{ id: string; ticket_type: string; price_cents: number; capacity: number; reserved_count: number }>("SELECT id, ticket_type, price_cents, capacity, reserved_count FROM event_tickets WHERE event_id = ?", event.id);
    return <div><Notice error={query.error} /><PageIntro locale={locale} title={String(event.title)} summary={String(event.description)} /><p><When locale={locale} value={String(event.start_at)} /> · {String(event.venue || "")}</p>{types.length ? <ul className="mt-4 space-y-2">{types.map((ticket) => <li key={ticket.id} className="text-sm">{ticket.ticket_type} · <Money cents={ticket.price_cents} />{ticket.capacity ? ` · ${Math.max(ticket.capacity - ticket.reserved_count, 0)} listed as available` : ""}</li>)}</ul> : <p className="mt-3 text-sm">No ticket type is listed. Registering interest is not a ticket.</p>}{user && types.length ? <form action={ticketOrderAction} className="mt-4 flex flex-wrap gap-2"><HiddenLocale locale={locale} /><select name="ticket" className={control}>{types.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.ticket_type}</option>)}</select><input name="quantity" type="number" min={1} max={8} defaultValue={1} className="w-20 rounded-full border px-3 py-2" /><button className={button}>Reserve unpaid</button></form> : null}<div className="mt-4 flex flex-wrap gap-3">{user ? <form action={attendAction}><HiddenLocale locale={locale} /><input type="hidden" name="id" value={String(event.id)} /><input type="hidden" name="slug" value={slug} /><button className={button}>{t(locale, "register.event")}</button></form> : null}{user ? <form action={bookmarkAction}><HiddenLocale locale={locale} /><input type="hidden" name="type" value="event" /><input type="hidden" name="id" value={String(event.id)} /><input type="hidden" name="return" value={localePath(locale, `/events/${slug}`)} /><button className={button}>{t(locale, "bookmark")}</button></form> : null}</div></div>;
  }
  if (section === "creators") {
    const post = getCreatorPost(slug);
    if (!post) notFound();
    return (
      <article>
        <PageIntro locale={locale} kicker={String(post.display_name)} title={String(post.title)} summary={String(post.content_type)} />
        {post.sponsored ? <p className="mb-3 text-sm font-semibold uppercase text-emerald">Sponsored · {String(post.sponsor_label)}</p> : null}
        <Prose text={String(post.body)} />
        {user ? <form action={deskAction} className="mt-4"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="follow-creator" /><input type="hidden" name="id" value={String(post.creator_id)} /><input type="hidden" name="return" value={localePath(locale, `/creators/${slug}`)} /><button className={button}>{t(locale, "follow")}</button></form> : null}
      </article>
    );
  }
  const key = moduleKeyForSection(section);
  if (!key) notFound();
  const record = getRecord(key, slug);
  if (!record) notFound();
  return (
    <div>
      <Notice error={query.error} notice={query.notice} />
      <PageIntro locale={locale} title={String(record.title || record.name)} summary={String(record.description || "")} disclaimer={meta.disclaimerKey ? t(locale, meta.disclaimerKey) : undefined} />
      {section === "notices" ? <p className="text-sm">{String(record.notice_type || "Notice")} · {record.expires_at ? `Valid until ${String(record.expires_at).slice(0, 16)}` : "No expiry recorded"}</p> : null}
      {record.price_cents ? <p className="text-2xl"><Money cents={Number(record.price_cents)} /></p> : null}
      {record.goal_cents ? <p>{t(locale, "pledge")}: <Money cents={Number(record.goal_cents)} /></p> : null}
      {section === "food" ? <Menu placeId={slug} locale={locale} owner={user?.id === record.owner_id} /> : null}
      {section === "sports" ? <Club teamId={slug} teamName={String(record.name)} locale={locale} owner={user?.id === record.owner_id} /> : null}
      <RecordActions locale={locale} section={section} id={slug} user={Boolean(user)} />
    </div>
  );
}

function Menu({ placeId, locale, owner }: { placeId: string; locale: string; owner: boolean }) {
  const items = listMenu(placeId);
  const back = localePath(locale, `/food/${placeId}`);
  return (
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Menu</h2>
      {items.length ? <ul className="mt-2 space-y-2">{items.map((item) => <li key={String(item.id)} className="flex justify-between rounded-2xl bg-white px-4 py-3 dark:bg-white/5"><span>{String(item.name)}</span><Money cents={Number(item.price_cents)} /></li>)}</ul> : <p className="text-sm text-muted">{t(locale, "empty")}</p>}
      {owner ? <form action={deskAction} className="mt-4 max-w-md space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="menu" /><input type="hidden" name="id" value={placeId} /><input type="hidden" name="return" value={back} /><input name="name" required className={control} placeholder="Dish" /><input name="price" required className={control} placeholder="45.00" /><button className={button}>{t(locale, "save")}</button></form> : null}
    </section>
  );
}

function Club({ teamId, teamName, locale, owner }: { teamId: string; teamName: string; locale: string; owner: boolean }) {
  const players = listPlayers(teamId);
  const fixtures = listFixtures().filter((item) => item.home_name === teamName || item.away_name === teamName);
  const back = localePath(locale, `/sports/${teamId}`);
  return (
    <section className="mt-6 space-y-4">
      <h2 className="font-serif text-2xl">Players</h2>
      {players.length ? <ul>{players.map((player) => <li key={String(player.id)}>{String(player.name)} {player.position ? `· ${String(player.position)}` : ""}</li>)}</ul> : <p className="text-sm text-muted">{t(locale, "empty")}</p>}
      {owner ? <form action={deskAction} className="max-w-md space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="player" /><input type="hidden" name="id" value={teamId} /><input type="hidden" name="return" value={back} /><input name="name" required className={control} placeholder="Player" /><input name="position" className={control} placeholder="Position" /><button className={button}>{t(locale, "save")}</button></form> : null}
      <h2 className="font-serif text-2xl">Fixtures</h2>
      <ul className="space-y-2">{fixtures.slice(0, 8).map((fixture) => <li key={String(fixture.id)}>{String(fixture.home_name)} {fixture.home_score == null ? "" : String(fixture.home_score)}–{fixture.away_score == null ? "" : String(fixture.away_score)} {String(fixture.away_name)}</li>)}</ul>
    </section>
  );
}

function CommentBox({ locale, kind, id, back, user }: { locale: string; kind: string; id: string; back: string; user: boolean }) {
  if (!user) return <p className="mt-8"><Link href={localePath(locale, "/auth/sign-in")}>{t(locale, "signIn")}</Link></p>;
  return <form action={commentAction} className="mt-8 max-w-xl space-y-3"><HiddenLocale locale={locale} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><textarea name="body" required className={control} rows={4} placeholder={t(locale, "comment.placeholder")} /><button className={button}>{t(locale, "send")}</button></form>;
}

function ReportBox({ locale, type, id, back, user }: { locale: string; type: string; id: string; back: string; user: boolean }) {
  if (!user) return null;
  return <form action={reportAction} className="mt-6 max-w-xl space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><Field label={t(locale, "report.reason")}><input name="reason" className={control} required /></Field><button className={button}>{t(locale, "report")}</button></form>;
}

function RecordActions({ locale, section, id, user }: { locale: string; section: string; id: string; user: boolean }) {
  if (!user) return null;
  const back = localePath(locale, `/${section}/${id}`);
  if (section === "voice") return <form action={simpleAction} className="mt-4"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="sign-petition" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><button className={button}>{t(locale, "sign.petition")}</button></form>;
  if (section === "support") return <form action={simpleAction} className="mt-4 flex gap-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="pledge" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><input name="amount" className={control} placeholder="50.00" /><button className={button}>{t(locale, "pledge")}</button></form>;
  if (section === "services") return <form action={simpleAction} className="mt-4 space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="quote" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><textarea name="message" className={control} required /><button className={button}>{t(locale, "quote")}</button></form>;
  if (section === "competitions") return <form action={simpleAction} className="mt-4 space-y-2"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="enter" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><textarea name="answer" className={control} /><button className={button}>{t(locale, "submit")}</button></form>;
  if (section === "deals") return <form action={simpleAction} className="mt-4"><HiddenLocale locale={locale} /><input type="hidden" name="intent" value="save-deal" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} /><button className={button}>{t(locale, "bookmark")}</button></form>;
  if (section === "property" && user) return (
    <div className="mt-4 space-y-3">
      <form action={propertyVisitAction} className="flex flex-wrap gap-2">
        <HiddenLocale locale={locale} /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} />
        <input type="datetime-local" name="when" required className={control} /><input name="note" placeholder="Note" className={control} /><button className={button}>Request a viewing</button>
      </form>
      <form action={propertyVisitAction} className="flex flex-wrap gap-2">
        <HiddenLocale locale={locale} /><input type="hidden" name="intent" value="stay" /><input type="hidden" name="id" value={id} /><input type="hidden" name="return" value={back} />
        <input type="date" name="arrive" required className={control} /><input type="date" name="depart" required className={control} /><button className={button}>Request a stay</button>
      </form>
    </div>
  );
  return null;
}

function Quiz({ id, title, locale, slug, enrolled }: { id: string; title: string; locale: string; slug: string; enrolled: boolean }) {
  const questions = publicQuiz(id);
  return (
    <section className="mt-6 rounded-3xl bg-white p-5 dark:bg-white/5">
      <h2 className="font-serif text-2xl">{title}</h2>
      {enrolled ? (
        <form action={quizAction} className="mt-3 space-y-4">
          <HiddenLocale locale={locale} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="count" value={String(questions.length)} />
          <ol className="list-decimal space-y-3 pl-5">
            {questions.map((question, index) => (
              <li key={question.id}>
                <p>{question.prompt}</p>
                {question.options.map((option, optionIndex) => (
                  <label key={option} className="mt-1 flex gap-2 text-sm"><input type="radio" name={`answer${index}`} value={String(optionIndex)} required />{option}</label>
                ))}
              </li>
            ))}
          </ol>
          <button className={button}>{t(locale, "submit")}</button>
        </form>
      ) : <p className="mt-2 text-sm text-muted">{t(locale, "enrol")}</p>}
    </section>
  );
}

function Related({ locale, category, articleId, newsId }: { locale: string; category: string; articleId?: string; newsId?: string }) {
  const items = category ? relatedStories(category, { articleId, newsId }) : [];
  if (!items.length) return <p className="mt-6 text-sm">No other published story is in this category.</p>;
  return (
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Related</h2>
      <ul className="mt-2 space-y-2">{items.map((item) => <li key={item.href} className="text-sm"><Link className="font-semibold" href={localePath(locale, item.href)}>{item.title}</Link> · {item.source}</li>)}</ul>
    </section>
  );
}

function hoursLabel(hours: Array<{ weekday: number; opening_time: string; closing_time: string }> | undefined): string {
  const rows = hours || [];
  const state = openNow(rows);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const clock = rows.map((row) => `${names[row.weekday] || row.weekday} ${row.opening_time}–${row.closing_time}`).join(", ");
  if (state === "unknown") return "Opening hours have not been recorded. Saved hours use Africa/Johannesburg.";
  return `${state === "open" ? "Open now" : "Closed now"} (Africa/Johannesburg). ${clock}`;
}

function TranslationDesk({ locale, articleId, back }: { locale: string; articleId: string; back: string }) {
  return (
    <form action={translationAction} className="mt-6 max-w-xl space-y-2">
      <h2 className="font-serif text-2xl">Language draft</h2>
      <p className="text-sm">An Afrikaans or Setswana draft stays unpublished until an editor approves it. Wire stories are not translated here.</p>
      <HiddenLocale locale={locale} />
      <input type="hidden" name="id" value={articleId} />
      <input type="hidden" name="return" value={back} />
      <select name="language" className={control}><option value="af">Afrikaans</option><option value="tn">Setswana</option></select>
      <input name="title" required placeholder="Title" className={control} />
      <textarea name="excerpt" required placeholder="Excerpt" className={control} />
      <textarea name="body" required placeholder="Full article" className={control} rows={6} />
      <button className={button}>Save draft</button>
    </form>
  );
}
