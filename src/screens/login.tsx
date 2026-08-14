import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
// native img elements replace framework image optimization
import { useAppRouter as useRouter } from '@/start/router';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import styles from '@/styles/Login.module.css';
import {
  beginDesktopBrowserLogin,
  beginDesktopLoginTransaction,
  completeDesktopLogin,
  completeDesktopPortalLogin,
  completeTokenLogin,
  rollbackDesktopLogin,
} from '@/lib/desktop/auth';
import { isDesktopApp } from '@/lib/desktop/utils';
import { getTokenLoginFallbackData, getTransitionTarget, hasReadyPortalData } from './loginState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { readDataSettings, toPortalSyncOptions } from '@/lib/data-settings';
import { useDesktopBootstrap } from '@/hooks/useDesktopBootstrap';
import { fetchJsonWithTimeout, fetchRequiredJsonWithTimeout, HttpProtocolError } from '@/lib/http';
import { clearPortalDataCache, writePortalDataCache } from '@/lib/desktop/storage';
import DotField from '@/components/backgrounds/DotField';

type Step = 'checking' | 'login' | 'ready' | 'syncing';

interface PortalDataSummary {
  timetable?: any[] | { weekA?: any[]; weekB?: any[] };
  notices?: any[];
  grades?: any[];
  attendance?: any[];
  user?: { name: string; school: string; uid?: string };
}

