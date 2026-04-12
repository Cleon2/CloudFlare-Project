import type { Env, RawArticle, ProcessedArticle } from "./types";

const SYSTEM_PROMPT = `You are a senior editor at a prestigious long-form publication — think The Atlantic, The Economist, or Wired at its best. Your job is to prepare a curated reading digest for sophisticated, time-pressed readers who want genuine intellectual depth, not bullet-point summaries.

Rules you must follow without exception:
1. Preserve the author's voice, cadence, and specific arguments. Do not paraphrase into blandness.
2. Select and arrange 5–7 meaty paragraphs that capture the article's arc. Each paragraph should be substantive — 3–6 sentences. Aim for 550–750 words total in the body.
3. Do NOT use bullet points, numbered lists, headers, or markdown inside the body. Prose only.
4. Identify 2–3 pull quotes: the most striking, standalone sentences in the piece — ideally verbatim.
5. Surface up to 3 key links or references the article cites (if any).
6. Write exactly ONE hook sentence: not a summary, but the sharpest possible reason a busy reader should stop scrolling.
7. Return ONLY a raw JSON object — no markdown fences, no explanation text before or after.`;

const userPrompt = (
  title: string,
  source: string,
  author: string,
  content: string,
) =>
  `Article to curate:

Title: ${title}
Source: ${source}
Author: ${author || "Unknown"}

Full text:
${content}

Return JSON with this exact shape:
{
  "hook": "One sentence",
  "body": "Paragraph one.\\n\\nParagraph two.\\n\\nParagraph three.\\n\\nParagraph four.\\n\\nParagraph five.",
  "pullQuotes": ["Verbatim quote one.", "Verbatim quote two."],
  "keyLinks": [{ "text": "Anchor text", "url": "https://example.com" }],
  "readingMinutes": 5
}`;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braced = raw.match(/\{[\s\S]*\}/);
  return braced ? braced[0] : raw;
}

export async function processArticle(
  article: RawArticle,
  env: Env,
): Promise<ProcessedArticle> {
  const contentForAI = article.content.split(/\s+/).slice(0, 3500).join(" ");

  let hook = "",
    body = "",
    pullQuotes: string[] = [],
    keyLinks: Array<{ text: string; url: string }> = [],
    readingMinutes = 5;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (env.AI as any).run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt(
            article.title,
            article.source,
            article.author,
            contentForAI,
          ),
        },
      ],
      max_tokens: 2048,
      temperature: 0.25,
    });

    const parsed = JSON.parse(extractJson(res?.response ?? ""));
    hook = typeof parsed.hook === "string" ? parsed.hook : "";
    body = typeof parsed.body === "string" ? parsed.body : "";
    pullQuotes = Array.isArray(parsed.pullQuotes) ? parsed.pullQuotes : [];
    keyLinks = Array.isArray(parsed.keyLinks) ? parsed.keyLinks : [];
    readingMinutes =
      typeof parsed.readingMinutes === "number" ? parsed.readingMinutes : 5;
  } catch {
    body = article.content.split(/\s+/).slice(0, 600).join(" ");
    hook = article.title;
    readingMinutes = Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
  }

  return {
    id: crypto.randomUUID(),
    title: article.title,
    url: article.url,
    source: article.source,
    author: article.author,
    pubDate: article.pubDate,
    topic: article.topic,
    hook,
    body,
    pullQuotes,
    keyLinks,
    readingMinutes,
  };
}

// Process in concurrent batches of 3 — significantly faster than sequential
// without hammering the Workers AI rate limit.
export async function processArticlesBatch(
  articles: RawArticle[],
  env: Env,
): Promise<ProcessedArticle[]> {
  const CONCURRENCY = 3;
  const results: ProcessedArticle[] = [];

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const chunk = articles.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((a) => processArticle(a, env)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else console.error("[ai] Article failed:", r.reason);
    }
  }

  return results;
}
