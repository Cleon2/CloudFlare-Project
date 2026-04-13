// Worker-side types (not imported by the React frontend)
export interface Env {
  DIGEST_KV: KVNamespace;
  morning_digest_db: D1Database;
  AI: Ai;
}

export interface UserPreferences {
  interests: string[];
  updatedAt: string;
}

export interface RawArticle {
  title: string;
  url: string;
  source: string;
  author: string;
  pubDate: string;
  content: string;
  topic: string; // interest key e.g. "technology", "ai"
}

export interface ProcessedArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  author: string;
  pubDate: string;
  topic: string;
  hook: string;
  body: string;
  pullQuotes: string[];
  keyLinks: Array<{ text: string; url: string }>;
  readingMinutes: number;
  summaryFailed?: boolean;
}

export interface DailyDigest {
  date: string;
  articles: ProcessedArticle[];
  generatedAt: string;
  allCaughtUp?: boolean; // true when all available feed articles have already been seen
}
