import { useState } from 'react';
import type { SavedArticle, ProcessedArticle } from '../types';
import { TOPIC_COLOURS, TOPIC_LABELS } from '../types';
import ArticleContent from './ArticleContent';

interface Props {
  articles: SavedArticle[];
}

export default function SavedView({ articles }: Props) {
  const [selected, setSelected] = useState<ProcessedArticle | null>(null);

  if (selected) {
    return (
      <div className="reading-view">
        <div className="reading-inner">
          <button className="saved-back-btn" onClick={() => setSelected(null)}>
            ← Back to saved
          </button>
          <div className="article-wrap">
            <ArticleContent article={selected} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-view">
      <div className="saved-header">
        <h2>Saved articles</h2>
        {articles.length > 0 && (
          <p style={{ marginTop: 6, fontSize: '.85rem', color: 'var(--text-3)' }}>
            {articles.length} article{articles.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="saved-list">
        {articles.length === 0 ? (
          <p className="saved-empty">
            Nothing saved yet — hit Save on an article to keep it here.
          </p>
        ) : (
          articles.map(article => {
            const colour = TOPIC_COLOURS[article.topic as string] ?? 'var(--accent)';
            const label  = TOPIC_LABELS[article.topic as string]  ?? article.topic;
            const parsed: ProcessedArticle | null = (() => {
              try { return article.article_json ? JSON.parse(article.article_json) : null; }
              catch { return null; }
            })();

            return (
              <button
                key={article.id}
                className="saved-item"
                onClick={() => parsed ? setSelected(parsed) : window.open(article.url, '_blank')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {label && (
                    <span
                      className="topic-badge"
                      style={{ '--topic-color': colour, marginBottom: 0 } as React.CSSProperties}
                    >
                      {label}
                    </span>
                  )}
                  <span className="saved-item-source">{article.source}</span>
                </div>
                <p className="saved-item-title">{article.title}</p>
                {article.hook && <p className="saved-item-hook">{article.hook}</p>}
                <span className="saved-item-cta">
                  {parsed ? 'Read summary →' : 'Open article ↗'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
