PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT,
  email_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  is_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  location_type TEXT NOT NULL,
  parent_location_id TEXT REFERENCES locations(id),
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  cover_url TEXT,
  website_url TEXT,
  biography TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  location_id TEXT REFERENCES locations(id),
  visibility TEXT NOT NULL DEFAULT 'public',
  date_of_birth TEXT,
  guardian_consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  self_serve INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  permission_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS role_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  theme TEXT NOT NULL DEFAULT 'light',
  language TEXT NOT NULL DEFAULT 'en',
  notification_settings TEXT NOT NULL DEFAULT '{}',
  privacy_settings TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id TEXT NOT NULL REFERENCES users(id),
  followed_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  consent_type TEXT NOT NULL,
  version TEXT NOT NULL,
  granted INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS article_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES article_categories(id),
  description TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL REFERENCES article_categories(id),
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  editorial_review_status TEXT NOT NULL DEFAULT 'unreviewed',
  featured_image TEXT,
  published_at TEXT,
  scheduled_for TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS article_translations (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  language_code TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL,
  UNIQUE (article_id, language_code)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE IF NOT EXISTS article_sources (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  source_name TEXT NOT NULL,
  source_url TEXT,
  attribution TEXT
);

CREATE TABLE IF NOT EXISTS article_images (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  image_url TEXT NOT NULL,
  caption TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS article_revisions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  editor_id TEXT REFERENCES users(id),
  revision_type TEXT NOT NULL,
  revision_content TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES article_comments(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  post_type TEXT NOT NULL DEFAULT 'update',
  body TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'published',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);

CREATE TABLE IF NOT EXISTS post_mentions (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  mentioned_user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (post_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS post_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reaction_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES post_comments(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS community_polls (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE REFERENCES community_posts(id),
  question TEXT NOT NULL,
  closes_at TEXT
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES community_polls(id),
  option_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES community_polls(id),
  option_id TEXT NOT NULL REFERENCES poll_options(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS podcasts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  artwork_url TEXT,
  programme_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id TEXT PRIMARY KEY,
  podcast_id TEXT NOT NULL REFERENCES podcasts(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  audio_url TEXT,
  video_url TEXT,
  transcript TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  artwork_url TEXT,
  download_allowed INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (podcast_id, slug)
);

CREATE TABLE IF NOT EXISTS video_channels (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES video_channels(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  video_provider TEXT NOT NULL,
  video_provider_id TEXT NOT NULL,
  thumbnail_url TEXT,
  captions_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  published_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS radio_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  stream_url TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  rights_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS radio_programmes (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES radio_stations(id),
  title TEXT NOT NULL,
  description TEXT,
  presenter_id TEXT REFERENCES users(id),
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE IF NOT EXISTS song_requests (
  id TEXT PRIMARY KEY,
  programme_id TEXT REFERENCES radio_programmes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  artist_name TEXT NOT NULL,
  song_title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS music_submissions (
  id TEXT PRIMARY KEY,
  artist_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  rights_confirmed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_playback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  media_type TEXT NOT NULL,
  media_id TEXT NOT NULL,
  progress_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, media_type, media_id)
);

CREATE TABLE IF NOT EXISTS media_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  media_type TEXT NOT NULL,
  media_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, media_type, media_id)
);

CREATE TABLE IF NOT EXISTS media_likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  media_type TEXT NOT NULL,
  media_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, media_type, media_id)
);

CREATE TABLE IF NOT EXISTS media_comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  media_type TEXT NOT NULL,
  media_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS talent_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  talent_category TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  biography TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  availability_status TEXT NOT NULL DEFAULT 'available',
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS talent_portfolio (
  id TEXT PRIMARY KEY,
  talent_profile_id TEXT NOT NULL REFERENCES talent_profiles(id),
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auditions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  location_id TEXT REFERENCES locations(id),
  closing_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audition_applications (
  id TEXT PRIMARY KEY,
  audition_id TEXT NOT NULL REFERENCES auditions(id),
  applicant_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  UNIQUE (audition_id, applicant_id)
);

CREATE TABLE IF NOT EXISTS talent_competitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rules TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS talent_entries (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES talent_competitions(id),
  talent_profile_id TEXT NOT NULL REFERENCES talent_profiles(id),
  entry_url TEXT,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (competition_id, talent_profile_id)
);

CREATE TABLE IF NOT EXISTS talent_votes (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES talent_entries(id),
  voter_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (entry_id, voter_id)
);

CREATE TABLE IF NOT EXISTS business_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES business_categories(id)
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category_id TEXT REFERENCES business_categories(id),
  location_id TEXT REFERENCES locations(id),
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS business_images (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS business_hours (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  weekday INTEGER NOT NULL,
  opening_time TEXT NOT NULL,
  closing_time TEXT NOT NULL,
  UNIQUE (business_id, weekday)
);

CREATE TABLE IF NOT EXISTS business_reviews (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  UNIQUE (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS business_enquiries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  from_user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  conversation_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advertising_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  placement TEXT NOT NULL UNIQUE,
  pricing_model TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  product_id TEXT NOT NULL REFERENCES advertising_products(id),
  title TEXT NOT NULL,
  destination_url TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  budget_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'draft',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advertising_creatives (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id),
  media_url TEXT NOT NULL,
  destination_url TEXT,
  alt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS advertising_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsorships (
  id TEXT PRIMARY KEY,
  sponsor_business_id TEXT REFERENCES businesses(id),
  sponsor_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'proposed',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES marketplace_categories(id)
);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  display_name TEXT NOT NULL,
  biography TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT REFERENCES marketplace_categories(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  condition TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  listing_status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marketplace_favourites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  list_type TEXT NOT NULL DEFAULT 'favourite',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, product_id, list_type)
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_enquiries (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  conversation_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  order_status TEXT NOT NULL DEFAULT 'placed',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  fulfilment TEXT NOT NULL DEFAULT 'collection',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES marketplace_orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending',
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  payload_reference TEXT,
  processing_status TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES marketplace_orders(id),
  opened_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  job_type TEXT NOT NULL,
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  location_id TEXT REFERENCES locations(id),
  closing_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  applicant_id TEXT NOT NULL REFERENCES users(id),
  cv_url TEXT,
  cover_letter TEXT NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (job_id, applicant_id)
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  headline TEXT,
  skills TEXT,
  experience TEXT,
  education TEXT,
  cv_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  keywords TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT REFERENCES course_categories(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'draft',
  accredited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_text TEXT,
  content_url TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_enrolments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  enrolment_status TEXT NOT NULL DEFAULT 'active',
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS course_progress (
  id TEXT PRIMARY KEY,
  enrolment_id TEXT NOT NULL REFERENCES course_enrolments(id),
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
  completed_at TEXT NOT NULL,
  UNIQUE (enrolment_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS course_assessments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  pass_mark INTEGER NOT NULL DEFAULT 70,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id),
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_results (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_certificates (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  certificate_number TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS tutors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subjects TEXT NOT NULL,
  biography TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  venue TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  ticket_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS event_tickets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  ticket_type TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  capacity INTEGER NOT NULL DEFAULT 0,
  reserved_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  ticket_id TEXT REFERENCES event_tickets(id),
  registration_status TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL,
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  agent_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  listing_type TEXT NOT NULL,
  property_type TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  location_id TEXT REFERENCES locations(id),
  area_label TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS property_images (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_places (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS food_menu_items (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES food_places(id),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS food_reviews (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES food_places(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  UNIQUE (place_id, user_id)
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  ingredients TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sports_teams (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sports_players (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES sports_teams(id),
  name TEXT NOT NULL,
  position TEXT,
  biography TEXT,
  status TEXT NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS sports_fixtures (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES sports_teams(id),
  away_team_id TEXT NOT NULL REFERENCES sports_teams(id),
  venue TEXT,
  location_id TEXT REFERENCES locations(id),
  start_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sports_results (
  id TEXT PRIMARY KEY,
  fixture_id TEXT NOT NULL UNIQUE REFERENCES sports_fixtures(id),
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  summary TEXT,
  recorded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS youth_opportunities (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS support_campaigns (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  goal_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  location_id TEXT REFERENCES locations(id),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES support_campaigns(id),
  donor_id TEXT REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pledged',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volunteer_opportunities (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  slots INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS volunteer_signups (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES volunteer_opportunities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'signed_up',
  created_at TEXT NOT NULL,
  UNIQUE (opportunity_id, user_id)
);

CREATE TABLE IF NOT EXISTS traffic_reports (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  report_kind TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  severity TEXT NOT NULL DEFAULT 'info',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS transport_services (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  phone TEXT,
  location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tourism_listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  area_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS health_providers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  description TEXT NOT NULL,
  phone TEXT,
  location_id TEXT REFERENCES locations(id),
  review_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS petitions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS petition_signatures (
  id TEXT PRIMARY KEY,
  petition_id TEXT NOT NULL REFERENCES petitions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (petition_id, user_id)
);

CREATE TABLE IF NOT EXISTS civic_reports (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS public_questions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  answer TEXT,
  answered_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deal_type TEXT NOT NULL,
  price_cents INTEGER,
  was_price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  code TEXT,
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS saved_deals (
  user_id TEXT NOT NULL REFERENCES users(id),
  deal_id TEXT NOT NULL REFERENCES deals(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rules TEXT NOT NULL,
  prize TEXT NOT NULL,
  kind TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'entered',
  created_at TEXT NOT NULL,
  UNIQUE (competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS competition_winners (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  entry_id TEXT NOT NULL REFERENCES giveaway_entries(id),
  announced_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS heritage_items (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  period TEXT,
  location_id TEXT REFERENCES locations(id),
  image_url TEXT,
  comparison_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS heritage_contributions (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES heritage_items(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  phone TEXT,
  location_id TEXT REFERENCES locations(id),
  availability TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS service_reviews (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES service_providers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  UNIQUE (provider_id, user_id)
);

CREATE TABLE IF NOT EXISTS quotation_requests (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES service_providers(id),
  requester_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agriculture_listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  listing_kind TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS faith_organisations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  tradition TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  service_times TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS family_resources (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS childcare_listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS technology_organisations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  focus TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  website TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS public_notices (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  notice_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  consent_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT,
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name TEXT NOT NULL,
  biography TEXT NOT NULL,
  channel_slug TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creator_posts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_url TEXT,
  sponsored INTEGER NOT NULL DEFAULT 0,
  sponsor_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES users(id),
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (subscriber_id, creator_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  conversation_type TEXT NOT NULL,
  subject TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  message_body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  attachment_url TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_url TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, channel, category)
);

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  channel TEXT NOT NULL DEFAULT 'in_app',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, category, channel, location_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_moderator TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  moderator_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  translated_content TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL,
  UNIQUE (resource_type, resource_id, language_code)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT,
  public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS map_points (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_id TEXT REFERENCES locations(id),
  author_id TEXT REFERENCES users(id),
  source_name TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  moderation_status TEXT NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  location_name TEXT,
  popularity INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  UNIQUE (entity_type, entity_id, language_code)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefing_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  interests_json TEXT NOT NULL DEFAULT '[]',
  channel TEXT NOT NULL DEFAULT 'in_app',
  delivery_hour INTEGER NOT NULL DEFAULT 7,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS briefing_editions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  edition_date TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, edition_date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action_key TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards_offers (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards_redemptions (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES rewards_offers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  points_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON community_posts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(listing_status, published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(status, start_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_search_type ON search_documents(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_map_moderation ON map_points(moderation_status, verification_status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
