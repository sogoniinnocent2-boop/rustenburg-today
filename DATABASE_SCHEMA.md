# Database schema

The executable schema is `src/server/schema.sql`. It is applied on startup and recorded in `schema_migrations` as `0001_init`.

Primary keys are UUID text. Timestamps are ISO-8601 text. Money columns are integers of South African cents. Content tables that people can withdraw use `deleted_at`. Demonstration rows use `is_demo`.

## Groups

- Identity: `users`, `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions`, `role_requests`, `sessions`, `email_tokens`, `consent_records`, `user_preferences`, `user_follows`, `user_blocks`.
- Places: `locations`, with Rustenburg and nearby neighbourhoods seeded as approximate centroids.
- News: `articles`, `article_translations`, `article_categories`, `article_tags`, `article_sources`, `article_revisions`, `article_comments`, `article_corrections`.
- Community: `community_posts`, `post_media`, `post_hashtags`, `post_mentions`, `post_reactions`, `post_comments`, `community_polls`, `poll_options`, `poll_votes`.
- Media: `podcasts`, `podcast_episodes`, `video_channels`, `videos`, `radio_stations`, `radio_programmes`, `song_requests`, `music_submissions`, `media_playback_history`, `media_subscriptions`, `media_likes`, `media_comments`.
- Talent: `talent_profiles`, `talent_portfolio`, `auditions`, `audition_applications`, `talent_competitions`, `competition_entries`, `competition_votes`.
- Business and ads: `businesses`, `business_categories`, `business_hours`, `business_reviews`, `business_enquiries`, `advertising_products`, `advertising_campaigns`, `advertising_creatives`, `advertising_events`, `sponsorships`.
- Marketplace: `marketplace_categories`, `seller_profiles`, `products`, `product_images`, `marketplace_favourites`, `product_reviews`, `marketplace_enquiries`, `marketplace_orders`, `marketplace_order_items`.
- Money: `payments`, `payment_webhook_events`, `refunds`, `disputes`.
- Jobs and learning: `jobs`, `job_applications`, `candidate_profiles`, `job_alerts`, `courses`, `course_lessons`, `course_enrolments`, `course_progress`, `course_assessments`, `assessment_questions`, `course_results`, `course_certificates`, `tutors`.
- City modules: `events`, `event_tickets`, `event_registrations`, `properties`, `property_images`, `food_places`, `food_menu_items`, `food_reviews`, `recipes`, `sports_teams`, `sports_players`, `sports_fixtures`, `sports_results`, `youth_opportunities`, `support_campaigns`, `donations`, `volunteer_opportunities`, `traffic_reports`, `transport_services`, `tourism_listings`, `health_providers`, `petitions`, `petition_signatures`, `civic_reports`, `public_questions`, `deals`, `saved_deals`, `competitions`, `giveaway_entries`, `competition_winners`, `heritage_records`, `service_providers`, `service_reviews`, `quote_requests`, `agriculture_listings`, `faith_organisations`, `family_resources`, `childcare_listings`, `technology_organisations`, `public_notices`, `creator_channels`, `creator_posts`.
- Shared: `conversations`, `conversation_participants`, `messages`, `notifications`, `notification_preferences`, `alert_subscriptions`, `bookmarks`, `content_reports`, `moderation_actions`, `audit_logs`, `translations`, `email_outbox`, `rate_limits`, `uploads`, `map_points`, `search_documents`, `analytics_events`, `background_jobs`, `briefing_preferences`, `push_subscriptions`, `rewards_accounts`, `rewards_ledger`, `rewards_offers`, `rewards_redemptions`, `admin_settings`.

## Access control

SQLite has no row-level security. Every mutation checks the signed-in user and a permission in the service. The API does the same. A future Postgres migration must enable RLS for each table and must not treat the service checks as optional.

Foreign keys are on. Indexes cover slugs, status, author and the search document key.

Tables for menus, fixtures, players, tutors, public questions and creator posts exist. Several of those do not have a dedicated screen yet. See IMPLEMENTATION_STATUS.md.
