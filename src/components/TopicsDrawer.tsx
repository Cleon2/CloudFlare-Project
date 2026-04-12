import { useState, useEffect } from 'react';
import { TOPIC_COLOURS, TOPIC_LABELS } from '../types';

const ALL_TOPICS = Object.keys(TOPIC_LABELS);

interface Props {
  open: boolean;
  currentInterests: string[];
  onClose: () => void;
  onApply: (interests: string[]) => void;
}

export default function TopicsDrawer({ open, currentInterests, onClose, onApply }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentInterests));

  // Sync when drawer opens with latest interests
  useEffect(() => {
    if (open) setSelected(new Set(currentInterests));
  }, [open, currentInterests]);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleApply() {
    if (selected.size === 0) return;
    onApply([...selected]);
  }

  const changed = (
    selected.size !== currentInterests.length ||
    [...selected].some(k => !currentInterests.includes(k))
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className={`topics-drawer ${open ? 'open' : ''}`} role="dialog" aria-label="Change topics">
        <div className="drawer-header">
          <span className="drawer-title">Your topics</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          <p className="drawer-hint">
            Toggle topics on or off. Hit Apply and your digest will rebuild with the new selection.
          </p>

          <div className="drawer-chip-grid">
            {ALL_TOPICS.map(key => {
              const colour = TOPIC_COLOURS[key] ?? '#999';
              const isSelected = selected.has(key);
              return (
                <button
                  key={key}
                  className={`drawer-chip ${isSelected ? 'selected' : ''}`}
                  style={{ '--topic-color': colour } as React.CSSProperties}
                  onClick={() => toggle(key)}
                  type="button"
                >
                  <span className="drawer-chip-dot" />
                  <span className="drawer-chip-label">{TOPIC_LABELS[key]}</span>
                  <span className="drawer-chip-check">✓</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="drawer-footer">
          <button
            className="drawer-apply"
            disabled={selected.size === 0 || !changed}
            onClick={handleApply}
          >
            {changed ? 'Apply & rebuild digest' : 'No changes'}
          </button>
        </div>
      </div>
    </>
  );
}
