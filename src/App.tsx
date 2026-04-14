import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { DailyDigest, SavedArticle, UserProfile } from './types';
import SetupView from './components/SetupView';
import LoadingView from './components/LoadingView';
import ReadingView from './components/ReadingView';
import SavedView from './components/SavedView';
import TopicsDrawer from './components/TopicsDrawer';

type DigestState = 'loading' | 'reading' | 'done';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [digestState, setDigestState]      = useState<DigestState>('loading');
  const [digest, setDigest]               = useState<DailyDigest | null>(null);
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [lastSkipped, setLastSkipped]     = useState<number | null>(null);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [interests, setInterests]         = useState<string[]>([]);
  const [user, setUser]                   = useState<UserProfile | null>(null);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [toast, setToast]                 = useState('');
  const [toastVisible, setToastVisible]   = useState(false);

  const page = location.pathname === '/saved' ? 'saved'
             : location.pathname === '/setup'  ? 'setup'
             : 'today';

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

  // ── Fetch saved articles (for count badge + saved page) ──────────────
  useEffect(() => {
    fetch('/api/saved')
      .then(r => r.ok ? r.json() : [])
      .then(setSavedArticles)
      .catch(() => {});
  }, []);

  // ── Digest loading / polling ──────────────────────────────────────────
  const loadDigest = useCallback(async () => {
    setDigestState('loading');
    setLastSkipped(null);
    navigate('/today');

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch('/api/digest');
        if (res.ok) {
          const data: DailyDigest = await res.json();
          if (data.articles?.length > 0) {
            setDigest(data);
            setCurrentIndex(0);
            setDigestState('reading');
            return;
          }
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 3000));
      return poll();
    };

    poll();
  }, [navigate]);

  // ── On mount: redirect based on preferences ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/preferences');
        if (!res.ok) {
          if (location.pathname !== '/setup') navigate('/setup');
          return;
        }
        const prefs: { interests: string[] } = await res.json();
        if (prefs.interests?.length > 0) {
          setInterests(prefs.interests);
          if (location.pathname === '/' || location.pathname === '/today') {
            loadDigest();
          } else if (location.pathname === '/saved') {
            fetchSaved();
          }
        } else {
          navigate('/setup');
        }
      } catch {
        navigate('/setup');
      }
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
    setLastSkipped(currentIndex);
    const next = currentIndex + 1;
    if (next >= (digest?.articles.length ?? 0)) setDigestState('done');
    else setCurrentIndex(next);
  }, [digest, currentIndex]);

  const handleUndo = useCallback(() => {
    if (lastSkipped === null) return;
    setCurrentIndex(lastSkipped);
    setLastSkipped(null);
    setDigestState('reading');
  }, [lastSkipped]);

  const handleSave = useCallback(() => {
    const article = digest?.articles[currentIndex];
    if (!article) return;
    fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', articleUrl: article.url, articleTitle: article.title, articleSource: article.source, articleHook: article.hook, articleJson: JSON.stringify(article) }),
    }).catch(() => {});
    setSavedArticles(prev => [...prev, {
      id: Date.now(),
      title: article.title,
      source: article.source,
      url: article.url,
      hook: article.hook,
      topic: article.topic,
      article_json: JSON.stringify(article),
      saved_at: new Date().toISOString(),
    }]);
    showToast('Saved to your library');
    const next = currentIndex + 1;
    if (next >= (digest?.articles.length ?? 0)) setDigestState('done');
    else setCurrentIndex(next);
  }, [digest, currentIndex, showToast]);

  // ── Load more ─────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    await fetch('/api/refresh', { method: 'POST' });
    loadDigest();
  }, [loadDigest]);

  // ── Saved ─────────────────────────────────────────────────────────────
  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/saved');
      if (res.ok) setSavedArticles(await res.json());
    } catch { /* best effort */ }
  }, []);

  const showSaved = useCallback(() => {
    fetchSaved();
    navigate('/saved');
  }, [fetchSaved, navigate]);

  const handleDeleteSaved = useCallback(async (id: number) => {
    setSavedArticles(prev => prev.filter(a => a.id !== id));
    await fetch(`/api/saved/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const showToday = useCallback(() => {
    if (digest) {
      setDigestState('reading');
      navigate('/today');
    } else {
      loadDigest();
    }
  }, [digest, loadDigest, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="nav">
        <button className="nav-logo" onClick={() => navigate(digest ? '/today' : '/setup')}>
          Morning<span>Digest</span>
        </button>
        <div className="nav-right">
          {page === 'saved' && (
            <button className="nav-btn" onClick={showToday}>← Back</button>
          )}
          {(page === 'today') && (
            <>
              <button className="nav-btn" onClick={showSaved}>
                Saved{savedArticles.length > 0 && <span className="nav-badge">{savedArticles.length}</span>}
              </button>
              <button className="nav-btn" onClick={() => setDrawerOpen(true)}>&#9881; Topics</button>
            </>
          )}
          {user && page !== 'setup' && (
            <span className="user-avatar" title={user.email ?? 'You'}>{user.initials}</span>
          )}
          {page === 'setup' && user && (
            <span className="user-avatar" title={user.email ?? 'You'}>{user.initials}</span>
          )}
        </div>
      </nav>


      {page === 'setup' && (
        <SetupView onSubmit={handleSetupSubmit} />
      )}
      {page === 'today' && digestState === 'loading' && (
        <LoadingView />
      )}
      {page === 'today' && digestState === 'reading' && digest && (
        <ReadingView
          digest={digest}
          currentIndex={currentIndex}
          onSkip={handleSkip}
          onSave={handleSave}
          onUndo={handleUndo}
          canUndo={lastSkipped !== null}
        />
      )}
      {page === 'today' && digestState === 'done' && (
        <div className="done-view">
          <div className="done-icon">&#9788;&#65038;</div>
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
          </div>
        </div>
      )}
      {page === 'saved' && (
        <SavedView articles={savedArticles} onDelete={handleDeleteSaved} />
      )}

      {page !== 'setup' && (
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
