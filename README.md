# Morning Digest

> A swipeable morning reading feed — pick your interests, and AI curates the best articles from across the web into a daily digest you can save, share, and come back to.

## What it does

Morning Digest pulls fresh articles from curated RSS feeds matched to your chosen topics (Technology, AI, Finance, Science, Design, Business, Climate, Culture, Health), runs each piece through Cloudflare Workers AI (Llama 3.3 70B) to produce a sharp editorial summary, and presents them in a clean, card-based reading view. Swipe to skip or save. Anything you want to revisit lives in your personal library. Digests are cached per-user in KV so return visits are instant.

**Cloudflare products used:**
- **Workers AI** — `llama-3.3-70b-instruct-fp8-fast` for article summarisation and hook extraction
- **Pages** — hosts the React frontend and serves the API via Pages Functions (Workers under the hood)
- **KV** — caches the daily digest per user (20 h TTL) and stores user preferences
- **D1** — stores swipe history (for seen-article deduplication) and saved articles
- **Cloudflare Access** — restricts access to `@cloudflare.com` emails and your own

---

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — `npm i -g wrangler`
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Log in to Cloudflare (needed for Workers AI — calls are made remotely even in dev)
wrangler login

# 3. Create a KV namespace
wrangler kv namespace create DIGEST_KV
# Copy the returned id into wrangler.jsonc → kv_namespaces[0].id and preview_id

# 4. Create the D1 database
wrangler d1 create morning-digest-db
# Copy the returned database_id into wrangler.jsonc → d1_databases[0].database_id

# 5. Apply the database schema locally
npm run db:init

# 6. Start the dev server
npm run dev
# → Vite on http://localhost:5173, proxied through Wrangler at http://localhost:8787
```

Workers AI calls are made remotely even in `wrangler pages dev` — you need to be logged in, but no extra configuration is required.

---

## Live demo

**https://morning-digest.pages.dev**

Protected by Cloudflare Access — log in with a `@cloudflare.com` Google account. Reviewers without a `@cloudflare.com` address should contact me to be added to the allow list.

---

## Deploy

```bash
npm run deploy
```

This drops and recreates the D1 tables, builds the frontend, and deploys to Cloudflare Pages in one command. The KV digest cache and user preferences are untouched.

---

## Cloudflare Access setup (required for production)

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Access** → **Applications** → **Add an application**.
2. Choose **Self-hosted**.
3. Set the **Application domain** to your `*.pages.dev` URL (or custom domain).
4. Under **Policies**, add an Allow policy with:
   - **Include rule:** Emails → `your-email@example.com`
   - **Include rule:** Email domain → `cloudflare.com`
5. Save. Access will now gate every request with a Google login before it reaches the app.

The Pages Function reads the signed JWT injected by Access (`Cf-Access-Jwt-Assertion` header) to identify each user — no passwords, sessions, or OAuth client code needed. A cookie-based UUID is used as a fallback during local development.

---

## Environment variables

None required. Workers AI, KV, and D1 are all accessed through Wrangler bindings declared in `wrangler.jsonc`.

---

## Project structure

```
src/
  App.tsx                   — React app root, routing, all shared state
  components/
    SetupView.tsx            — Topic selection screen (one-time onboarding)
    LoadingView.tsx          — Polling / build-in-progress screen
    ReadingView.tsx          — Article card with swipe, keyboard, and touch nav
    ArticleContent.tsx       — Shared article renderer (used in reading + saved views)
    SavedView.tsx            — Saved articles library with delete
    TopicsDrawer.tsx         — Slide-in panel for changing topics
  types.ts                  — Frontend TypeScript interfaces + topic colour map
  index.css                 — All styles
  main.tsx                  — React entry point
