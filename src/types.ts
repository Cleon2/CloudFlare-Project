// Frontend-safe types — no Worker-specific interfaces here

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
}

export interface UserProfile {
  email: string | null;
  initials: string;
}

// Colour assigned to each interest topic — used for badges throughout the UI
export const TOPIC_COLOURS: Record<string, string> = {
  technology: '#3B82F6',
  ai:         '#8B5CF6',
  finance:    '#10B981',
  science:    '#F59E0B',
  design:     '#EF4444',
  business:   '#F97316',
  climate:    '#059669',
  culture:    '#D4622A',
  health:     '#06B6D4',
};

export const TOPIC_LABELS: Record<string, string> = {
  technology: 'Technology',
  ai:         'AI & Machine Learning',
  finance:    'Finance & Markets',
  science:    'Science',
  design:     'Design & UX',
  business:   'Business & Startups',
  climate:    'Climate',
  culture:    'Arts & Culture',
  health:     'Health & Medicine',
};

export interface DailyDigest {
  date: string;
  articles: ProcessedArticle[];
  generatedAt: string;
  allCaughtUp?: boolean;
}

export interface SavedArticle {
  id: number;
  title: string;
  source: string;
  url: string;
  hook: string;
  topic?: string;
  saved_at: string;
}

export type View = 'setup' | 'loading' | 'reading' | 'done' | 'saved';
