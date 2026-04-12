import type { Env, DailyDigest, UserPreferences } from './types';
import { fetchArticlesForInterests } from './rss';
import { processArticlesBatch } from './ai';

// ---------------------------------------------------------------------------
// KV key helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function digestKey(userId: string): string {
  return `digest:${userId}:${todayISO()}`;
}

function prefsKey(userId: string): string {
  return `prefs:${userId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return today's digest for the user. Builds and caches it on the first call.
 * Returns null if the user has no saved preferences yet.
 */
export async function getOrBuildDigest(userId: string, env: Env): Promise<DailyDigest | null> {
  // 1. Return cached digest if available
  const cached = await env.DIGEST_KV.get<DailyDigest>(digestKey(userId), 'json');
  if (cached) return cached;

  // 2. Load preferences
  const prefs = await env.DIGEST_KV.get<UserPreferences>(prefsKey(userId), 'json');
  if (!prefs || prefs.interests.length === 0) return null;

  // 3. Build fresh
  return buildAndCache(userId, prefs, env);
}

/**
 * Fetch RSS → run AI curation → store in KV.
 * Called both on-demand and by the daily cron trigger.
 */
export async function buildAndCache(
  userId: string,
  prefs: UserPreferences,
  env: Env,
): Promise<DailyDigest> {
  const raw     = await fetchArticlesForInterests(prefs.interests);
  const articles = await processArticlesBatch(raw, env);

  const digest: DailyDigest = {
    date:        todayISO(),
    articles,
    generatedAt: new Date().toISOString(),
  };

  // Cache for 20 hours — long enough to survive the day, short enough to
  // refresh overnight before the next morning's reads.
  await env.DIGEST_KV.put(digestKey(userId), JSON.stringify(digest), {
    expirationTtl: 72_000,
  });

  return digest;
}

/**
 * Called by the cron trigger at 07:00 UTC.
 * Iterates known users and pre-builds their digests so the first page load is instant.
 */
export async function runScheduledDigests(env: Env): Promise<void> {
  const { keys } = await env.DIGEST_KV.list({ prefix: 'prefs:' });

  for (const key of keys) {
    const userId = key.name.replace('prefs:', '');
    const prefs  = await env.DIGEST_KV.get<UserPreferences>(key.name, 'json');
    if (!prefs) continue;
    try {
      await buildAndCache(userId, prefs, env);
    } catch (err) {
      console.error(`[cron] Failed to build digest for ${userId}:`, err);
    }
  }
}

/**
 * Save or update a user's preferences and register them in the known-users list.
 */
export async function savePreferences(
  userId: string,
  interests: string[],
  env: Env,
): Promise<void> {
  const prefs: UserPreferences = { interests, updatedAt: new Date().toISOString() };
  await env.DIGEST_KV.put(prefsKey(userId), JSON.stringify(prefs));

  // Track userId so the cron can discover all users
  const raw   = await env.DIGEST_KV.get<string[]>('known_users', 'json') ?? [];
  const users = Array.isArray(raw) ? raw : [];
  if (!users.includes(userId)) {
    users.push(userId);
    await env.DIGEST_KV.put('known_users', JSON.stringify(users));
  }
}

/**
 * Clear today's cached digest so the next GET /api/digest rebuilds it.
 */
export async function invalidateDigest(userId: string, env: Env): Promise<void> {
  await env.DIGEST_KV.delete(digestKey(userId));
}
