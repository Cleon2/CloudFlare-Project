import { useState, useEffect, useRef, useCallback } from 'react';
import type { DailyDigest } from '../types';
import ArticleContent from './ArticleContent';

interface Props {
  digest: DailyDigest;
  currentIndex: number;
  onSkip: () => void;
  onSave: () => void;
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

