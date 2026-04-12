import type { Env, RawArticle, ProcessedArticle } from './types';

// ---------------------------------------------------------------------------
// Prompt — the most important tuning knob in the whole project.
// We explicitly forbid bullet points and short summaries; we want the AI to
// behave like a senior editor selecting and arranging the best passages.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a senior editor at a prestigious long-form publication — think The Atlantic, The Economist, or Wired at its best. Your job is to prepare a curated reading digest for sophisticated, time-pressed readers who want genuine intellectual depth, not bullet-point summaries.

Rules you must follow without exception:
1. Preserve the author's voice, cadence, and specific arguments. Do not paraphrase into blandness.
2. Select and arrange 5–7 meaty paragraphs that capture the article's arc. Each paragraph should be substantive — 3–6 sentences. Aim for 550–750 words total in the body.
3. Do NOT use bullet points, numbered lists, headers, or markdown inside the body. Prose only.
4. Identify 2–3 pull quotes: the most striking, standalone sentences in the piece — ideally verbatim.
5. Surface up to 3 key links or references the article cites (if any).
6. Write exactly ONE hook sentence: not a summary, but the sharpest possible reason a busy reader should stop scrolling. Make it feel urgent or intriguing.
7. Return ONLY a raw JSON object — no markdown fences, no explanation text before or after.`;

const USER_TEMPLATE = (title: string, source: string, author: string, content: string) =>
  `Article to curate:

Title: ${title}
Source: ${source}
Author: ${author || 'Unknown'}

Full text:
${content}

Return JSON with this exact shape:
{
  "hook": "One sentence",
  "body": "Paragraph one full text.\\n\\nParagraph two full text.\\n\\nParagraph three.\\n\\nParagraph four.\\n\\nParagraph five.",
  "pullQuotes": ["Verbatim quote one.", "Verbatim quote two."],
  "keyLinks": [{ "text": "Anchor text", "url": "https://example.com" }],
  "readingMinutes": 5
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(raw: string): string {
  // The model sometimes wraps output in ```json ... ``` or adds preamble text.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braced = raw.match(/\{[\s\S]*\}/);
  return braced ? braced[0] : raw;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export async function processArticle(article: RawArticle, env: Env): Promise<ProcessedArticle> {
  // Truncate to ~3 500 words so we stay well within the model's context window
  const contentForAI = article.content.split(/\s+/).slice(0, 3500).join(' ');

  let hook = '';
  let body = '';
  let pullQuotes: string[] = [];
  let keyLinks: Array<{ text: string; url: string }> = [];
  let readingMinutes = 5;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiResponse = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: USER_TEMPLATE(article.title, article.source, article.author, contentForAI) },
      ],
      max_tokens: 2048,
      temperature: 0.25, // low temp = faithful, not creative
    });

    const raw: string = aiResponse?.response ?? '';
    const cleaned = extractJson(raw);
    const parsed = JSON.parse(cleaned);

    hook         = typeof parsed.hook === 'string'          ? parsed.hook         : '';
    body         = typeof parsed.body === 'string'          ? parsed.body         : '';
    pullQuotes   = Array.isArray(parsed.pullQuotes)         ? parsed.pullQuotes   : [];
    keyLinks     = Array.isArray(parsed.keyLinks)           ? parsed.keyLinks     : [];
    readingMinutes = typeof parsed.readingMinutes === 'number' ? parsed.readingMinutes : Math.ceil(wordCount(body) / 200);
  } catch (err) {
    console.error(`[ai] Failed to process "${article.title}":`, err);
    // Graceful fallback: use the raw RSS content so the user still gets something
    body           = article.content.split(/\s+/).slice(0, 600).join(' ');
    hook           = article.title;
    readingMinutes = Math.max(1, Math.ceil(wordCount(body) / 200));
  }

  return {
    id:             crypto.randomUUID(),
    title:          article.title,
    url:            article.url,
    source:         article.source,
    author:         article.author,
    pubDate:        article.pubDate,
    hook,
    body,
    pullQuotes,
    keyLinks,
    readingMinutes,
  };
}

// Process sequentially — Workers AI rate limits are generous but we don't need parallelism here.
export async function processArticlesBatch(articles: RawArticle[], env: Env): Promise<ProcessedArticle[]> {
  const results: ProcessedArticle[] = [];
  for (const article of articles) {
    try {
      results.push(await processArticle(article, env));
    } catch (err) {
      console.error(`[ai] Skipping article "${article.title}":`, err);
    }
  }
  return results;
}
