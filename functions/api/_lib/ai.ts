import type { Env, RawArticle, ProcessedArticle } from './types';

const SYSTEM_PROMPT = [
  'You are a sharp editorial curator writing summaries for a swipeable news digest.',
  '',
  'Your job is to make each article feel alive and worth reading - not just recap it.',
  '',
  'Write 2-3 paragraphs (100-150 words total):',
  '- Paragraph 1: Drop the reader into the most striking, strange, or consequential detail. Not the most obvious lead - the one that makes them sit up. Include names and numbers.',
  '- Paragraph 2: The context and supporting detail that makes paragraph 1 land harder.',
  '- Paragraph 3 (optional): End on something unresolved, contested, or worth watching. Leave a thread the reader wants to pull.',
  '',
  'Tone: confident, slightly editorial, curious. Like a smart friend briefing you, not a wire service filing copy.',
  '',
  'Rules:',
  '- No bullet points, no markdown, no headers.',
  '- Do not start with the article title or source name.',
  '- Do not wrap up neatly - the last sentence should make the reader want more, not feel done.',
  '- Plain prose only.',
  '',
  'Output the summary and nothing else.',
].join('\n');

function userPrompt(title: string, source: string, author: string, content: string): string {
  return (
    'Title: ' + title + '\n' +
    'Source: ' + source + '\n' +
    'Author: ' + (author || 'Unknown') + '\n\n' +
    content
  );
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
      max_tokens: 400,
      temperature: 0.4,
    });

    const body = typeof res?.response === 'string' ? res.response.trim() : '';
    if (!body) throw new Error('Empty response from model');

    const firstSentenceMatch = body.match(/^.+?[.!?]/);
    const hook = firstSentenceMatch ? firstSentenceMatch[0].trim() : body.split('\n')[0];
    const readingMinutes = Math.max(1, Math.ceil(body.split(/\s+/).length / 200));

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
      pullQuotes: [],
      keyLinks: [],
      readingMinutes,
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

export async function processArticlesBatch(articles: RawArticle[], env: Env): Promise<ProcessedArticle[]> {
  const CONCURRENCY = 6;
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
