import type { RawArticle } from './types';

// ---------------------------------------------------------------------------
// Interest → RSS source mapping
// Add or swap feeds to taste — these are all freely accessible.
// ---------------------------------------------------------------------------
export const INTEREST_SOURCES: Record<string, Array<{ name: string; url: string }>> = {
  technology: [
    { name: 'Hacker News',   url: 'https://news.ycombinator.com/rss' },
    { name: 'The Verge',     url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Ars Technica',  url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Wired',         url: 'https://www.wired.com/feed/rss' },
  ],
  ai: [
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
    { name: 'VentureBeat AI',  url: 'https://venturebeat.com/category/ai/feed/' },
    { name: 'The Batch',       url: 'https://www.deeplearning.ai/the-batch/feed/' },
  ],
  finance: [
    { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
    { name: 'TechCrunch VC',    url: 'https://techcrunch.com/category/venture/feed/' },
    { name: 'Economist Finance', url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  ],
  science: [
    { name: 'Quanta Magazine',   url: 'https://api.quantamagazine.org/feed/' },
    { name: 'Ars Technica Sci',  url: 'https://feeds.arstechnica.com/arstechnica/science' },
    { name: 'New Scientist',     url: 'https://www.newscientist.com/feed/home/' },
  ],
  design: [
    { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/' },
    { name: 'A List Apart',      url: 'https://alistapart.com/main/feed/' },
  ],
  business: [
    { name: 'TechCrunch',  url: 'https://techcrunch.com/feed/' },
    { name: 'Fast Company', url: 'https://www.fastcompany.com/latest/rss' },
  ],
  climate: [
    { name: 'Guardian Environment', url: 'https://www.theguardian.com/environment/rss' },
    { name: 'Inside Climate News',  url: 'https://insideclimatenews.org/feed/' },
  ],
  culture: [
    { name: 'The Atlantic',  url: 'https://www.theatlantic.com/feed/all/' },
    { name: 'Arts & Letters', url: 'https://aldaily.com/feed/' },
  ],
  health: [
    { name: 'STAT News',       url: 'https://www.statnews.com/feed/' },
    { name: 'Ars Technica Bio', url: 'https://feeds.arstechnica.com/arstechnica/science' },
  ],
};

export const ALL_INTERESTS = Object.keys(INTEREST_SOURCES);

// ---------------------------------------------------------------------------
// XML parsing helpers (no DOM — Cloudflare Workers don't ship DOMParser)
// ---------------------------------------------------------------------------

function extractTag(xml: string, tag: string): string {
  // Handles both <tag>content</tag> and <tag><![CDATA[content]]></tag>
  const escaped = tag.replace(':', '\\:');
  const patterns = [
    new RegExp(`<${escaped}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escaped}>`, 'i'),
    new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function extractAtomLink(itemXml: string): string {
  // <link href="..." /> (Atom) or <link>url</link> (RSS)
  const attrMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (attrMatch) return attrMatch[1];
  const textMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
  return textMatch ? textMatch[1].trim() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Second pass: entity decoding above may reveal HTML tags (e.g. &lt;p&gt; → <p>)
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseItems(xml: string, sourceName: string, topic: string): RawArticle[] {
  const articles: RawArticle[] = [];
  // Match both RSS <item> and Atom <entry>
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const chunk = m[1];

    const title = stripHtml(extractTag(chunk, 'title'));
    const link  = extractTag(chunk, 'link') || extractAtomLink(chunk);

    if (!title || !link) continue;

    // Prefer full content; fall back through description / summary
    const rawContent =
      extractTag(chunk, 'content:encoded') ||
      extractTag(chunk, 'content') ||
      extractTag(chunk, 'description') ||
      extractTag(chunk, 'summary');

    const author =
      stripHtml(extractTag(chunk, 'dc:creator')) ||
      stripHtml(extractTag(chunk, 'author'))      ||
      '';

    const pubDate =
      extractTag(chunk, 'pubDate') ||
      extractTag(chunk, 'published') ||
      extractTag(chunk, 'updated') ||
      '';

    const content = stripHtml(rawContent);
    // Skip items with no real content (e.g. Hacker News link-only items)
    if (content.length < 80 && rawContent.length < 80) continue;

    articles.push({ title, url: link.trim(), source: sourceName, author, pubDate, content, topic });
  }

  return articles;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchArticlesForInterests(interests: string[]): Promise<RawArticle[]> {
  // Collect sources per interest, deduped by URL, keeping topic attached
  const seen = new Set<string>();
  const sources: Array<{ name: string; url: string; topic: string }> = [];
  for (const interest of interests) {
    for (const src of INTEREST_SOURCES[interest] ?? []) {
      if (!seen.has(src.url)) {
        seen.add(src.url);
        sources.push({ ...src, topic: interest });
      }
    }
  }

  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(src.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'MorningDigest/1.0 (+https://morning-digest.workers.dev)' },
        });
        clearTimeout(timer);
        if (!res.ok) return [] as RawArticle[];
        const xml = await res.text();
        return parseItems(xml, src.name, src.topic).slice(0, 3);
      } catch {
        clearTimeout(timer);
        return [] as RawArticle[];
      }
    }),
  );

  const all: RawArticle[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return all.slice(0, 12);
}
