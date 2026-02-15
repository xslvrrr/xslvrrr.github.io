import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconCircleCheck, IconAlertTriangle, IconDownload, IconRefresh, IconExternalLink, IconBrandChrome, IconBrandFirefox } from '@tabler/icons-react';
import styles from '../styles/Login.module.css';

type Step = 'checking' | 'install' | 'sync' | 'ready' | 'syncing';
type BrowserType = 'chrome' | 'firefox' | 'edge' | 'safari' | 'other';

// Browser detection utility
function detectBrowser(): BrowserType {
  if (typeof window === 'undefined') return 'other';

  const ua = navigator.userAgent.toLowerCase();

  // Order matters: Edge contains "chrome", Firefox is distinct
  if (ua.includes('firefox') || ua.includes('fxios')) {
    return 'firefox';
  }
  if (ua.includes('edg/') || ua.includes('edge/')) {
    return 'edge';
  }
  if (ua.includes('chrome') || ua.includes('crios')) {
    return 'chrome';
  }
  if (ua.includes('safari') && !ua.includes('chrome')) {
    return 'safari';
  }

  return 'other';
}

interface ExtensionData {
  timetable?: any[] | { weekA?: any[]; weekB?: any[] };
  notices?: any[];
  grades?: any[];
  attendance?: any[];
  user?: { name: string; school: string };
}

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('checking');
  const [extensionData, setExtensionData] = useState<ExtensionData | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [browser, setBrowser] = useState<BrowserType>('other');

  // Detect browser on mount
  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  // Browser-specific download info
  const downloadInfo = useMemo(() => {
    const isFirefox = browser === 'firefox';
    return {
      href: isFirefox ? '/extension-firefox.zip' : '/extension.zip',
      filename: isFirefox ? 'millennium-sync-firefox.zip' : 'millennium-sync-extension.zip',
      icon: isFirefox ? <IconBrandFirefox size={18} /> : <IconBrandChrome size={18} />,
      browserName: isFirefox ? 'Firefox' : (browser === 'edge' ? 'Edge' : 'Chrome'),
      extensionsPage: isFirefox ? 'about:debugging#/runtime/this-firefox' : 'chrome://extensions',
      instructions: isFirefox ? [
        'Download the extension below',
        'Open about:debugging in Firefox',
        'Click "This Firefox" → "Load Temporary Add-on"',
        'Select any file in the unzipped folder'
      ] : [
        'Download the extension below',
        'Open chrome://extensions',
        'Enable "Developer mode"',
        'Unzip and click "Load unpacked"'
      ]
    };
  }, [browser]);

  // Transition helper
  const transition = (newStep: Step) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(newStep);
      setIsTransitioning(false);
    }, 400);
  };

  // Handle token from URL (from extension redirect)
  const handleTokenLogin = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/extension/token-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setNotification({ type: 'success', message: `Welcome, ${data.user?.name || 'Student'}!` });
        // Now check for data again (session should be established)
        setTimeout(checkExtension, 500);
        return true;
      } else {
        setNotification({ type: 'error', message: 'Login token expired. Please sync again.' });
        transition('sync');
        return false;
      }
    } catch (error) {
      console.error('Token login failed:', error);
      transition('sync');
      return false;
    }
  }, []);

  // Check for extension data
  const checkExtension = useCallback(async () => {
    try {
      // Check API for synced data
      const response = await fetch('/api/extension/data');
      let data: any = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.log('Extension check failed: invalid JSON response', parseError);
        throw parseError;
      }

      // Check if we have valid data (timetable can be object or array)
      const hasTimetable = data.timetable && (
        Array.isArray(data.timetable) ? data.timetable.length > 0 :
          (data.timetable.weekA?.length > 0 || data.timetable.weekB?.length > 0)
      );

      if (response.ok && data && data.user && hasTimetable) {
        setExtensionData(data);
        transition('ready');
        return true;
      }

      // If API says needsSync, user has valid session but no data yet
      if (data.needsSync) {
        transition('sync');
        return true;
      }
    } catch (error) {
      console.log('Extension check failed:', error);
    }

    // No valid session - show install page
    // Clear any stale localStorage marker
    localStorage.removeItem('millennium-extension-installed');
    transition('install');
    return false;
  }, []);

  useEffect(() => {
    // Check for token in URL (from extension redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      // Remove token from URL to prevent reuse
      window.history.replaceState({}, '', '/login');
      handleTokenLogin(token);
    } else {
      // Normal check
      const timer = setTimeout(checkExtension, 500);
      return () => clearTimeout(timer);
    }
  }, [checkExtension, handleTokenLogin]);

  // Mark extension as installed
  const handleExtensionInstalled = () => {
    localStorage.setItem('millennium-extension-installed', 'true');
    transition('sync');
  };

  // Go to portal for syncing
  const handleGoToPortal = () => {
    window.open('https://millennium.education/portal/', '_blank');
    setNotification({ type: 'success', message: 'Sync your data, then return here' });
  };

  // Recheck for data
  const handleRecheck = async () => {
    setIsLoading(true);
    const found = await checkExtension();
    setIsLoading(false);

    if (!found && step === 'sync') {
      setNotification({ type: 'error', message: 'No data found. Please sync on the portal first.' });
    }
  };

  // Go to dashboard
  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  const renderLoadingDots = () => (
    <div className={styles.loadingDots}>
      <div className={styles.dot}></div>
      <div className={styles.dot}></div>
      <div className={styles.dot}></div>
    </div>
  );

  const renderNotification = () => {
    if (!notification.type) return null;

    const icons = {
      success: <IconCircleCheck size={24} className={styles.notificationIcon} style={{ color: '#28c076' }} />,
      error: <IconAlertTriangle size={24} className={styles.notificationIcon} style={{ color: '#ff5a6a' }} />
    };

    return (
      <div className={`${styles.notification} ${styles[notification.type]}`}>
        {icons[notification.type]}
        <span>{notification.message}</span>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Log In - Millennium Portal</title>
        <meta name="description" content="Sign in to your Millennium student portal" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" />
      </Head>

      <div className={styles.loginBody}>
        <div className={`${styles.loginContainer} ${styles.fadeIn}`}>
          <div className={`${styles.loginHeader} ${isTransitioning ? styles.fadeOut : ''}`}>
            <img src="/Assets/Millennium Logo.png" alt="Millennium Logo" className={styles.loginLogo} />
            <h1 className={styles.loginTitle}>Log in to Millennium</h1>
          </div>

          {/* Step 1: Checking for extension */}
          {step === 'checking' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Checking for extension...</h2>
              {renderLoadingDots()}
            </div>
          )}

          {/* Step 2: Install extension */}
          {step === 'install' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Install the {downloadInfo.browserName} extension</h2>
              <p className={styles.questionSubtitle}>
                The extension syncs your portal data securely from your browser.
              </p>

              <div className={styles.verificationDisplay}>
                <div className={styles.verificationFields}>
                  {downloadInfo.instructions.map((instruction, idx) => (
                    <div className={styles.fieldRow} key={idx}>
                      <div className={styles.fieldLabel}>{idx + 1}.</div>
                      <div className={styles.fieldValue}>{instruction}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.questionButtons}>
                <a
                  href={downloadInfo.href}
                  download={downloadInfo.filename}
                  className={styles.submitBtn}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {downloadInfo.icon}
                  Download for {downloadInfo.browserName}
                </a>
              </div>

              {browser !== 'firefox' && browser !== 'chrome' && browser !== 'edge' && (
                <p className={styles.questionSubtitle} style={{ marginTop: '16px', fontSize: '12px' }}>
                  Using a different browser? Download for{' '}
                  <a href="/extension-firefox.zip" download="millennium-sync-firefox.zip" style={{ color: '#6468F0' }}>Firefox</a>
                  {' '}or{' '}
                  <a href="/extension.zip" download="millennium-sync-extension.zip" style={{ color: '#6468F0' }}>Chrome/Edge</a>
                </p>
              )}

              <button
                onClick={handleExtensionInstalled}
                className={styles.backLink}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: '24px' }}
              >
                I've installed it →
              </button>
            </div>
          )}

          {/* Step 3: Sync data */}
          {step === 'sync' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Sync your portal data</h2>
              <p className={styles.questionSubtitle}>
                Open the Millennium portal and log in normally. The extension will sync your data automatically.
              </p>

              {renderNotification()}

              <div className={styles.questionButtons}>
                <button
                  className={styles.backBtn}
                  onClick={handleRecheck}
                  disabled={isLoading}
                >
                  {isLoading ? 'Checking...' : 'Check Again'}
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleGoToPortal}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <IconExternalLink size={18} />
                  Open Portal
                </button>
              </div>

              <button
                onClick={() => transition('install')}
                className={styles.backLink}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: '24px' }}
              >
                ← Back to install instructions
              </button>
            </div>
          )}

          {/* Step 4: Ready */}
          {step === 'ready' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Data synced successfully!</h2>
              <p className={styles.questionSubtitle}>
                Welcome back, {extensionData?.user?.name || 'Student'}
              </p>

              <div className={styles.verificationDisplay}>
                <div className={styles.verificationFields}>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Classes</div>
                    <div className={styles.fieldValue}>
                      {Array.isArray(extensionData?.timetable)
                        ? extensionData.timetable.length
                        : ((extensionData?.timetable?.weekA?.length || 0) + (extensionData?.timetable?.weekB?.length || 0))}
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Notices</div>
                    <div className={styles.fieldValue}>{extensionData?.notices?.length || 0}</div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Grades</div>
                    <div className={styles.fieldValue}>{extensionData?.grades?.length || 0}</div>
                  </div>
                </div>
              </div>

              <div className={styles.completionButtons}>
                <button
                  className={styles.submitBtn}
                  onClick={handleGoToDashboard}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <IconCircleCheck size={18} />
                  Open Dashboard
                </button>
                <button
                  className={styles.tryAgainBtn}
                  onClick={handleGoToPortal}
                >
                  Sync Again
                </button>
              </div>
            </div>
          )}

          <div className={`${styles.returnLinkContainer} ${isTransitioning ? styles.fadeOut : ''}`}>
            <Link href="/" className={styles.returnLink}>
              Return to main page
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
