# Morning Digest

> A Substack-style morning reading feed — pick your interests, and AI curates the best articles from across the web into a daily digest you can swipe through.

## What it does

Morning Digest pulls fresh articles from curated RSS feeds matched to your chosen topics (Technology, AI, Finance, Science, Design, Business, Climate, Culture, Health), runs each piece through Cloudflare Workers AI (Llama 3.1 8B) to produce a concise editorial summary, and presents them in a clean, card-based reading view. Swipe to skip or save. Anything you want to revisit is stored in your personal library. Digests are cached per-user so subsequent visits are instant.

**Cloudflare products used:**
- **Workers AI** — Llama 3.1 8B for article summarisation and hook generation
- **Pages** — hosts the React frontend and serves the API via Pages Functions
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
# 1. Apply the schema to the remote D1 database (first time only)
wrangler d1 execute morning-digest-db --remote --file=schema.sql

# 2. Build and deploy to Cloudflare Pages
npm run deploy
# → https://morning-digest.pages.dev
```

Every deploy automatically invalidates all cached digests (see Cache Strategy below) so users always get fresh summaries built with the latest code. The D1 database and KV preferences are never wiped — only the digest cache is cleared.

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
  App.tsx                   — React app root, all state + API calls
  components/
    SetupView.tsx            — Topic selection screen
    LoadingView.tsx          — Polling / build-in-progress screen
    ReadingView.tsx          — Article card with swipe and keyboard nav
    SavedView.tsx            — Saved articles library
    TopicsDrawer.tsx         — Slide-in panel for changing topics
  types.ts                  — Frontend TypeScript interfaces + topic colour map
  index.css                 — All styles
  main.tsx                  — React entry point
functions/
  api/
    [[route]].ts            — Pages Function: handles all /api/* routes
    _lib/
      auth.ts               — CF Access JWT decoder + anonymous cookie fallback
      ai.ts                 — Workers AI integration (Llama 3.1 curator prompt)
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
| `POST` | `/api/refresh` | Invalidates digest and triggers a fresh rebuild |

Digest builds are non-blocking — the API returns immediately while Workers AI processes articles in the background via `ctx.waitUntil()`. The frontend polls `/api/digest` every 3 seconds until the digest is ready.

---

## How the AI pipeline works

Getting reliable, self-contained summaries required solving two problems: content quality going in, and output consistency coming out.

**Content acquisition (rss.ts)**

RSS feeds are inconsistent sources. Some publishers (Quanta, Aeon) embed the full article body. Others (Hacker News, TechCrunch) send only a 2–3 sentence excerpt — far too thin for a meaningful summary. To address this, the pipeline checks word count after RSS parsing. Articles under 350 words trigger a full fetch of the article URL. The HTML is then processed by extracting the `<article>` or `<main>` element before stripping tags — targeting semantic containers first avoids mixing in navigation, footers, and ads. The fetched content is only used if it is at least 1.5× richer than the RSS excerpt; otherwise the original is kept. Paywalled or bot-blocked pages fail silently and fall back to the RSS content.

**Prompt design (ai.ts)**

The system prompt frames the model as an editorial curator, not a summariser — "a smart friend briefing you, not a wire service filing copy." It instructs the model to open on the most striking detail rather than the obvious lead, build context in a second paragraph, and leave the final sentence unresolved to keep the reader wanting more. Output is plain prose only: no bullet points, no markdown, no headers. Requesting plain text rather than structured JSON turned out to be the most reliable choice — early iterations requested JSON output and suffered persistent parse failures from token truncation and literal newlines in model output; plain text eliminated the failure mode entirely. The hook shown on each card is extracted from the first sentence via regex after the fact, which is a cheaper and more robust post-processing step than parsing a structured response. Input is capped at 3,500 words before being sent to the model to stay within the context window. Temperature is set to 0.4 to give the prose some edge without sacrificing accuracy.

**Error handling**

If the model returns malformed JSON or the inference call fails, the article is flagged with `summaryFailed: true` rather than falling back to a raw text truncation. The frontend renders a clean "Summary unavailable" card with a direct link to the original article, so users can still act on the piece rather than seeing broken or misleading content.

**Cache strategy**

Each digest is stored in KV under a key that includes a deploy-time timestamp: `digest:v{timestamp}:{userId}:{date}`. The timestamp is evaluated once per Worker cold start, so every new deployment naturally produces a new key — stale digests become unreachable immediately without any deletion. User preferences and saved articles in D1 are never affected.

---

## Why this problem?

The morning routine of opening twelve tabs and skimming headlines is fragmented and shallow. RSS readers surface links, not reading. AI summarisers collapse articles into bullet points that strip out the actual thinking. Morning Digest sits in between: enough of each article to decide if it's worth your time, organised by what you care about, delivered in one place.

## Assumptions

- RSS feeds are publicly accessible and don't require authentication.
- One digest per user per day is the right cadence. Users who exhaust their feed can trigger a manual refresh.
- Llama 3.1 8B is sufficient for editorial summarisation at this scope; a 70B model would produce noticeably better prose but introduces higher latency and rate-limit pressure.
- CF Access with Google IdP is sufficient identity — no additional user database is needed.
- Full article fetching will fail silently for paywalled content; this is an acceptable degradation given the open-source nature of most feeds in the interest list.

## Trade-offs considered

- **Non-blocking digest generation via `ctx.waitUntil()`.** Processing 9–12 articles through Workers AI takes 30–90 seconds. Blocking the HTTP response would exceed Cloudflare's CPU limits and leave the user staring at a blank screen. Instead the API returns a 202 immediately and the client polls every 3 seconds — a Workers-native pattern that keeps request lifetimes short while allowing background work to complete.

- **Hybrid RSS + full-article fetch.** Relying solely on RSS content produces poor summaries for sources that only publish excerpts. Fetching every article URL unconditionally adds latency and fails for paywalled content. The middle path — only fetching when RSS content is under 350 words, and only using the result when it is meaningfully richer — gets quality improvements where they matter most without penalising already-rich feeds or adding unnecessary latency.

- **Semantic HTML extraction over full-page strip.** Rather than stripping all HTML from a fetched page (which mixes article text with nav, ads, and footer copy), the pipeline targets `<article>` and `<main>` elements first. Most modern article pages use these semantic containers, so the signal-to-noise ratio of content passed to the model is significantly higher with minimal extra code.

- **Concurrent AI processing in batches of 3.** Fully sequential processing is safe but slow (~3× slower for a 12-article digest). Fully parallel risks hitting Workers AI rate limits. Batches of 3 balance speed against reliability.

- **7-day seen-article window.** Filtering out all previously seen articles would permanently deplete feeds as users read more. A 7-day rolling window prevents same-day repeats while allowing feeds to refill over time.

- **Pages Functions instead of a standalone Worker.** Pages Functions are Workers under the hood and satisfy the requirement, while also giving a clean way to serve the React frontend alongside the API from a single deployment and `wrangler.jsonc`.

- **Deploy-time cache invalidation without deletion.** Rather than running a script to purge KV keys on every deploy, the digest key embeds a timestamp evaluated at Worker cold start. New deployments produce new keys; old digests become unreachable and expire naturally via their TTL. This keeps the deploy script simple and never risks deleting user preferences or saved articles.

## The One Thing I'd Improve If I Had More Time

**Reliable full-article content for all sources**

The current content enrichment pipeline is a meaningful step forward — it fetches the full article for thin RSS feeds and extracts the main body using semantic HTML containers. But it still has a real limitation: it fails silently for paywalled content, bot-protected news sites, and JavaScript-rendered pages. For those sources, the AI still summarises a 2–3 sentence excerpt, which produces a noticeably thinner card than a fully-fetched article.

The right solution is to route article fetches through **Cloudflare Browser Rendering**, which executes JavaScript and handles cookie consent gates, combined with a paywall detection step that surfaces a clear "Paywalled" badge on the card rather than showing a thin summary without context. This would close the content quality gap for the remaining sources and give users accurate expectations before they tap through.

---

## Further Roadmap

### 1. Dynamic User-Defined Feeds
Currently RSS sources are hardcoded per interest category. The most impactful personalisation improvement would be a feed management UI where users can add, remove, and browse a curated directory of sources. This would require D1 schema changes to map feeds to user profiles and move the project toward a true multi-tenant architecture.

### 2. Durable Digest Rebuilds via Queues
The digest rebuild is triggered in the background via `ctx.waitUntil()` without a persistent job queue. If the Worker is evicted mid-build, the rebuild fails silently and the user sees an infinite loading spinner. Routing builds through **Cloudflare Queues** would make them durable and retriable, with explicit failure states surfaced to the frontend.

### 3. Agentic Feed Discovery
Building on user-defined feeds, an LLM agent (via Workers AI) could analyse swipe patterns to infer evolving interests, search for new high-quality RSS sources on the fly, and auto-prune low-signal feeds — making the digest progressively more personalised without manual curation.
