import { PublicHeader } from '@/components/public/PublicHeader';
import { AppLink as Link } from '@/start/link';
import styles from '@/styles/Home.module.css';

/**
 * The landing page is the hero and nothing else: one claim, one link into the changelog, and a live
 * preview of the dashboard it is describing. The philosophy and AI Agent sections were removed
 * because they advertised surfaces this release does not ship.
 */
export default function Home() {
    return (
        <div className={styles.page}>
            <PublicHeader activePage="home" />

            <main className={styles.main}>
                <section className={styles.hero} aria-labelledby="home-title">
                    <div className={styles.container}>
                        <div className={styles.heroCopy}>
                            <h1 id="home-title" className={styles.heroTitle}>
                                <span>The modern school portal</span>
                                <span>intuitively designed for students</span>
                            </h1>
                            <div className={styles.heroMeta}>
                                <p>Made to work with you, not against.</p>
                                <Link href="/changelog" className={styles.whatsNew}>
                                    What&apos;s New? →
                                </Link>
                            </div>
                        </div>

                        <div className={styles.previewBorder} aria-label="Dashboard preview">
                            <div className={styles.previewSurface}>
                                {/* Decorative only: renders the real dashboard, never accepts input. */}
                                <iframe
                                    src="/dashboard?preview=1#home"
                                    title="Millennium dashboard preview"
                                    className={styles.dashboardFrame}
                                    sandbox="allow-scripts allow-same-origin"
                                    loading="lazy"
                                    aria-hidden="true"
                                    tabIndex={-1}
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