interface PortalLoginSuccessPayload extends PortalDataSummary {
  success: true;
  userId: string;
  user: { name: string; school: string; uid?: string };
  syncWarnings?: string[];
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPortalLoginSuccessPayload(value: unknown): value is PortalLoginSuccessPayload {
  if (!isRecord(value) || value.success !== true || typeof value.userId !== 'string' || !value.userId.trim()) {
    return false;
  }
  if (
    !isRecord(value.user)
    || typeof value.user.name !== 'string'
    || !value.user.name.trim()
    || typeof value.user.school !== 'string'
    || !value.user.school.trim()
  ) {
    return false;
  }
  if (value.user.uid !== undefined && typeof value.user.uid !== 'string') return false;
  if (
    value.syncWarnings !== undefined
    && (!Array.isArray(value.syncWarnings) || value.syncWarnings.some((warning) => typeof warning !== 'string'))
  ) {
    return false;
  }
  return true;
}

function getPortalLoginErrorMessage(value: unknown): string {
  return isRecord(value) && typeof value.message === 'string' && value.message.trim()
    ? value.message
    : 'Login failed';
}

let globalLoginProcessedToken: string | null = null;

export default function Login() {
  const router = useRouter();
  const desktopBoot = useDesktopBootstrap();
  const [step, setStep] = useState<Step>('checking');
  const [portalData, setPortalData] = useState<PortalDataSummary | null>(null);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [loginStatus, setLoginStatus] = useState('Connecting to Millennium…');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const stepRef = useRef<Step>('checking');
  const pendingTransitionStepRef = useRef<Step | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopApp() || !desktopBoot.error) return;
    setNotification({ type: 'error', message: desktopBoot.error });
  }, [desktopBoot.error]);

  useEffect(() => {
    const savedUsername = localStorage.getItem('millennium-portal-username-v1');
    if (savedUsername) {
      setCredentials((current) => ({ ...current, username: savedUsername }));
    }
  }, []);

  // Transition helper
  const transition = (newStep: Step) => {
    const nextStep = getTransitionTarget(stepRef.current, pendingTransitionStepRef.current, newStep) as Step | null;
    if (!nextStep) return;

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    pendingTransitionStepRef.current = nextStep;
    setIsTransitioning(true);
    transitionTimeoutRef.current = setTimeout(() => {
      stepRef.current = nextStep;
      setStep(nextStep);
      setIsTransitioning(false);
      pendingTransitionStepRef.current = null;
      transitionTimeoutRef.current = null;
    }, 400);
  };

  const showStepNow = (newStep: Step) => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    pendingTransitionStepRef.current = null;
    stepRef.current = newStep;
    setStep(newStep);
    setIsTransitioning(false);
  };

  const cleanTokenFromUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('state');
    const search = url.searchParams.toString();
    const cleanUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    window.history.replaceState({}, '', cleanUrl);
  }, []);

  const completeBrowserDesktopHandoff = useCallback(async (): Promise<boolean> => {
    if (isDesktopApp()) return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') !== '1') return false;
    const codeChallenge = params.get('codeChallenge');
    const state = params.get('state');
    if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || !state || !/^[A-Za-z0-9_-]{32}$/.test(state)) {
      throw new Error('Desktop sign-in request is invalid or expired.');
    }

    const response = await fetch('/api/desktop/login-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeChallenge }),
    });
    const result = await response.json().catch(() => null) as { token?: string; message?: string } | null;
    if (!response.ok || !result?.token) {
      throw new Error(result?.message || 'Could not prepare desktop sign-in.');
    }
    await router.push(`/app-open?token=${encodeURIComponent(result.token)}&state=${encodeURIComponent(state)}`);
    return true;
  }, [router]);

  const checkPortalData = useCallback(async () => {
    try {
      // Check API for synced data
      const { response, data } = await fetchJsonWithTimeout<any>('/api/portal/data', {
        timeout: 10_000,
        cache: 'no-store',
      });

      if (response.ok && hasReadyPortalData(data)) {
        const ownerId = typeof data?.userId === 'string' ? data.userId : data?.user?.uid;
        if (isDesktopApp()) {
          if (!ownerId) throw new Error('Portal session did not include an account owner.');
          await completeDesktopPortalLogin(data, ownerId);
        } else {
          await writePortalDataCache(data, ownerId).catch(() => {});
        }
        setPortalData(data);
        if (await completeBrowserDesktopHandoff()) return true;
        transition('ready');
        return true;
      }

      // If API says needsSync, user has valid session but no data yet
      if (data.needsSync) {
        transition('login');
        return true;
      }
    } catch (error) {
      console.log('Portal data check failed:', error);
    }

    transition('login');
    return false;
  }, [completeBrowserDesktopHandoff]);

  useEffect(() => {
    // Compatibility for desktop/app handoff tokens.
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const desktopState = urlParams.get('state');

    if (token) {
      if (globalLoginProcessedToken === token) return;
      globalLoginProcessedToken = token;
      showStepNow('syncing');

      const loginPromise = isDesktopApp()
        ? desktopState
          ? completeDesktopLogin(token, desktopState)
          : Promise.reject(new Error('Desktop login state is missing.'))
        : completeTokenLogin(token);

      loginPromise
        .then(async (result) => {
          if (!isDesktopApp()) await clearPortalDataCache().catch(() => {});
          cleanTokenFromUrl();
          showStepNow('syncing');

          const handledLoginState = await checkPortalData();
          const fallbackData = getTokenLoginFallbackData(result);
          if (!handledLoginState && fallbackData) {
            setPortalData(fallbackData);
            transition('ready');
          }
        })
        .catch(err => {
          console.error('[Login] Token login failed:', err);
          cleanTokenFromUrl();
          setNotification({
            type: 'error',
            message: err instanceof Error ? err.message : 'Login token was invalid or expired. Please sync again.'
          });
          transition('login');
        });
      return;
    }

    // Normal check
    const timer = setTimeout(checkPortalData, 500);
    return () => clearTimeout(timer);
  }, [checkPortalData, cleanTokenFromUrl, router]);

  const handlePortalLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPortalCredentials(credentials);
  };

  const handleBrowserLogin = async () => {
    setIsOpeningBrowser(true);
    setNotification({ type: null, message: '' });
    try {
      await beginDesktopBrowserLogin();
    } catch (error: unknown) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not open browser sign-in.',
      });
    } finally {
      setIsOpeningBrowser(false);
    }
  };

  const submitPortalCredentials = async (nextCredentials: { username: string; password: string }) => {
    let desktopAuthRequestStarted = false;
    let desktopLoginCommitted = false;
    setIsLoading(true);
    setLoginStatus('Connecting to Millennium…');
    setNotification({ type: null, message: '' });

    try {
      if (isDesktopApp()) {
        beginDesktopLoginTransaction();
        desktopAuthRequestStarted = true;
      }
      const { response, data } = await fetchRequiredJsonWithTimeout<unknown>('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nextCredentials,
          rememberCredentials,
          syncOptions: toPortalSyncOptions(readDataSettings()),
        }),
        timeout: 210_000,
      }, {
        name: 'Portal login response',
      });
      setLoginStatus('Verifying portal response…');
      if (!response.ok) {
        throw new Error(getPortalLoginErrorMessage(data));
      }
      if (!isPortalLoginSuccessPayload(data)) {
        throw new HttpProtocolError(response, 'Portal login response did not match the expected success contract');
      }

      if (!rememberCredentials) {
        localStorage.removeItem('millennium-portal-username-v1');
        localStorage.removeItem('millennium-portal-key-v1');
        localStorage.removeItem('millennium-portal-credentials-v1');
      } else {
        localStorage.setItem('millennium-portal-username-v1', nextCredentials.username.trim());
      }
      setCredentials(nextCredentials);
      const portalData = data;
      setLoginStatus('Saving synced data…');
      if (isDesktopApp()) {
        await completeDesktopPortalLogin(portalData, data.userId);
        desktopLoginCommitted = true;
      } else {
        await writePortalDataCache(portalData, data.userId).catch(() => {});
      }
      setPortalData(portalData);
      setLoginStatus('Finishing sign-in…');
      if (await completeBrowserDesktopHandoff()) return;
      if (Array.isArray(data?.syncWarnings) && data.syncWarnings.length > 0) {
        setNotification({ type: 'error', message: data.syncWarnings.join(' ') });
      }
      setLoginStatus('Preparing dashboard…');
      transition('ready');
    } catch (error) {
      // Proxy/browser requests can lose their final response after the legacy
      // portal completed login. Confirm durable session/data before rejecting
      // credentials or rolling back the desktop session.
      setLoginStatus('Confirming portal session…');
      const recovered = await fetchJsonWithTimeout<any>('/api/portal/data', {
        timeout: 10_000,
        cache: 'no-store',
      }).catch(() => null);
      if (recovered?.response.ok && hasReadyPortalData(recovered.data)) {
        try {
          setLoginStatus('Saving recovered data…');
          const recoveredOwnerId = typeof recovered.data?.userId === 'string'
            ? recovered.data.userId
            : recovered.data?.user?.uid;
          if (isDesktopApp()) {
            if (!recoveredOwnerId) throw new Error('Recovered portal session did not include an account owner.');
            await completeDesktopPortalLogin(recovered.data, recoveredOwnerId);
            desktopLoginCommitted = true;
          } else {
            await writePortalDataCache(recovered.data, recoveredOwnerId).catch(() => {});
          }
          setPortalData(recovered.data);
          setLoginStatus('Finishing sign-in…');
          if (await completeBrowserDesktopHandoff()) return;
          setLoginStatus('Preparing dashboard…');
          transition('ready');
          return;
        } catch (recoveryError: unknown) {
          if (isDesktopApp() && desktopAuthRequestStarted && !desktopLoginCommitted) {
            await rollbackDesktopLogin();
          }
          setNotification({
            type: 'error',
            message: recoveryError instanceof Error ? recoveryError.message : 'Desktop login could not be persisted.',
          });
          return;
        }
      }

      if (isDesktopApp() && desktopAuthRequestStarted && !desktopLoginCommitted) {
        await rollbackDesktopLogin();
      }
      setNotification({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : isDesktopApp()
            ? 'Desktop login failed'
            : 'Login failed'
      });
    } finally {
      setIsLoading(false);
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

      <div className={styles.loginBody}>
        <DotField
          className={styles.dotField}
          style={{ position: 'absolute', inset: 0 }}
          dotRadius={3}
          dotSpacing={12}
          cursorRadius={360}
          bulgeStrength={48}
          glowRadius={220}
          gradientFrom="rgba(247, 248, 248, 0.18)"
          gradientTo="rgba(112, 115, 255, 0.204)"
          glowColor="#171925"
        />
        <div className={`${styles.loginContainer} ${styles.fadeIn}`}>
          <div className={`${styles.loginHeader} ${isTransitioning ? styles.fadeOut : ''}`}>
            <img src="/Assets/Millennium Logo.png" alt="Millennium Logo" className={styles.loginLogo} width={48} height={48} />
            <h1 className={styles.loginTitle}>Log in to Millennium</h1>
          </div>

          {/* Check for an existing app session/data before showing the form. */}
          {step === 'checking' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Checking your session...</h2>
              {renderLoadingDots()}
            </div>
          )}

          {step === 'syncing' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Signing you in...</h2>
              <p className={styles.questionSubtitle}>
                Preparing your dashboard welcome.
              </p>
              {renderLoadingDots()}
            </div>
          )}

          {step === 'login' && (
            <form
              className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}
              onSubmit={handlePortalLogin}
            >
              {renderNotification()}

              <div className={styles.verificationDisplay}>
                <div className={styles.verificationFields}>
                  <div className={styles.loginFieldRow}>
                    <Label htmlFor="millennium-username" className={styles.fieldLabel}>Username</Label>
                    <Input
                      id="millennium-username"
                      className={styles.questionInput}
                      autoComplete="username"
                      value={credentials.username}
                      onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                      required
                    />
                  </div>
                  <div className={styles.loginFieldRow}>
                    <Label htmlFor="millennium-password" className={styles.fieldLabel}>Password</Label>
                    <Input
                      id="millennium-password"
                      className={styles.questionInput}
                      type="password"
                      autoComplete="current-password"
                      value={credentials.password}
                      onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                      required
                    />
                  </div>
                  <div className={styles.rememberRow}>
                    <Checkbox
                      checked={rememberCredentials}
                      onCheckedChange={(checked) => setRememberCredentials(checked === true)}
                    />
                    <span>Save this encrypted login for automatic refreshes.</span>
                  </div>
                </div>
              </div>

              <div className={styles.questionButtons}>
                <Button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isLoading || isOpeningBrowser}
                  aria-busy={isLoading}
                >
                  <span aria-live="polite" aria-atomic="true">
                    {isLoading ? loginStatus : 'Log in and sync'}
                  </span>
                </Button>
                {isDesktopApp() ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.submitBtn}
                    disabled={isLoading || isOpeningBrowser}
                    onClick={() => void handleBrowserLogin()}
                  >
                    {isOpeningBrowser ? 'Opening browser…' : 'Sign in in browser'}
                  </Button>
                ) : null}
              </div>

              <div className={styles.formLinks}>
                <Button type="button" variant="link" onClick={() => router.push('/forgot-password')}>
                  Forgot password
                </Button>
              </div>
            </form>
          )}

          {/* Ready */}
          {step === 'ready' && (
            <div className={`${styles.loginQuestionnaire} ${isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>Data synced successfully!</h2>
              <p className={styles.questionSubtitle}>
                Welcome back, {portalData?.user?.name || 'Student'}
              </p>

              <div className={styles.verificationDisplay}>
                <div className={styles.verificationFields}>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Classes</div>
                    <div className={styles.fieldValue}>
                      {Array.isArray(portalData?.timetable)
                        ? portalData.timetable.length
                        : ((portalData?.timetable?.weekA?.length || 0) + (portalData?.timetable?.weekB?.length || 0))}
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Notices</div>
                    <div className={styles.fieldValue}>{portalData?.notices?.length || 0}</div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Grades</div>
                    <div className={styles.fieldValue}>{portalData?.grades?.length || 0}</div>
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
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
