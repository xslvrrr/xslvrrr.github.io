import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';

export default function ProgressBar() {
  const location = useRouterState({ select: (state) => state.location });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLoading(true);
    setProgress(65);

    const timer = window.setTimeout(() => {
      setProgress(100);
      window.setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [location.href]);

  if (!loading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, #4a90e2, #5da9ff)',
        transform: `translateX(${progress - 100}%)`,
        transition: 'transform 0.2s ease',
        zIndex: 9999,
      }}
    />
  );
}
