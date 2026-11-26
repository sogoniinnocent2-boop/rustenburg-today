import { redirect } from "next/navigation";
import { localePath, t } from "@/lib/i18n";
import { sectionBySlug } from "@/lib/sections";
import { Field, HiddenLocale, Notice, PageIntro, button, control } from "@/components/chrome";
import { newsCategories } from "@/server/editorial";
import { adProducts, businessCategories, marketplaceCategories } from "@/server/commerce";
import { moduleByKey, moduleKeyForSection } from "@/server/city";
import { all } from "@/server/db";
import { currentUser } from "@/server/session";
import { businessAction, campaignAction, courseAction, deskAction, eventAction, jobAction, newsAction, postAction, productAction, recordAction, simpleAction } from "@/server/actions";

export default async function NewPage({ params, searchParams }: { params: Promise<{ locale: string; section: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale, section } = await params;
  const query = await searchParams;
  const meta = sectionBySlug(section);
  if (!meta) redirect(localePath(locale));
  const user = await currentUser();
  if (!user) redirect(`${localePath(locale, "/auth/sign-in")}?next=/${section}/new`);
  const moduleKey = moduleKeyForSection(section);
  return (
    <div className="max-w-2xl">
      <PageIntro locale={locale} title={`${t(locale, "create")} · ${t(locale, meta.titleKey)}`} summary={t(locale, meta.summaryKey)} disclaimer={meta.disclaimerKey ? t(locale, meta.disclaimerKey) : undefined} />
      <Notice error={query.error} />
      {section === "news" ? <NewsForm locale={locale} /> : null}
      {section === "community" ? <PostForm locale={locale} /> : null}
      {section === "jobs" ? <JobForm locale={locale} /> : null}
      {section === "business" ? <BusinessForm locale={locale} /> : null}
      {section === "marketplace" ? <ProductForm locale={locale} /> : null}
      {section === "advertising" ? <AdForm locale={locale} /> : null}
      {section === "learn" ? <CourseForm locale={locale} /> : null}
      {section === "events" ? <EventForm locale={locale} /> : null}
      {section === "podcasts" || section === "tv" || section === "music" || section === "talent" || section === "radio" ? <MediaForm locale={locale} section={section} /> : null}
      {section === "creators" ? <form action={deskAction} className="space-y-3">{common(locale)}<input type="hidden" name="intent" value="creator" /><input type="hidden" name="return" value={localePath(locale, "/creators")} /><Field label={t(locale, "title")}><input name="title" required className={control} /></Field><Field label={t(locale, "description")}><textarea name="body" required className={control} rows={6} /></Field><Field label={t(locale, "category")}><select name="contentType" className={control}><option value="note">Note</option><option value="article">Article</option><option value="photo">Photo</option><option value="video">Video link</option></select></Field><label className="flex gap-2 text-sm"><input type="checkbox" name="sponsored" value="yes" />Sponsored</label><Field label="Sponsor label"><input name="sponsor" className={control} /></Field><button className={button}>{t(locale, "submit")}</button></form> : null}
      {moduleKey ? <ModuleForm locale={locale} section={section} moduleKey={moduleKey} /> : null}
    </div>
  );
}

function NewsForm({ locale }: { locale: string }) {
  return (
    <form action={newsAction} className="space-y-3">
      {common(locale)}
      <Field label={t(locale, "category")}>
        <select name="category" className={control}>
          {newsCategories().map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Department">
        <select name="department" className={control} defaultValue="news">
          {["news", "community", "sports", "learn", "business", "health", "transport", "voice", "jobs", "agriculture", "notices", "events"].map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t(locale, "language")}>
        <select name="language" className={control} defaultValue={locale}>
          <option value="en">English</option>
          <option value="tn">Setswana</option>
          <option value="af">Afrikaans</option>
        </select>
      </Field>
      <Field label={t(locale, "title")}>
        <input name="title" className={control} required />
      </Field>
      <Field label="Excerpt">
        <textarea name="excerpt" className={control} required />
      </Field>
      <Field label="Body">
        <textarea name="body" className={control} rows={10} required />
      </Field>
      <Field label="Tags">
        <input name="tags" className={control} placeholder="water, schools, Phokeng" />
      </Field>
      <Field label="SEO title">
        <input name="metaTitle" className={control} />
      </Field>
      <Field label="SEO description">
        <input name="metaDescription" className={control} />
      </Field>
      <Field label="Image">
        <input name="image" type="file" accept="image/*" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button className={button} name="submitReview" value="yes">
          {t(locale, "submit")}
        </button>
        <button className={button} name="publishNow" value="yes">
          {t(locale, "publish")}
        </button>
      </div>
    </form>
  );
}
function PostForm({ locale }: { locale: string }) {
  return (
    <form action={postAction} className="space-y-3">
      {common(locale)}
      <Field label={t(locale, "category")}>
        <select name="postType" className={control}>
          <option value="update">Update</option>
          <option value="discussion">Discussion</option>
          <option value="question">Question</option>
          <option value="article">Article</option>
          <option value="poll">Poll</option>
          <option value="tip">News tip</option>
          <option value="safety_report">Safety report</option>
          <option value="lost_found">Lost and found</option>
        </select>
      </Field>
      <Field label={t(locale, "description")}><textarea name="body" className={control} rows={6} required placeholder="Use #topic to file a hashtag" /></Field>
      <Field label="Poll option"><input name="optionA" className={control} /></Field>
      <Field label="Poll option"><input name="optionB" className={control} /></Field>
      <Field label="Poll option"><input name="optionC" className={control} /></Field>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" value="yes" />I have the right to submit this, and I understand a tip or a sensitive report stays unpublished until the desk reviews it.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="draft" value="yes" />Save as a draft. A draft is not on the public feed.</label>
      <Field label="Photographs, up to four"><input name="image" type="file" accept="image/*" multiple /></Field>
      <Field label="Photograph description"><input name="alt" className={control} placeholder="What the photograph shows" /></Field>
      <Field label="YouTube or Vimeo link"><input name="videoUrl" className={control} placeholder="https://" /></Field>
      <p className="text-sm">One embedded video on this post. It does not open a video feed, and it is not a live broadcast.</p>
      <button className={button}>{t(locale, "publish")}</button>
    </form>
  );
}
function JobForm({ locale }: { locale: string }) {
  return <form action={jobAction} className="space-y-3">{common(locale)}<Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} required /></Field><Field label={t(locale, "category")}><select name="jobType" className={control}>{["full-time", "part-time", "temporary", "casual", "apprenticeship", "internship", "learnership", "mining", "government", "graduate", "remote", "freelance", "youth"].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Closing date"><input name="closing" type="date" className={control} /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function BusinessForm({ locale }: { locale: string }) {
  return <form action={businessAction} className="space-y-3">{common(locale)}<Field label={t(locale, "name")}><input name="name" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} required /></Field><Field label={t(locale, "category")}><select name="category" className={control}>{businessCategories().map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></Field><Field label={t(locale, "phone")}><input name="phone" className={control} /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function ProductForm({ locale }: { locale: string }) {
  return <form action={productAction} className="space-y-3">{common(locale)}<Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} required /></Field><Field label={t(locale, "price")}><input name="price" className={control} required placeholder="250.00" /></Field><Field label="Condition"><select name="condition" className={control}><option value="new">New</option><option value="used">Used</option></select></Field><Field label={t(locale, "category")}><select name="category" className={control}>{marketplaceCategories().map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></Field><Field label="Photo"><input type="file" name="image" accept="image/*" /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function AdForm({ locale }: { locale: string }) {
  return <form action={campaignAction} className="space-y-3">{common(locale)}<Field label="Placement"><select name="placement" className={control}>{adProducts().map((item) => <option key={String(item.placement)} value={String(item.placement)}>{String(item.name)}</option>)}</select></Field><Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label="Destination"><input name="destination" className={control} placeholder="https://" /></Field><Field label="Start"><input type="date" name="start" className={control} required /></Field><Field label="End"><input type="date" name="end" className={control} required /></Field><Field label="Budget (R)"><input name="budget" className={control} required /></Field><Field label="Promotion"><select name="kind" className={control} defaultValue="general"><option value="general">General</option><option value="event">Event</option><option value="business">Business</option><option value="property">Property</option><option value="restaurant">Restaurant or accommodation</option><option value="job">Job</option><option value="marketplace">Marketplace</option><option value="article">Sponsored article</option></select></Field><Field label="Category"><input name="category" className={control} /></Field><Field label="Location"><input name="location" className={control} /></Field><Field label="Hours between popups"><input name="frequency" type="number" min="1" defaultValue="24" className={control} /></Field><Field label="Image description"><input name="alt" className={control} required /></Field><Field label="Creative"><input type="file" name="image" accept="image/*" /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function CourseForm({ locale }: { locale: string }) {
  return <form action={courseAction} className="space-y-3">{common(locale)}<Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} required /></Field><Field label={t(locale, "price")}><input name="price" className={control} placeholder="0" /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function EventForm({ locale }: { locale: string }) {
  return <form action={eventAction} className="space-y-3">{common(locale)}<Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} required /></Field><Field label={t(locale, "category")}><input name="category" className={control} required /></Field><Field label="Start"><input type="datetime-local" name="start" className={control} required /></Field><Field label="Venue"><input name="venue" className={control} /></Field><button className={button}>{t(locale, "submit")}</button></form>;
}
function MediaForm({ locale, section }: { locale: string; section: string }) {
  const intent = section === "tv" ? "video" : section === "music" ? "music" : section === "talent" ? "talent" : section === "radio" ? "song" : "podcast";
  return <form action={simpleAction} className="space-y-3">{common(locale)}<input type="hidden" name="intent" value={intent} /><input type="hidden" name="return" value={localePath(locale, `/${section}`)} /><Field label={t(locale, "title")}><input name="title" className={control} required /></Field><Field label={t(locale, "description")}><textarea name="description" className={control} /><textarea name="biography" className={control} /></Field>{section === "tv" ? <><Field label="Provider"><select name="provider" className={control}><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="mux">Mux</option></select></Field><Field label="Provider id"><input name="providerId" className={control} required /></Field></> : null}{section === "podcasts" ? <Field label="Audio URL"><input name="audioUrl" className={control} /></Field> : null}{section === "music" ? <><Field label="Artist"><input name="artist" className={control} required /></Field><label className="flex gap-2 text-sm"><input type="checkbox" name="rights" value="yes" /> I hold the rights to this recording.</label></> : null}{section === "talent" ? <><Field label="Stage name"><input name="stageName" className={control} required /></Field><Field label={t(locale, "category")}><input name="category" className={control} required /></Field></> : null}{section === "radio" ? <Field label="Artist"><input name="artist" className={control} required /></Field> : null}<button className={button}>{t(locale, "submit")}</button></form>;
}
function ModuleForm({ locale, section, moduleKey }: { locale: string; section: string; moduleKey: string }) {
  const spec = moduleByKey(moduleKey);
  const locations = all<{ slug: string; name: string }>("SELECT slug, name FROM locations WHERE active = 1 ORDER BY name");
  return (
    <form action={recordAction} className="space-y-3">
      {common(locale)}
      <input type="hidden" name="module" value={moduleKey} />
      <input type="hidden" name="section" value={section} />
      {spec.fields.map((field) => (
        <Field key={field.column} label={field.column.replaceAll("_", " ")}>
          {field.type === "textarea" ? <textarea name={field.column} className={control} required={field.required} /> : null}
          {field.type === "select" ? <select name={field.column} className={control}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : null}
          {field.type === "location" ? <select name={field.column} className={control}><option value="">—</option>{locations.map((place) => <option key={place.slug} value={place.slug}>{place.name}</option>)}</select> : null}
          {field.type !== "textarea" && field.type !== "select" && field.type !== "location" ? <input name={field.column} className={control} required={field.required} /> : null}
        </Field>
      ))}
      {spec.consent ? <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" value="yes" /> Consent is confirmed where this notice needs it.</label> : null}
      <button className={button}>{t(locale, "submit")}</button>
    </form>
  );
}
function common(locale: string) {
  return <HiddenLocale locale={locale} />;
}
