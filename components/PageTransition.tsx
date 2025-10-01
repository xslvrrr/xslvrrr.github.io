import { useEffect, useState } from 'react';
import styles from '../styles/PageTransition.module.css';

interface PageTransitionProps {
  isLoading: boolean;
}

export function PageTransition({ isLoading }: PageTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
    } else {
      // Small delay before hiding to ensure smooth transition
      const timer = setTimeout(() => setIsVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!isVisible && !isLoading) return null;

  return (
    <div className={`${styles.pageTransition} ${isLoading ? styles.active : styles.fadeOut}`}>
      <div className={styles.loadingBar}>
        <div className={styles.loadingBarFill}></div>
      </div>
    </div>
  );
}
