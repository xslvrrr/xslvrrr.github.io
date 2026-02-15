import { ReactNode } from 'react';
import styles from '../styles/PageTransition.module.css';

interface PageTransitionProps {
  children: ReactNode;
  isLoading?: boolean;
}

export const PageTransition = ({ children, isLoading }: PageTransitionProps) => {
  return (
    <div className={`${styles.pageTransition} ${isLoading ? styles.loading : styles.loaded}`}>
      {children}
    </div>
  );
};

export const InlineLoader = () => {
  return (
    <div className={styles.inlineLoader}>
      <div className={styles.inlineLoaderDot}></div>
      <div className={styles.inlineLoaderDot}></div>
      <div className={styles.inlineLoaderDot}></div>
    </div>
  );
};
