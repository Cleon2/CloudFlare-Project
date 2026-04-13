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
# 1. Apply the schema to the remote D1 database
wrangler d1 execute morning-digest-db --remote --file=schema.sql

# 2. Build and deploy to Cloudflare Pages
npm run deploy
# → https://morning-digest.pages.dev
```

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
      rss.ts                — RSS feed fetching, XML parsing, HTML entity decoding
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

## Why this problem?

The morning routine of opening twelve tabs and skimming headlines is fragmented and shallow. RSS readers surface links, not reading. AI summarisers collapse articles into bullet points that strip out the actual thinking. Morning Digest sits in between: enough of each article to decide if it's worth your time, organised by what you care about, delivered in one place.

## Assumptions

- RSS feeds are publicly accessible and don't require authentication.
- One digest per user per day is the right cadence. Users who exhaust their feed can trigger a manual refresh.
- Llama 3.1 8B is sufficient for editorial summarisation at this scope; a 70B model would produce noticeably better prose.
- CF Access with Google IdP is sufficient identity — no additional user database is needed.

## Trade-offs considered

- **Non-blocking digest generation.** Processing 9–12 articles through an LLM takes 30–90 seconds. Rather than blocking the HTTP response, the API returns a 202 immediately and the client polls. This keeps the Worker request within Cloudflare's CPU limits and gives the user instant feedback.
- **Concurrent AI processing in batches of 3.** Fully sequential processing is safe but slow (~3× slower for a 12-article digest). Fully parallel risks hitting Workers AI rate limits. Batches of 3 balance speed against reliability.
- **7-day seen-article window.** Filtering out all previously seen articles would permanently deplete feeds as users switch topics. A 7-day rolling window prevents same-day repeats while allowing feeds to refill over time.
- **Pages Functions instead of a standalone Worker.** Pages Functions are Workers under the hood and satisfy the requirement, while also giving us a clean way to serve the React frontend alongside the API from a single deployment.
- **No full-article fetching.** The Worker processes RSS feed content rather than scraping full web pages. This avoids significant latency and fragility from arbitrary HTML parsing, at the cost of relying on feed publishers to include sufficient content.

## The One Thing I'd Improve If I Had More Time

**Dynamic User-Defined Feeds**
Currently, RSS links are hardcoded into the project. The single most impactful improvement would be building a management UI and backend logic to allow users to curate their own feed sources. 

Rather than starting with an empty input box, the UI would feature a precompiled directory of the most influential RSS feeds across various categories. Users could individually check off the sites they are keen on, aided by custom descriptions highlighting what makes each specific feed unique or valuable. 

This would move the project toward a true personalized, multi-tenant architecture, requiring **D1 Database** updates to map specific feeds to user profiles. Eventually, this could serve as the foundation for agentic feed discovery (detailed in the roadmap below).

---

## Further Roadmap

### 1. Durable Digest Rebuilds
The digest rebuild is currently triggered in the background without a persistent job queue. If the Worker is evicted mid-build (e.g., due to CPU limits), the rebuild fails silently. I would implement **Cloudflare Queues** to make builds durable and retriable, ensuring the frontend receives a clear error state or retry logic rather than an infinite loading spinner.

### 2. Paywall Detection & Content Transparency
To improve the user experience, I'd implement a pre-fetch check to detect paywalled links (by analyzing HTTP headers or common "gate" CSS selectors). The UI would then surface a **"Paywalled"** badge or warning, preventing user frustration when clicking through to restricted content.

### 3. Agentic Feed Discovery
Building upon the user-defined feeds mentioned above, I'd want to make the system more agentic. By using an LLM-based agent (leveraging **Workers AI**), the app could proactively manage a user's library:
* **Interest Analysis:** Analyze the user's reading and swipe habits to identify evolving interests.
* **Dynamic Sourcing:** Use search tools to find and validate new, high-quality RSS feeds on the fly that match those interests.
* **Auto-Pruning:** Automatically remove "dead" or low-relevance feeds to keep the digest insightful and high-signal.

# CloudFlare-Project
