# Phase 4 evidence report — Reader experience

**Date:** 26 November 2026  
**Deploy:** **Not deployed**

## Pre-flight

- Phase 2 newsroom + Phase 3 ingestion foundation present in working tree  
- Existing reader features already in app: article body, related stories, share, bookmark, reactions, comments, follow category, track story, global search  

## Implemented / improved this pass

- Clear **Original vs External publisher** labelling on article and wire pages  
- Source links on original article source list  
- Breaking controls for editors on article page (from Phase 2)  
- Newsroom link into search  

## Already present (reuse, not rebuilt)

| Feature | Evidence | Status |
| --- | --- | --- |
| Article reading | `[slug]/page.tsx` + `getArticle` | PASS (prior + this pass labels) |
| Related stories | `relatedStories` | PARTIAL |
| Bookmarks | `bookmarkAction` | PARTIAL (exists; not re-browser-tested) |
| Reactions | `ArticleReactions` | PARTIAL |
| Comments + report | comment/report actions | PARTIAL |
| Share | `ShareLink` | PARTIAL |
| Search | `/search` + `searchPlatform` | PARTIAL (no advanced news-only filter UI) |
| Following topics | `topicAction` | PARTIAL |
| Notifications | account notifications module | PARTIAL / provider-dependent |
| Open Graph / NewsArticle schema | Missing | FAIL / NOT IMPLEMENTED |

## Not claiming PASS

- Full personalisation feeds, newsletter, WhatsApp channel product  
- Native share matrix + OG image pipeline  
- Dedicated e2e browser evidence pack  

## Regression

`npm test` → 49/49 after Phase 2 newsroom tests. Marketplace/auth/community tests included in that suite.

**Phase 4 is incremental on an already rich reader stack; it is not a greenfield rebuild and is not fully browser-certified.**