functions/
  api/
    [[route]].ts            — Pages Function: handles all /api/* routes
    _lib/
      auth.ts               — CF Access JWT decoder + anonymous cookie fallback
      ai.ts                 — Workers AI integration (Llama 3.3 70B curator prompt)
      digest.ts             — Digest builder, KV caching, seen-article deduplication
      rss.ts                — RSS/Atom feed fetching, XML parsing, article enrichment
      types.ts              — Worker-side TypeScript interfaces
schema.sql                  — D1 table definitions (swipes, saved_articles)
wrangler.jsonc              — Cloudflare Pages configuration
```

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/me` | Returns user email and initials from CF Access JWT |
| `GET` | `/api/preferences` | Returns saved topic interests |
| `POST` | `/api/preferences` | Saves interests, invalidates digest, triggers rebuild |
| `GET` | `/api/digest` | Returns cached digest or `{building: true}` (202) if still building |
| `POST` | `/api/swipe` | Records a skip or save action |
| `GET` | `/api/saved` | Returns the user's saved articles |
| `DELETE` | `/api/saved/:id` | Deletes a saved article |
| `POST` | `/api/refresh` | Invalidates digest and triggers a fresh rebuild |

Digest builds are non-blocking — the API returns immediately while Workers AI processes articles in the background via `ctx.waitUntil()`. The frontend polls `/api/digest` every 3 seconds until the digest is ready.

---

## How the AI pipeline works

Getting reliable, self-contained summaries required solving two problems: content quality going in, and output consistency coming out.

**Content acquisition (rss.ts)**

RSS feeds are inconsistent sources. Some publishers (Quanta, Aeon) embed the full article body. Others (Hacker News, TechCrunch) send only a 2–3 sentence excerpt — far too thin for a meaningful summary. To address this, the pipeline checks word count after RSS parsing. Articles under 350 words trigger a full fetch of the article URL. The HTML is then processed by extracting the `<article>` or `<main>` element before stripping tags — targeting semantic containers first avoids mixing in navigation, footers, and ads. The fetched content is only used if it is at least 1.5× richer than the RSS excerpt; otherwise the original is kept. Paywalled or bot-blocked pages fail silently and fall back to the RSS content.

**Prompt design (ai.ts)**

The system prompt frames the model as an editorial curator, not a summariser — "a smart friend briefing you, not a wire service filing copy." It instructs the model to open on the most striking detail rather than the obvious lead, build context in a second paragraph, and leave the final sentence unresolved to keep the reader wanting more. Output is plain prose only: no bullet points, no markdown, no headers.

Requesting plain text rather than structured JSON was the most important reliability decision. Early iterations requested JSON output and suffered persistent parse failures caused by token truncation and bare newlines in model output. Switching to plain text eliminated the failure mode entirely — no parsing means no parse errors. The hook shown on each card is extracted from the first sentence via regex, which is cheaper and more robust than any structured output approach.

Input is capped at 3,500 words before being sent to the model to stay within the context window. Temperature is set to 0.4 to give the prose some edge without sacrificing factual grounding. The model is `llama-3.3-70b-instruct-fp8-fast` — the largest model available on Workers AI, in its throughput-optimised fp8 variant.

**Error handling**

If inference fails or returns an empty response, the article is flagged with `summaryFailed: true`. The frontend renders a clean "Summary unavailable" card with a direct link to the original article — users can still act on the piece rather than seeing broken or misleading content.

**Cache strategy**

Each digest is stored in KV under `digest:{userId}:{date}`. The date component means digests naturally expire at the day boundary; the 20-hour TTL provides a secondary expiry. All worker instances serving the same user on the same day hit the same key — avoiding the split-brain problem that arises when using a cold-start timestamp (evaluated differently per instance) as part of the cache key. Manual invalidation via `/api/refresh` deletes the key directly, triggering a clean rebuild on the next poll.

---

## Why this problem?

The morning routine of opening twelve tabs and skimming headlines is fragmented and shallow. RSS readers surface links, not reading. AI summarisers collapse articles into bullet points that strip out the actual thinking. Morning Digest sits in between: enough of each article to decide if it's worth your time, organised around what you care about, in one place. I built the thing I wanted to use.

## Assumptions

- RSS feeds are publicly accessible and don't require authentication.
- One digest per user per day is the right cadence. Users who exhaust their feed can trigger a manual refresh.
- Llama 3.3 70B fp8-fast is the right model at this scope — the fp8 quantisation keeps latency acceptable while the 70B parameter count produces noticeably better prose than smaller models.
- CF Access with Google IdP is sufficient identity — no additional user database is needed.
- Full article fetching will fail silently for paywalled content; this is acceptable given the open-source nature of most feeds in the interest list.

## Trade-offs considered

- **Non-blocking digest generation via `ctx.waitUntil()`.** Processing 10–15 articles through Workers AI takes 30–90 seconds. Blocking the HTTP response would exceed CPU limits and leave the user staring at a blank screen. Instead the API returns a 202 immediately and the client polls every 3 seconds — a Workers-native pattern that keeps request lifetimes short while allowing background work to complete.

- **Plain text over structured JSON output.** Structured JSON would map cleanly onto the card UI without post-processing, and was the original design. In practice the model reliably truncated responses before closing the JSON, and literal newlines inside string values caused parse failures that sanitisation couldn't fully cover. Plain text with regex post-processing (first sentence as hook, double-newline as paragraph boundary) is less elegant but completely reliable. Zero JSON parsing means zero JSON errors.

- **Hybrid RSS + full-article fetch.** Relying solely on RSS content produces poor summaries for sources that only publish excerpts. Fetching every article URL unconditionally adds latency and fails for paywalled content. The middle path — only fetching when RSS content is under 350 words, and only using the result when it is meaningfully richer — gets quality improvements where they matter without penalising already-rich feeds.

- **Concurrent AI processing in batches of 6.** Fully sequential processing is safe but slow. Fully parallel risks hitting Workers AI rate limits. Batches of 6 balance speed against reliability; on the paid Workers AI tier this has proven stable.

- **7-day seen-article window.** Filtering out all previously seen articles would permanently deplete feeds as users read more. A 7-day rolling window prevents same-day repeats while allowing feeds to refill over time.

- **Pages Functions instead of a standalone Worker.** Pages Functions are Workers under the hood and satisfy the requirement, while also giving a clean way to co-locate the React frontend and the API under a single deployment and `wrangler.jsonc`. The trade-off is that Pages Functions don't support Cron Triggers — a limitation that becomes relevant in the roadmap.

- **Date-keyed KV cache over deploy-time versioning.** An earlier implementation embedded a `Date.now()` timestamp (evaluated at Worker cold start) into the cache key as a deploy invalidation mechanism. This created a split-brain bug: concurrent Worker instances cold-started at different times, produced different cache keys, and built duplicate digests — some of which timed out and left stuck sentinels. The fix was to key digests by `userId:date` only, making all instances consistent. Cache is cleared on demand via `/api/refresh`.

## The One Thing I'd Improve If I Had More Time

**Scheduled pre-building via Cloudflare Cron Triggers**

The app is called Morning Digest, but right now the digest doesn't exist until you open it — the first visit triggers a 30–90 second build. The right fix is a Cron Trigger that pre-builds digests for all known users at 6am each day, so the experience on first open is instant.

The architecture already supports this: `buildAndCache` is idempotent, `known_users` is tracked in KV, and `triggerBuildIfNeeded` prevents duplicate builds. The only missing piece is the trigger itself — and that's where a Pages limitation becomes relevant. Cron Triggers are a Workers-only feature; Pages Functions are request-scoped and can't be scheduled. The clean solution is a small companion Worker deployed alongside the Pages app, sharing the same KV and D1 bindings, with a single `scheduled()` handler that iterates `known_users` and calls `buildAndCache` for each. Two wrangler configs to maintain, but the logic is ~20 lines and the infrastructure is already there.

This is the gap between a demo and a product — and it's a one-afternoon fix given the current architecture.

---

## Further Roadmap

**1. Agentic feed discovery**

The interest → RSS source mapping is currently hardcoded. A more ambitious version uses swipe patterns as implicit feedback — articles saved more often from a particular source signal higher relevance — and an LLM agent (via Workers AI) could surface new feeds matching the user's revealed preferences over time.

**2. Durable builds via Cloudflare Queues**

Digest builds run inside `ctx.waitUntil()` with no persistence. If a Worker is evicted mid-build the job is silently lost and the user sees an infinite loading spinner on next visit. Routing builds through Cloudflare Queues would make them durable and retriable, with dead-letter handling for persistent failures.

**3. Browser Rendering for paywalled content**

The current enrichment pipeline fails silently on JavaScript-rendered pages and bot-protected publishers. Routing article fetches through Cloudflare Browser Rendering would recover content from these sources and allow a "Paywalled" badge to surface on cards where full content genuinely isn't available, giving users accurate expectations before tapping through.
