import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Login.module.css';

interface LoginData {
  username: string;
  password: string;
  school: string;
}

interface LoginState {
  step: 'options' | 'username' | 'password' | 'school' | 'completion';
  loginData: LoginData;
  isLoading: boolean;
  notification: {
    type: 'success' | 'error' | 'unexpected' | null;
    message: string;
  };
  isTransitioning: boolean;
  showPassword: boolean;
}

export default function Login() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({
    step: 'options',
    loginData: { username: '', password: '', school: '' },
    isLoading: false,
    notification: { type: null, message: '' },
    isTransitioning: false,
    showPassword: false
  });
  const [showDoeHint, setShowDoeHint] = useState(false);

  // Check if user came from DoE SSO button
  useEffect(() => {
    if (router.query.doe === 'true') {
      setShowDoeHint(true);
      setState(prev => ({ ...prev, step: 'username' }));
      // Clean up URL
      const { doe, ...rest } = router.query;
      router.replace({ pathname: '/login', query: rest }, undefined, { shallow: true });
    }
  }, [router.query.doe, router]);



  // Parse username to extract first/last name
  const parseDisplayName = (username: string): string => {
    // Handle email format: firstname.lastnamenumber@education.nsw.gov.au
    const emailMatch = username.match(/^([a-z]+)\.([a-z]+)\d*@/i);
    if (emailMatch) {
      const [, first, last] = emailMatch;
      return `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
    }
    
    // Handle username format: firstname.lastnamenumber
    const usernameMatch = username.match(/^([a-z]+)\.([a-z]+)\d*$/i);
    if (usernameMatch) {
      const [, first, last] = usernameMatch;
      return `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
    }
    
    return username;
  };

  // Check if username is a DoE email
  const isDoEEmail = (username: string): boolean => {
    return username.toLowerCase().endsWith('@education.nsw.gov.au');
  };

  const transition = (newStep: LoginState['step'], delay = 400) => {
    setState(prev => ({ ...prev, isTransitioning: true }));
    
    setTimeout(() => {
      setState(prev => ({ ...prev, step: newStep, isTransitioning: false }));
    }, delay);
  };

  const handleInputChange = (field: keyof LoginData, value: string) => {
    setState(prev => ({
      ...prev,
      loginData: { ...prev.loginData, [field]: value }
    }));
  };

  // Handle username submission
  const handleUsernameSubmit = () => {
    const username = state.loginData.username.trim();
    
    // Auto-detect school for DoE emails
    if (isDoEEmail(username)) {
      setState(prev => ({
        ...prev,
        loginData: { 
          ...prev.loginData, 
          school: 'NSW Department of Education' 
        }
      }));
    }
    
    // Always go to password step
    transition('password');
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent, nextAction: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextAction();
    }
  };

  // Reset to questionnaire start on failed login
  const resetToStart = () => {
    setState({
      step: 'username',
      loginData: { username: '', password: '', school: '' },
      isLoading: false,
      notification: { type: null, message: '' },
      isTransitioning: false,
      showPassword: false
    });
  };

  // Handle DoE SSO login
  const handleDoELogin = async () => {
    window.location.href = '/api/auth/sso-login';
  };

  const handleSubmitLogin = async () => {
    // Validate all required fields before submission
    if (!state.loginData.username || !state.loginData.password || !state.loginData.school) {
      setState(prev => ({
        ...prev,
        notification: {
          type: 'error',
          message: 'Please fill in all required fields'
        }
      }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true,
      step: 'completion',
      notification: { type: null, message: '' }
    }));

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.loginData),
      });

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        notification: {
          type: result.success ? 'success' : 'error',
          message: result.message
        }
      }));

      if (result.success) {
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        notification: {
          type: 'error',
          message: 'An unexpected error occurred. Please try again.'
        }
      }));
    }
  };

  const renderNotification = () => {
    if (!state.notification.type) return null;

    const iconSrc = {
      success: '/Assets/check-circle.svg',
      error: '/Assets/triangle-warning.svg',
      unexpected: '/Assets/question-mark.svg'
    }[state.notification.type];

    const iconStyle = {
      success: { filter: 'invert(59%) sepia(63%) saturate(409%) hue-rotate(114deg) brightness(92%) contrast(92%)' },
      error: { filter: 'invert(56%) sepia(38%) saturate(2893%) hue-rotate(316deg) brightness(102%) contrast(101%)' },
      unexpected: { filter: 'invert(50%) sepia(10%) saturate(250%) hue-rotate(180deg) brightness(90%) contrast(80%)' }
    }[state.notification.type];

    return (
      <div className={`${styles.notification} ${styles[state.notification.type]}`}>
        <img 
          src={iconSrc} 
          alt={state.notification.type} 
          className={styles.notificationIcon}
          style={iconStyle}
        />
        <span>{state.notification.message}</span>
      </div>
    );
  };

  const renderLoadingDots = () => (
    <div className={styles.loadingDots}>
      <div className={styles.dot}></div>
      <div className={styles.dot}></div>
      <div className={styles.dot}></div>
    </div>
  );

  const renderVerificationDisplay = () => {
    if (state.step !== 'completion' || state.isLoading) return null;

    return (
      <div className={styles.verificationDisplay}>
        <div className={styles.radioGroup}>
          <label className={`${styles.radioLabel} ${styles.highlight}`}>
            <input type="radio" name="account-type" value="2" checked disabled />
            <span>Student</span>
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="account-type" value="5" disabled />
            <span>Teacher</span>
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="account-type" value="1" disabled />
            <span>Parent</span>
          </label>
        </div>
        <div className={styles.verificationFields}>
          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>Username/Email</div>
            <div className={styles.fieldValue}>{state.loginData.username}</div>
          </div>
          {state.loginData.password && (
            <div className={styles.fieldRow}>
              <div className={styles.fieldLabel}>Password</div>
              <div className={styles.fieldValue}>{'•'.repeat(state.loginData.password.length)}</div>
            </div>
          )}
          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>School</div>
            <div className={styles.fieldValue}>{state.loginData.school}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Log In - Millennium Portal</title>
        <meta name="description" content="Sign in to your Millennium student portal" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.loginBody}>
        <div className={`${styles.loginContainer} ${styles.fadeIn}`}>
          <div className={`${styles.loginHeader} ${state.isTransitioning ? styles.fadeOut : ''}`}>
            <img src="/Assets/Millennium Logo.png" alt="Millennium Logo" className={styles.loginLogo} />
            <h1 className={styles.loginTitle}>Log in to Millennium</h1>
          </div>

          {state.step === 'options' && (
            <div className={`${styles.loginOptions} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <button 
                className={styles.loginOptionBtn}
                onClick={handleDoELogin}
              >
                Continue with NSW DoE
              </button>
              <button 
                className={styles.loginOptionBtn}
                onClick={() => transition('username')}
              >
                Continue with login details
              </button>
            </div>
          )}

          {state.step === 'username' && (
            <div className={`${styles.loginQuestionnaire} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>What&apos;s your username or email?</h2>
              {showDoeHint && (
                <div className={styles.doeHint}>
                  <p>💡 To use DoE SSO, enter your NSW DoE email below</p>
                  <p>You'll still need your password for the questionnaire login</p>
                </div>
              )}
              <input
                type="text"
                className={styles.questionInput}
                placeholder="Enter your username or email"
                value={state.loginData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleUsernameSubmit)}
                autoComplete="username"
                autoFocus
              />
              <div className={styles.questionButtons}>
                <button 
                  className={styles.submitBtn}
                  onClick={handleUsernameSubmit}
                >
                  Submit
                </button>
              </div>
              <a 
                href="#" 
                className={styles.backLink}
                onClick={(e) => {
                  e.preventDefault();
                  transition('options');
                }}
              >
                Back to login options
              </a>
            </div>
          )}

          {state.step === 'password' && (
            <div className={`${styles.loginQuestionnaire} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>What&apos;s your password?</h2>
              <div className={styles.passwordInputContainer}>
                <input
                  type={state.showPassword ? "text" : "password"}
                  className={styles.questionInput}
                  placeholder="Enter your password"
                  value={state.loginData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, () => {
                    if (isDoEEmail(state.loginData.username)) {
                      // Auto-filled school, go directly to submit
                      handleSubmitLogin();
                    } else {
                      transition('school');
                    }
                  })}
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                  aria-label={state.showPassword ? "Hide password" : "Show password"}
                >
                  <img 
                    src={state.showPassword ? "/Assets/eye-crossed.svg" : "/Assets/eye.svg"} 
                    alt={state.showPassword ? "Hide" : "Show"}
                  />
                </button>
              </div>
              <div className={styles.questionButtons}>
                <button 
                  className={styles.backBtn}
                  onClick={() => transition('username')}
                >
                  Back
                </button>
                <button 
                  className={styles.submitBtn}
                  onClick={() => {
                    if (isDoEEmail(state.loginData.username)) {
                      // Auto-filled school, go directly to submit
                      handleSubmitLogin();
                    } else {
                      transition('school');
                    }
                  }}
                >
                  Submit
                </button>
              </div>
              <a 
                href="/forgot-password" 
                className={styles.forgotPasswordLink}
              >
                Forgot your password?
              </a>
            </div>
          )}

          {state.step === 'school' && (
            <div className={`${styles.loginQuestionnaire} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>What&apos;s your school?</h2>
              <input
                type="text"
                className={styles.questionInput}
                placeholder="Enter your school name"
                value={state.loginData.school}
                onChange={(e) => handleInputChange('school', e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleSubmitLogin)}
                autoFocus
              />
              <div className={styles.questionButtons}>
                <button 
                  className={styles.backBtn}
                  onClick={() => transition('password')}
                >
                  Back
                </button>
                <button 
                  className={styles.submitBtn}
                  onClick={handleSubmitLogin}
                >
                  Submit
                </button>
              </div>
            </div>
          )}

          {state.step === 'completion' && (
            <div className={`${styles.loginQuestionnaire} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <h2 className={styles.questionTitle}>
                {state.isLoading 
                  ? 'Verifying your login'
                  : state.notification.type === 'success' 
                    ? 'Login successful'
                    : state.notification.type === 'error'
                      ? 'Login failed'
                      : 'Login status unclear'
                }
              </h2>
              {state.isLoading && (
                <p className={styles.questionSubtitle}>
                  Please wait while we verify your credentials...
                </p>
              )}
              
              {state.isLoading && renderLoadingDots()}
              {renderVerificationDisplay()}
              {renderNotification()}
              
              <div className={styles.completionButtons}>
                {state.notification.type === 'error' && (
                  <button 
                    onClick={resetToStart} 
                    className={styles.tryAgainBtn}
                    type="button"
                  >
                    Try again
                  </button>
                )}
                <button 
                  onClick={() => router.push('/')} 
                  className={styles.returnLinkBtn}
                  type="button"
                >
                  Return to main page
                </button>
              </div>
            </div>
          )}

          {state.step !== 'completion' && (
            <div className={`${styles.returnLinkContainer} ${state.isTransitioning ? styles.fadeOut : ''}`}>
              <button 
                onClick={() => router.push('/')} 
                className={styles.returnLink}
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Return to main page
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
