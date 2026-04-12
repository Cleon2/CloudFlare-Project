import type { SavedArticle } from '../types';
import { TOPIC_COLOURS, TOPIC_LABELS } from '../types';

interface Props {
  articles: SavedArticle[];
}

export default function SavedView({ articles }: Props) {
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
            return (
              <a
                key={article.id}
                className="saved-item"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
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
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
