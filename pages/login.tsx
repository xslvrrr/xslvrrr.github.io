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
}

export default function Login() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>({
    step: 'options',
    loginData: { username: '', password: '', school: '' },
    isLoading: false,
    notification: { type: null, message: '' },
    isTransitioning: false
  });



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

  const handleSubmitLogin = async () => {
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
          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>Password</div>
            <div className={styles.fieldValue}>{'•'.repeat(state.loginData.password.length)}</div>
          </div>
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
                onClick={() => alert('NSW DoE login is not implemented yet.')}
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
              <input
                type="text"
                className={styles.questionInput}
                placeholder="Enter your username or email"
                value={state.loginData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                autoComplete="username"
              />
              <div className={styles.questionButtons}>
                <button 
                  className={styles.submitBtn}
                  onClick={() => transition('password')}
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
              <input
                type="password"
                className={styles.questionInput}
                placeholder="Enter your password"
                value={state.loginData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                autoComplete="current-password"
              />
              <div className={styles.questionButtons}>
                <button 
                  className={styles.backBtn}
                  onClick={() => transition('username')}
                >
                  Back
                </button>
                <button 
                  className={styles.submitBtn}
                  onClick={() => transition('school')}
                >
                  Submit
                </button>
              </div>
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
              
              <div className={styles.questionButtons}>
                <button 
                  onClick={() => router.push('/')} 
                  className={styles.returnBtn}
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
