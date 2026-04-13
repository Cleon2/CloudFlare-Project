import { useState, useEffect, useRef, useCallback } from 'react';
import type { DailyDigest, ProcessedArticle } from '../types';
import { TOPIC_COLOURS, TOPIC_LABELS } from '../types';

interface Props {
  digest: DailyDigest;
  currentIndex: number;
  onSkip: () => void;
  onSave: () => void;
  onShowSaved: () => void;
}

export default function ReadingView({ digest, currentIndex, onSkip, onSave }: Props) {
  const article      = digest.articles[currentIndex];
  const total        = digest.articles.length;
  const progress     = (currentIndex / total) * 100;
  const [exiting, setExiting] = useState(false);
  const prevIndex    = useRef(currentIndex);

  // Trigger exit animation when index changes
  useEffect(() => {
    if (prevIndex.current !== currentIndex) {
      prevIndex.current = currentIndex;
      setExiting(false);
    }
  }, [currentIndex]);

  // Wrap skip/save with exit animation
  const animatedSkip = useCallback(() => {
    setExiting(true);
    setTimeout(onSkip, 200);
  }, [onSkip]);

  const animatedSave = useCallback(() => {
    setExiting(true);
    setTimeout(onSave, 200);
  }, [onSave]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')                   animatedSkip();
      if (e.key === 'ArrowRight' || e.key === 's') animatedSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [animatedSkip, animatedSave]);

  // Touch / swipe
  const touchStart = useRef({ x: 0, y: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 55) {
      dx < 0 ? animatedSkip() : animatedSave();
    }
  };

  return (
    <div
      className="reading-view"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="reading-inner">
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className={`article-wrap ${exiting ? 'exiting' : ''}`}>
          <ArticleContent article={article} index={currentIndex} total={total} />
        </div>
      </div>

      <div className="action-bar">
        <div className="action-bar-inner">
          <button className="btn-action btn-skip" onClick={animatedSkip}>Skip ←</button>

          <div className="progress-dots">
            {digest.articles.map((_, i) => (
              <span key={i} className={`dot ${i === currentIndex ? 'active' : ''}`} />
            ))}
          </div>

          <button className="btn-action btn-save" onClick={animatedSave}>Save →</button>
        </div>
      </div>
    </div>
  );
}

// ── Article content ───────────────────────────────────────────────────────

function ArticleContent({ article, index, total }: { article: ProcessedArticle; index: number; total: number }) {
  const paragraphs = (article.body ?? '').split('\n\n').filter(p => p.trim().length > 0);
  const quotes     = article.pullQuotes ?? [];

  const dateStr = article.pubDate
    ? new Date(article.pubDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const topicColour = TOPIC_COLOURS[article.topic] ?? '#999';
  const topicLabel  = TOPIC_LABELS[article.topic]  ?? article.topic;

  return (
    <>
      {/* Topic badge */}
      {article.topic && (
        <div
          className="topic-badge"
          style={{ '--topic-color': topicColour } as React.CSSProperties}
        >
          {topicLabel}
        </div>
      )}

      <div className="article-meta">
        <span className="article-source">{article.source}</span>
        <span className="meta-dot">·</span>
        {!article.summaryFailed && (
          <>
            <span className="article-readtime">{article.readingMinutes} min read</span>
            <span className="meta-dot">·</span>
          </>
        )}
        <span className="article-counter">{index + 1} / {total}</span>
      </div>

      <h1 className="article-title">{article.title}</h1>

      {article.hook && <p className="article-hook">{article.hook}</p>}

      <p className="article-byline">
        {article.author ? `By ${article.author}` : ''}
        {article.author && dateStr ? ' · ' : ''}
        {dateStr}
      </p>

      {article.summaryFailed ? (
        <div className="summary-failed">
          <p>Summary unavailable for this article.</p>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            Read the full article on {article.source} ↗
          </a>
        </div>
      ) : (
        <>
          <div className="article-body">
            {paragraphs.map((para, i) => (
              <span key={i}>
                <p>{para}</p>
                {i === 1 && quotes[0] && (
                  <blockquote className="pull-quote"><p>{quotes[0]}</p></blockquote>
                )}
                {i === 3 && quotes[1] && (
                  <blockquote className="pull-quote"><p>{quotes[1]}</p></blockquote>
                )}
                {i === 5 && quotes[2] && (
                  <blockquote className="pull-quote"><p>{quotes[2]}</p></blockquote>
                )}
              </span>
            ))}
          </div>

          {article.keyLinks?.length > 0 && (
            <div className="key-links">
              <p className="key-links-label">Referenced in this piece</p>
              {article.keyLinks.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.text || link.url}
                </a>
              ))}
            </div>
          )}

          <a className="read-full" href={article.url} target="_blank" rel="noopener noreferrer">
            Read in full on {article.source} ↗
          </a>
        </>
      )}
    </>
  );
}
