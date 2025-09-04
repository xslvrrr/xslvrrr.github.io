import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleDebugLogin = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'debug',
          password: 'debug123',
          school: 'Test School',
          isDebug: true
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        router.push('/dashboard');
      } else {
        console.error('Debug login failed:', result.message);
      }
    } catch (error) {
      console.error('Debug login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Millennium</title>
        <link rel="icon" href="/Assets/Millennium Logo.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.page}>
        <header className={styles.navbar} role="banner">
          <div className={styles.navbarInner}>
            <div className={styles.navLeft}>
              <img src="/Assets/Millennium Logo 2.png" alt="Millennium Logo" className={styles.logo} />
            </div>
            <div className={styles.navRight}>
              <a href="/login" className={styles.loginBtn} role="button">Log in</a>
              <button 
                className={`${styles.loginBtn} ${styles.debugAccessBtn}`}
                onClick={handleDebugLogin}
                disabled={isLoading}
                role="button"
              >
                {isLoading ? 'Loading...' : 'Debug Access'}
              </button>
            </div>
          </div>
        </header>

        <main className={styles.content} role="main">
          <div className={styles.heroContainer}>
            <h1 className={styles.title}>
              <span>Millennium redesigned with a</span>
              <span className={styles.reimagined}>fresh new look and features</span>
            </h1>
            <p className={`${styles.subtitle} ${styles.animateSubtitle}`}>
              Meet a brand-new student portal for productivity.<br />
              Designed to be easier on the eyes and highly customisable.
            </p>
            <div className={styles.heroActions}>
              <a href="#" className={`${styles.learnMore} ${styles.animateButton}`} role="button">
                Learn more
              </a>
              <button 
                className={`${styles.tryDemo} ${styles.animateButton}`}
                onClick={handleDebugLogin}
                disabled={isLoading}
                role="button"
              >
                {isLoading ? 'Loading...' : 'Try demo'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
