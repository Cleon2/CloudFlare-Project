import type { Env, DailyDigest, UserPreferences } from './types';
import { fetchArticlesForInterests } from './rss';
import { processArticlesBatch } from './ai';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function digestKey(userId: string): string {
  return `digest:${userId}:${todayISO()}`;
}

export function prefsKey(userId: string): string {
  return `prefs:${userId}`;
}

// Only reads from KV — never blocks on a build. Returns null if not ready yet.
export async function getCachedDigest(userId: string, env: Env): Promise<DailyDigest | null> {
  return env.DIGEST_KV.get<DailyDigest>(digestKey(userId), 'json');
}

// Starts a build if one hasn't been cached yet. Meant to be called with ctx.waitUntil().
export async function triggerBuildIfNeeded(userId: string, env: Env): Promise<void> {
  const cached = await env.DIGEST_KV.get(digestKey(userId));
  if (cached) return; // already built today
  const prefs = await env.DIGEST_KV.get<UserPreferences>(prefsKey(userId), 'json');
  if (!prefs || prefs.interests.length === 0) return;
  await buildAndCache(userId, prefs, env);
}

export async function buildAndCache(userId: string, prefs: UserPreferences, env: Env): Promise<DailyDigest> {
  // Fetch URLs seen in the last 7 days — far enough back to avoid same-day repeats
  // but not so aggressive that switching topics leaves topics permanently empty.
  const seenResult = await env.morning_digest_db
    .prepare(`SELECT article_url FROM swipes
              WHERE user_id = ? AND created_at > datetime('now', '-7 days')`)
    .bind(userId)
    .all();
  const seenUrls = new Set(seenResult.results.map((r: Record<string, unknown>) => r.article_url as string));

  const raw = await fetchArticlesForInterests(prefs.interests);

  // Filter out already-seen articles
  const unseen = raw.filter(a => !seenUrls.has(a.url));

  // Graceful fallback: if the user has read everything available in their feeds,
  // surface the full set rather than returning an empty digest
  const toProcess = unseen.length >= 3 ? unseen : raw;

  const articles = await processArticlesBatch(toProcess, env);

  const digest: DailyDigest = {
    date:        todayISO(),
    articles,
    generatedAt: new Date().toISOString(),
    allCaughtUp: unseen.length < 3, // signal to the frontend
  };

  await env.DIGEST_KV.put(digestKey(userId), JSON.stringify(digest), { expirationTtl: 72_000 });
  return digest;
}

export async function savePreferences(userId: string, interests: string[], env: Env): Promise<void> {
  const prefs: UserPreferences = { interests, updatedAt: new Date().toISOString() };
  await env.DIGEST_KV.put(prefsKey(userId), JSON.stringify(prefs));

  const users = (await env.DIGEST_KV.get<string[]>('known_users', 'json')) ?? [];
  if (!users.includes(userId)) {
    users.push(userId);
    await env.DIGEST_KV.put('known_users', JSON.stringify(users));
  }
}

export async function invalidateDigest(userId: string, env: Env): Promise<void> {
  await env.DIGEST_KV.delete(digestKey(userId));
}
