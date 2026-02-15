import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconCircleCheck, IconExternalLink, IconArrowRight } from '@tabler/icons-react';
import styles from '../styles/Login.module.css';

export default function ExtensionInstalled() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation
    setIsVisible(true);
  }, []);

  const handleGoToPortal = () => {
    window.open('https://millennium.education/portal/', '_blank');
  };

  const handleGoToLogin = () => {
    router.push('/login');
  };

  return (
    <>
      <Head>
        <title>Extension Installed - Millennium Portal</title>
        <meta name="description" content="Millennium Portal Sync extension installed successfully" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.loginBody}>
        <div className={`${styles.loginContainer} ${isVisible ? styles.fadeIn : ''}`}>
          <div className={styles.loginHeader}>
            <img src="/Assets/Millennium Logo.png" alt="Millennium Logo" className={styles.loginLogo} />
            <h1 className={styles.loginTitle}>Extension Installed!</h1>
          </div>

          <div className={styles.loginQuestionnaire}>
            <div style={{ 
              width: 64, 
              height: 64, 
              borderRadius: '50%', 
              background: 'rgba(40, 192, 118, 0.15)', 
              border: '1px solid rgba(40, 192, 118, 0.3)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: 24
            }}>
              <IconCircleCheck size={32} color="#28c076" />
            </div>

            <h2 className={styles.questionTitle}>You're almost ready</h2>
            <p className={styles.questionSubtitle}>
              The Millennium Sync extension is now installed. Next, log into the portal to sync your data.
            </p>

            <div className={styles.verificationDisplay}>
              <div className={styles.verificationFields}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>Step 1</div>
                  <div className={styles.fieldValue} style={{ color: '#28c076' }}>Install extension ✓</div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>Step 2</div>
                  <div className={styles.fieldValue}>Log into the portal</div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>Step 3</div>
                  <div className={styles.fieldValue}>Data syncs automatically</div>
                </div>
              </div>
            </div>

            <div className={styles.completionButtons}>
              <button
                className={styles.submitBtn}
                onClick={handleGoToPortal}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <IconExternalLink size={18} />
                Open Millennium Portal
              </button>
              <button
                className={styles.tryAgainBtn}
                onClick={handleGoToLogin}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <IconArrowRight size={18} />
                Continue to Login
              </button>
            </div>
          </div>

          <div className={styles.returnLinkContainer}>
            <Link href="/" className={styles.returnLink}>
              Return to main page
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
