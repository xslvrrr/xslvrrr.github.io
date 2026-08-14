import { AppLink as Link } from '@/start/link';
import { IconShieldLock } from '@tabler/icons-react';
import styles from '@/styles/Login.module.css';

export default function PrivacyPage() {
  return (
    <div className={styles.loginBody}>
      <main className={`${styles.loginContainer} ${styles.fadeIn}`}>
        <div className={styles.loginHeader}>
          <IconShieldLock size={48} className={styles.loginLogo} aria-hidden="true" />
          <h1 className={styles.loginTitle}>Privacy Policy</h1>
        </div>

        <section className={styles.privacyPanel}>
          <p>
            Saved portal passwords are encrypted before storage and are never stored in plaintext. The encrypted server
            copy enables automatic refreshes in the web app.
          </p>
          <p>
            Your username and password are sent to the server only when you ask the app to log in to Millennium.
            They are used for portal login and automatic refreshes and are not returned to the browser or stored in plaintext.
          </p>
          <p>
            Synced portal data is stored to provide dashboard features. Millennium does not use it for advertising.
            Access by operators and infrastructure providers should be limited to support, security, and service delivery
            under the project's operational and institutional policies.
          </p>
          <p>
            When you use the built-in AI assistant, the current dashboard snapshot, your message, enabled skills, and
            attachments you choose may be sent to the configured OpenRouter model provider to answer that request.
            Dashboard notices, attachments, and tool responses are treated as untrusted content;
            dashboard changes require a separate approval. Do not attach information you do not want processed by the provider.
          </p>
          <p>
            Data Settings includes a wipe action for saved portal data, encrypted portal credentials, and local browser cache. Export Settings lets you download the data associated
            with your account, and its account-deletion action removes the account and linked server data. Backup copies
            may persist until the infrastructure backup-retention window expires and require controlled restore handling.
          </p>
          <p>
            To remove the encrypted server copy, log in with “Save this encrypted login” turned off.
          </p>
        </section>

        <Link href="/login" className={styles.returnBtn}>Back to Login</Link>
      </main>
    </div>
  );
}
