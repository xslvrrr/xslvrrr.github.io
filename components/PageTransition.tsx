import type { ReactNode } from 'react';
import styles from '../styles/PageTransition.module.css';

interface PageTransitionProps {
  children: ReactNode;
  isLoading?: boolean;
}

export const PageTransition = ({ children, isLoading = false }: PageTransitionProps) => (
  <div className={`${styles.pageTransition} ${isLoading ? styles.loading : styles.loaded}`}>
    {children}
  </div>
);

export const InlineLoader = () => (
  <div className={styles.inlineLoader}>
    <div className={styles.inlineLoaderDot}></div>
    <div className={styles.inlineLoaderDot}></div>
    <div className={styles.inlineLoaderDot}></div>
  </div>
);
