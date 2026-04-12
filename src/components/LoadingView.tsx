import { useState, useEffect } from 'react';

const MESSAGES = [
  "Scanning this morning's feeds…",
  "Reading the good stuff…",
  "Selecting the sharpest pieces…",
  "Pulling the key passages…",
  "Almost there…",
];

export default function LoadingView() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(i => (i < MESSAGES.length - 1 ? i + 1 : i));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-view">
      <div className="spinner" />
      <p className="loading-label">{MESSAGES[msgIndex]}</p>
    </div>
  );
}
