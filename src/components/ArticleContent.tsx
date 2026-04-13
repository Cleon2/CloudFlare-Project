import type { ProcessedArticle } from '../types';
import { TOPIC_COLOURS, TOPIC_LABELS } from '../types';

interface Props {
  article: ProcessedArticle;
  index?: number;
  total?: number;
}

export default function ArticleContent({ article, index, total }: Props) {
  const paragraphs = (article.body ?? '').split('\n\n').filter(p => p.trim().length > 0);
  const quotes     = article.pullQuotes ?? [];

  const dateStr = article.pubDate
    ? new Date(article.pubDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const topicColour = TOPIC_COLOURS[article.topic] ?? '#999';
  const topicLabel  = TOPIC_LABELS[article.topic]  ?? article.topic;

  return (
    <>
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
        {index !== undefined && total !== undefined && (
          <span className="article-counter">{index + 1} / {total}</span>
        )}
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
