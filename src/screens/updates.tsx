import { PublicHeader } from '@/components/public/PublicHeader';
import styles from '@/styles/Home.module.css';

const updates = [
    {
        date: 'July 2026',
        title: 'Landing preview',
        body: 'The opening page now links directly into a preview-safe dashboard view with local account data and gated tools removed.',
    },
];

export default function UpdatesPage() {
    return (
        <div className={styles.page}>
            <PublicHeader />

            <main className={styles.updatesPage}>
                <div className={styles.container}>
                    <h1 className={styles.updatesTitle}>What&apos;s New?</h1>
                    <div className={styles.updatesList}>
                        {updates.map((update) => (
                            <article key={update.title} className={styles.updateItem}>
                                <time>{update.date}</time>
                                <h2>{update.title}</h2>
                                <p>{update.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
