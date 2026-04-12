import { useState } from 'react';

const INTERESTS: Array<{ key: string; label: string }> = [
  { key: 'technology', label: 'Technology' },
  { key: 'ai',         label: 'AI & Machine Learning' },
  { key: 'finance',    label: 'Finance & Markets' },
  { key: 'science',    label: 'Science' },
  { key: 'design',     label: 'Design & UX' },
  { key: 'business',   label: 'Business & Startups' },
  { key: 'climate',    label: 'Climate' },
  { key: 'culture',    label: 'Arts & Culture' },
  { key: 'health',     label: 'Health & Medicine' },
];

interface Props {
  onSubmit: (interests: string[]) => void;
}

export default function SetupView({ onSubmit }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSubmit() {
    if (selected.size === 0) return;
    onSubmit([...selected]);
  }

  return (
    <div className="setup-view">
      <p className="setup-eyebrow">Your morning read, curated by AI</p>
      <h1 className="setup-headline">What do you want to think about today?</h1>
      <p className="setup-sub">
        Pick your interests and we'll pull the best long-form pieces from across the web — curated every morning.
      </p>

      <div className="chip-grid">
        {INTERESTS.map(({ key, label }) => (
          <button
            key={key}
            className={`chip ${selected.has(key) ? 'selected' : ''}`}
            onClick={() => toggle(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <button
        className="setup-cta"
        disabled={selected.size === 0}
        onClick={handleSubmit}
      >
        Build my digest →
      </button>
    </div>
  );
}
