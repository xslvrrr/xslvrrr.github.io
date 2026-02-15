import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Login.module.css';

interface ForgotPasswordState {
  email: string;
  school: string;
  isLoading: boolean;
  notification: {
    type: 'success' | 'error' | null;
    message: string;
  };
}

export default function ForgotPassword() {
  const router = useRouter();
  const [state, setState] = useState<ForgotPasswordState>({
    email: '',
    school: '',
    isLoading: false,
    notification: { type: null, message: '' }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!state.email || !state.school) {
      setState(prev => ({
        ...prev,
        notification: {
          type: 'error',
          message: 'Please enter both email and school name'
        }
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, notification: { type: null, message: '' } }));

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: state.email,
          school: state.school
        }),
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
        // Clear form on success
        setState(prev => ({ ...prev, email: '', school: '' }));
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

  return (
    <>
      <Head>
        <title>Forgot Password - Millennium Portal</title>
        <meta name="description" content="Reset your Millennium portal password" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={styles.loginBody}>
        <div className={`${styles.loginContainer} ${styles.fadeIn}`}>
          <div className={styles.loginHeader}>
            <img src="/Assets/Millennium Logo.png" alt="Millennium Logo" className={styles.loginLogo} />
            <h1 className={styles.loginTitle}>Forgot Password</h1>
          </div>

          <div className={styles.loginQuestionnaire}>
            <h2 className={styles.questionTitle}>Request Temporary Password</h2>
            <p className={styles.questionSubtitle}>
              Enter your email and school name. We&apos;ll send your login details to your email.
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                className={styles.questionInput}
                placeholder="Enter your email address"
                value={state.email}
                onChange={(e) => setState(prev => ({ ...prev, email: e.target.value }))}
                disabled={state.isLoading}
                autoComplete="email"
                autoFocus
              />

              <input
                type="text"
                className={styles.questionInput}
                placeholder="Enter your school name"
                value={state.school}
                onChange={(e) => setState(prev => ({ ...prev, school: e.target.value }))}
                disabled={state.isLoading}
              />

              {state.notification.message && (
                <div className={`${styles.notification} ${styles[state.notification.type || '']}`}>
                  {state.notification.message}
                </div>
              )}

              <div className={styles.questionButtons}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => router.push('/login')}
                  disabled={state.isLoading}
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={state.isLoading}
                >
                  {state.isLoading ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </form>

            <Link
              href="/"
              className={styles.returnLink}
              style={{ display: 'block', marginTop: '24px', textAlign: 'center' }}
            >
              Return to main page
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
