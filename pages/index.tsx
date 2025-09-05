import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();

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
              <button 
                onClick={() => router.push('/login')} 
                className={styles.loginBtn}
                type="button"
              >
                Log in
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
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
