import type { Env } from "./_lib/types";
import { getUserId, newAnonymousId } from "./_lib/auth";
import {
  getCachedDigest,
  triggerBuildIfNeeded,
  savePreferences,
  invalidateDigest,
} from "./_lib/digest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------------
// Pages Function — handles all /api/* routes
// ---------------------------------------------------------------------------

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname; // e.g. /api/preferences

  // Resolve or mint a user identity
  let userId = getUserId(request);
  let newCookie: string | null = null;
  if (!userId) {
    userId = newAnonymousId();
    newCookie = `digest_uid=${userId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`;
  }

  let response: Response;

  // ── GET /api/me ──────────────────────────────────────────────────────────
  if (path === "/api/me" && method === "GET") {
    // In production, CF Access JWT contains the user's email.
    // In local dev, userId is a UUID from the cookie — we return it as-is.
    const isEmail = userId.includes("@");
    const initials = isEmail
      ? userId.split("@")[0].slice(0, 2).toUpperCase()
      : "ME";
    return jsonResponse({ email: isEmail ? userId : null, initials });

    // ── GET /api/preferences ─────────────────────────────────────────────────
  } else if (path === "/api/preferences" && method === "GET") {
    const prefs = await env.DIGEST_KV.get(`prefs:${userId}`, "json");
    response = jsonResponse(prefs ?? { interests: [] });

    // ── POST /api/preferences ────────────────────────────────────────────────
  } else if (path === "/api/preferences" && method === "POST") {
    const body = (await request.json()) as { interests?: unknown };
    if (!Array.isArray(body.interests)) {
      return jsonResponse({ error: "interests must be an array" }, 400);
    }
    const interests = (body.interests as unknown[])
      .filter((x): x is string => typeof x === "string")
      .slice(0, 20);
    await savePreferences(userId, interests, env);
    // User explicitly submitted preferences — always rebuild fresh, never serve cached content.
    // invalidateDigest runs synchronously so the cache is cleared before the client starts polling.
    await invalidateDigest(userId, env);
    ctx.waitUntil(triggerBuildIfNeeded(userId, env));
    response = jsonResponse({ ok: true });

    // ── GET /api/digest ──────────────────────────────────────────────────────
  } else if (path === "/api/digest" && method === "GET") {
    const digest = await getCachedDigest(userId, env);
    if (!digest) {
      // Still building — trigger one if nothing is running yet, then tell the client to keep polling
      ctx.waitUntil(triggerBuildIfNeeded(userId, env));
      response = jsonResponse({ building: true }, 202);
    } else {
      response = jsonResponse(digest);
    }

    // ── POST /api/swipe ──────────────────────────────────────────────────────
  } else if (path === "/api/swipe" && method === "POST") {
    const body = (await request.json()) as {
      action?: string;
      articleUrl?: string;
      articleTitle?: string;
      articleSource?: string;
      articleHook?: string;
      articleJson?: string;
    };
    if (body.action !== "save" && body.action !== "skip") {
      return jsonResponse({ error: "action must be save or skip" }, 400);
    }
    if (!body.articleUrl) {
      return jsonResponse({ error: "articleUrl is required" }, 400);
    }

    if (body.action === "save") {
      await env.morning_digest_db
        .prepare(
          `INSERT OR IGNORE INTO saved_articles (user_id, title, source, url, hook, article_json) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          body.articleTitle ?? "",
          body.articleSource ?? "",
          body.articleUrl,
          body.articleHook ?? "",
          body.articleJson ?? null,
        )
        .run();
    }
    await env.morning_digest_db
      .prepare(
        `INSERT INTO swipes (user_id, article_url, action) VALUES (?, ?, ?)`,
      )
      .bind(userId, body.articleUrl, body.action)
      .run();

    response = jsonResponse({ ok: true });

    // ── GET /api/saved ───────────────────────────────────────────────────────
  } else if (path === "/api/saved" && method === "GET") {
    const result = await env.morning_digest_db
      .prepare(
        `SELECT id, title, source, url, hook, article_json, saved_at FROM saved_articles WHERE user_id = ? ORDER BY saved_at DESC LIMIT 50`,
      )
      .bind(userId)
      .all();
    response = jsonResponse(result.results);

    // ── DELETE /api/saved/:id ────────────────────────────────────────────────
  } else if (path.match(/^\/api\/saved\/\d+$/) && method === "DELETE") {
    const id = parseInt(path.split("/").pop()!);
    await env.morning_digest_db
      .prepare("DELETE FROM saved_articles WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();
    response = jsonResponse({ ok: true });

    // ── POST /api/refresh ────────────────────────────────────────────────────
  } else if (path === "/api/refresh" && method === "POST") {
    await invalidateDigest(userId, env);
    ctx.waitUntil(triggerBuildIfNeeded(userId, env));
    response = jsonResponse({ ok: true });
  } else {
    response = jsonResponse({ error: "Not found" }, 404);
  }

  // Attach the new-user cookie if we just minted one
  return newCookie ? withCookie(response, newCookie) : response;
};
