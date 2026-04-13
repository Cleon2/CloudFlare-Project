import type { Env, RawArticle, ProcessedArticle } from './types';

const SYSTEM_PROMPT = [
  'You are a sharp content curator writing summaries for a swipeable article digest.',
  '',
  'Rules you must follow:',
  '1. hook: ONE sentence answering why this is worth reading right now. Be specific and concrete.',
  '2. body: 2-3 tight paragraphs, 100-150 words total.',
  '   - Paragraph 1: The core news or finding. Lead with the most important fact. Include names and numbers.',
  '   - Paragraph 2: Key supporting details or context.',
  '   - Paragraph 3 (optional): Why this matters now.',
  '   Separate paragraphs with \\n\\n. Plain prose only - no bullet points or markdown.',
  '3. readingMinutes: estimated reading time as an integer.',
  '',
  'Return ONLY a valid JSON object. Do not add any text outside the JSON.',
].join('\n');

function userPrompt(title: string, source: string, author: string, content: string): string {
  const jsonShape = '{\n  "hook": "One sentence.",\n  "body": "Paragraph one.\\n\\nParagraph two.",\n  "readingMinutes": 3\n}';
  return (
    'Title: ' + title + '\n' +
    'Source: ' + source + '\n' +
    'Author: ' + (author || 'Unknown') + '\n\n' +
    content + '\n\n' +
    'Return JSON with this exact shape:\n' +
    jsonShape
  );
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return sanitizeJson(fenced[1].trim());
  const braced = raw.match(/\{[\s\S]*\}/);
  return braced ? sanitizeJson(braced[0]) : raw;
}

// The model sometimes emits literal newlines inside JSON string values.
// Walk character-by-character, track string context, and escape them.
function sanitizeJson(raw: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && inString) {
      result += ch + (raw[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === '\n') {
      result += '\\n';
    } else if (inString && ch === '\r') {
      result += '\\r';
    } else if (inString && ch === '\t') {
      result += '\\t';
    } else {
      result += ch;
    }
    i++;
  }
  return result;
}

export async function processArticle(article: RawArticle, env: Env): Promise<ProcessedArticle> {
  const contentForAI = article.content.split(/\s+/).slice(0, 3500).join(' ');

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (env.AI as any).run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(article.title, article.source, article.author, contentForAI) },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const raw = res?.response ?? '';
    let parsed: ReturnType<typeof JSON.parse>;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      console.error('[ai] JSON parse failed for "' + article.title + '" (' + article.source + '). Raw response: ' + raw.slice(0, 800));
      throw new Error('JSON parse failed');
    }

    return {
      id: crypto.randomUUID(),
      title: article.title,
      url: article.url,
      source: article.source,
      author: article.author,
      pubDate: article.pubDate,
      topic: article.topic,
      hook:           typeof parsed.hook === 'string' ? parsed.hook : '',
      body:           typeof parsed.body === 'string' ? parsed.body : '',
      pullQuotes:     [],
      keyLinks:       [],
      readingMinutes: typeof parsed.readingMinutes === 'number' ? parsed.readingMinutes : 5,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[ai] Summary failed for "' + article.title + '" (' + article.source + '): ' + reason);
    return {
      id: crypto.randomUUID(),
      title: article.title,
      url: article.url,
      source: article.source,
      author: article.author,
      pubDate: article.pubDate,
      topic: article.topic,
      hook: '',
      body: '',
      pullQuotes: [],
      keyLinks: [],
      readingMinutes: 0,
      summaryFailed: true,
    };
  }
}

// Process in concurrent batches of 3 - faster than sequential without
// hammering the Workers AI rate limit.
export async function processArticlesBatch(articles: RawArticle[], env: Env): Promise<ProcessedArticle[]> {
  const CONCURRENCY = 3;
  const results: ProcessedArticle[] = [];

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const chunk = articles.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((a) => processArticle(a, env)));
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
      else console.error('[ai] Article failed:', r.reason);
    }
  }

  return results;
}
