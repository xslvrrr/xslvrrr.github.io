import React, { memo } from 'react';
import styles from '../styles/Dashboard.module.css';

interface LoadingSkeletonProps {
  type?: 'card' | 'list' | 'text';
  count?: number;
}

export const LoadingSkeleton = memo(function LoadingSkeleton({ 
  type = 'card', 
  count = 1 
}: LoadingSkeletonProps) {
  if (type === 'list') {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={styles.skeletonItem} style={{
            height: '60px',
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '8px',
            marginBottom: '8px'
          }} />
        ))}
      </>
    );
  }

  if (type === 'text') {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            height: '20px',
            width: `${Math.random() * 40 + 60}%`,
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: '4px',
            marginBottom: '12px'
          }} />
        ))}
      </>
    );
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.card} style={{
          minHeight: '200px',
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite'
        }} />
      ))}
    </>
  );
});

// Add shimmer animation to global styles if not present
if (typeof document !== 'undefined' && !document.querySelector('#shimmer-keyframes')) {
  const style = document.createElement('style');
  style.id = 'shimmer-keyframes';
  style.textContent = `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;
  document.head.appendChild(style);
}
