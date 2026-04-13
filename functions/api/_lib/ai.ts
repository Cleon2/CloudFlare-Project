import type { Env, RawArticle, ProcessedArticle } from "./types";

const SYSTEM_PROMPT = `You are a sharp, high-signal content curator helping time-pressed readers decide whether an article is worth their attention.

Your summaries appear on swipeable digest cards. The goal is not to capture everything — it is to surface what is new, surprising, and consequential so the reader can make a confident yes/no decision in under 30 seconds.

The summary MUST be cohesive and self-sufficient: a reader should fully understand the key development without needing to click through.

Rules you must follow without exception:
1. Write 2–3 tight paragraphs totalling 120–200 words.
   - Paragraph 1: The core news, claim, or finding. Lead with the most important or surprising fact. Include names, numbers, and outcomes.
   - Paragraph 2: The strongest supporting details — evidence, comparison, mechanism, or context that adds clarity and depth. Keep momentum; no repetition.
   - Paragraph 3 (optional): Why this matters now — what could change, who is affected, or what to watch next.

2. Be concrete and direct. No generic framing. Do NOT write “this article explores” or similar phrases.

3. Make the writing flow as a single coherent narrative, not disjointed facts. Each sentence should build on the last.

4. Use a clean, confident, slightly editorial tone — not dry, not hypey. Lean into what is surprising, faster, riskier, or meaningful.

5. Do NOT use bullet points, lists, headers, or markdown. Prose only.

6. Identify 1–2 pull quotes: the most vivid or striking verbatim lines.

7. Surface up to 2 key links or references only if they add real context.

8. Write exactly ONE hook sentence:
   - It must answer: “Why is this worth reading right now?”
   - Be specific and concrete, not vague or clickbait.

Return ONLY a raw JSON object.`;

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
  "body": "Paragraph one.\\n\\nParagraph two.\\n\\nParagraph three (optional).",
  "pullQuotes": ["Verbatim quote one.", "Verbatim quote two."],
  "keyLinks": [{ "text": "Anchor text", "url": "https://example.com" }],
  "readingMinutes": 5
}`;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return sanitizeJson(fenced[1].trim());
  const braced = raw.match(/\{[\s\S]*\}/);
  return braced ? sanitizeJson(braced[0]) : raw;
}

// The model frequently emits literal newlines inside JSON string values, which
// is invalid JSON. Walk character-by-character, track string context, and
// replace any bare control characters with their escaped equivalents.
function sanitizeJson(raw: string): string {
  let result = "";
  let inString = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\" && inString) {
      // Pass through escape sequences untouched
      result += ch + (raw[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === "\n") {
      result += "\\n";
    } else if (inString && ch === "\r") {
      result += "\\r";
    } else if (inString && ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
    i++;
  }
  return result;
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
    const res = await (env.AI as any).run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
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
        max_tokens: 1500,
        temperature: 0.3,
      },
    );

    const raw = res?.response ?? "";
    let parsed: ReturnType<typeof JSON.parse>;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      console.error(
        `[ai] JSON parse failed for "${article.title}" (${article.source}). Raw response: ${raw.slice(0, 800)}`,
      );
      throw new Error("JSON parse failed");
    }

    hook = typeof parsed.hook === "string" ? parsed.hook : "";
    body = typeof parsed.body === "string" ? parsed.body : "";
    pullQuotes = Array.isArray(parsed.pullQuotes) ? parsed.pullQuotes : [];
    keyLinks = Array.isArray(parsed.keyLinks) ? parsed.keyLinks : [];
    readingMinutes =
      typeof parsed.readingMinutes === "number" ? parsed.readingMinutes : 5;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[ai] Summary failed for "${article.title}" (${article.source}): ${reason}`,
    );
    return {
      id: crypto.randomUUID(),
      title: article.title,
      url: article.url,
      source: article.source,
      author: article.author,
      pubDate: article.pubDate,
      topic: article.topic,
      hook: "",
      body: "",
      pullQuotes: [],
      keyLinks: [],
      readingMinutes: 0,
      summaryFailed: true,
    };
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
