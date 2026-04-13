import { useState, useEffect, useCallback } from 'react';
import type { View, DailyDigest, SavedArticle, UserProfile } from './types';
import SetupView from './components/SetupView';
import LoadingView from './components/LoadingView';
import ReadingView from './components/ReadingView';
import SavedView from './components/SavedView';
import TopicsDrawer from './components/TopicsDrawer';

export default function App() {
  const [view, setView]                   = useState<View>('setup');
  const [digest, setDigest]               = useState<DailyDigest | null>(null);
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [interests, setInterests]         = useState<string[]>([]);
  const [user, setUser]                   = useState<UserProfile | null>(null);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [prevView, setPrevView]           = useState<View>('setup');
  const [toast, setToast]                 = useState('');
  const [toastVisible, setToastVisible]   = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2200);
  }, []);

  // ── Load user profile ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then((p: UserProfile | null) => { if (p) setUser(p); })
      .catch(() => {});
  }, []);

  // ── Digest loading / polling ──────────────────────────────────────────
  const loadDigest = useCallback(async () => {
    setView('loading');

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch('/api/digest');
        if (res.ok) {
          const data: DailyDigest = await res.json();
          if (data.articles?.length > 0) {
            setDigest(data);
            setCurrentIndex(0);
            setView('reading');
            return;
          }
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 3000));
      return poll();
    };

    poll();
  }, []);

  // ── On mount: resume if user already has preferences ──────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/preferences');
        if (!res.ok) return;
        const prefs: { interests: string[] } = await res.json();
        if (prefs.interests?.length > 0) {
          setInterests(prefs.interests);
          loadDigest();
        }
      } catch { /* first visit */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit interests from setup screen ────────────────────────────────
  const handleSetupSubmit = useCallback(async (selected: string[]) => {
    setInterests(selected);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interests: selected }),
    });
    loadDigest();
  }, [loadDigest]);

  // ── Topics drawer: apply changes ──────────────────────────────────────
  const handleTopicsApply = useCallback(async (newInterests: string[]) => {
    setDrawerOpen(false);
    setInterests(newInterests);
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interests: newInterests }),
    });
    loadDigest();
  }, [loadDigest]);

  // ── Article navigation ────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    const article = digest?.articles[currentIndex];
    if (!article) return;
    fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip', articleUrl: article.url, articleTitle: article.title, articleSource: article.source, articleHook: article.hook }),
    }).catch(() => {});
    const next = currentIndex + 1;
    if (next >= (digest?.articles.length ?? 0)) setView('done');
    else setCurrentIndex(next);
  }, [digest, currentIndex]);

  const handleSave = useCallback(() => {
    const article = digest?.articles[currentIndex];
    if (!article) return;
    fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', articleUrl: article.url, articleTitle: article.title, articleSource: article.source, articleHook: article.hook, articleJson: JSON.stringify(article) }),
    }).catch(() => {});
    showToast('Saved to your library');
    const next = currentIndex + 1;
    if (next >= (digest?.articles.length ?? 0)) setView('done');
    else setCurrentIndex(next);
  }, [digest, currentIndex, showToast]);

  // ── Load more (rebuild digest with same interests) ────────────────────
  const handleLoadMore = useCallback(async () => {
    await fetch('/api/refresh', { method: 'POST' });
    loadDigest();
  }, [loadDigest]);

  // ── Saved view ────────────────────────────────────────────────────────
  const showSaved = useCallback(async () => {
    setPrevView(view);
    setView('saved');
    try {
      const res = await fetch('/api/saved');
      if (res.ok) setSavedArticles(await res.json());
    } catch { /* best effort */ }
  }, [view]);

  const goBack = useCallback(() => setView(prevView), [prevView]);

  // ── Nav rendering ─────────────────────────────────────────────────────
  const renderNavRight = () => {
    if (view === 'saved') {
      return <button className="nav-btn" onClick={goBack}>← Back</button>;
    }
    if (view === 'reading' || view === 'done' || view === 'loading') {
      return (
        <>
          <button className="nav-btn" onClick={showSaved}>Saved</button>
          <button className="nav-btn" onClick={() => setDrawerOpen(true)}>⚙ Topics</button>
          {user && (
            <span className="user-avatar" title={user.email ?? 'You'}>
              {user.initials}
            </span>
          )}
        </>
      );
    }
    return user ? (
      <span className="user-avatar" title={user.email ?? 'You'}>{user.initials}</span>
    ) : null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="nav">
        <button className="nav-logo" onClick={() => { setDigest(null); setView('setup'); }}>
          Morning<span>Digest</span>
        </button>
        <div className="nav-right">{renderNavRight()}</div>
      </nav>

      {view === 'setup' && (
        <SetupView onSubmit={handleSetupSubmit} />
      )}
      {view === 'loading' && (
        <LoadingView />
      )}
      {view === 'reading' && digest && (
        <ReadingView
          digest={digest}
          currentIndex={currentIndex}
          onSkip={handleSkip}
          onSave={handleSave}
          onShowSaved={showSaved}
        />
      )}
      {view === 'done' && (
        <div className="done-view">
          <div className="done-icon">☀︎</div>
          <h2 className="done-headline">You're all caught up.</h2>
          {digest?.allCaughtUp ? (
            <p className="done-sub">
              You've read everything available in your feeds right now. Add more topics, or check back later — feeds refresh throughout the day.
            </p>
          ) : (
            <p className="done-sub">
              That's today's digest. Fetch more to pull fresh articles from your feeds, or come back tomorrow.
            </p>
          )}
          <div className="done-actions">
            {!digest?.allCaughtUp && (
              <button className="btn-primary" onClick={handleLoadMore}>
                Fetch more articles
              </button>
            )}
            <button
              className={digest?.allCaughtUp ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDrawerOpen(true)}
            >
              Change topics
            </button>
            <button className="btn-secondary" onClick={showSaved}>
              View saved articles
            </button>
          </div>
        </div>
      )}
      {view === 'saved' && (
        <SavedView articles={savedArticles} />
      )}

      {/* Topics drawer — available whenever user has gone past setup */}
      {view !== 'setup' && (
        <TopicsDrawer
          open={drawerOpen}
          currentInterests={interests}
          onClose={() => setDrawerOpen(false)}
          onApply={handleTopicsApply}
        />
      )}

      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
