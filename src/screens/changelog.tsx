import { IconClockHour4 } from '@tabler/icons-react';

import { PublicHeader } from '@/components/public/PublicHeader';
import { useCountdown } from '@/hooks/useCountdown';
import {
    NEXT_RELEASE_AT,
    NEXT_RELEASE_LABEL,
    UPCOMING_CHANGELOG,
    UPCOMING_HEADLINE,
} from '@/lib/changelog';
import styles from '@/styles/Changelog.module.css';

const COUNTDOWN_UNITS = [
    { key: 'days', label: 'Days' },
    { key: 'hours', label: 'Hours' },
    { key: 'minutes', label: 'Minutes' },
    { key: 'seconds', label: 'Seconds' },
] as const;

/** Placeholder shown during server render and first paint, before the client clock is known. */
const PENDING_VALUE = '--';

function padUnit(value: number): string {
    return String(value).padStart(2, '0');
}

export default function ChangelogPage() {
    const countdown = useCountdown(NEXT_RELEASE_AT);
    const hasShipped = countdown?.isComplete ?? false;

    return (
        <div className={styles.page}>
            <PublicHeader activePage="changelog" />

            <main className={styles.main}>
                <section className={styles.hero}>
                    <div className={styles.container}>
                        <span className={styles.heroEyebrow}>
                            <IconClockHour4 stroke={1.75} aria-hidden="true" />
                            Next release
                        </span>
                        <p className={styles.heroLead}>
                            {hasShipped ? 'The next Millennium is here.' : 'Counting down to the next Millennium.'}
                        </p>

                        <div
                            className={`${styles.countdown} ${countdown ? '' : styles.countdownPending}`}
                            role="timer"
                            aria-live="off"
                            aria-label={`Time remaining until ${NEXT_RELEASE_LABEL}`}
                        >
                            {COUNTDOWN_UNITS.map((unit) => (
                                <div key={unit.key} className={styles.countdownUnit}>
                                    <span className={styles.countdownValue}>
                                        {countdown ? padUnit(countdown[unit.key]) : PENDING_VALUE}
                                    </span>
                                    <span className={styles.countdownLabel}>{unit.label}</span>
                                </div>
                            ))}
                        </div>

                        {hasShipped ? (
                            <p className={styles.released}>
                                Released {NEXT_RELEASE_LABEL}. Everything below is now live.
                            </p>
                        ) : (
                            <p className={styles.heroTarget}>
                                Landing <strong>{NEXT_RELEASE_LABEL}</strong>. Full release notes replace this
                                countdown the moment it ships.
                            </p>
                        )}
                    </div>
                </section>

                <section className={styles.notes}>
                    <div className={styles.container}>
                        <h1 className={styles.notesTitle}>{UPCOMING_HEADLINE}</h1>
                        <p className={styles.notesLead}>
                            This is the largest update Millennium has had. The application has been rebuilt from
                            the ground up, gained a native desktop app, an assistant that works on your own data,
                            and a study system — with a substantial amount of security work underneath all of it.
                        </p>

                        <div className={styles.sections}>
                            {UPCOMING_CHANGELOG.map((section) => (
                                <article key={section.id} id={section.id} className={styles.section}>
                                    <h2 className={styles.sectionTitle}>{section.title}</h2>
                                    <p className={styles.sectionSummary}>{section.summary}</p>
                                    <ul className={styles.entries}>
                                        {section.entries.map((entry) => (
                                            <li key={entry.title} className={styles.entry}>
                                                <h3 className={styles.entryTitle}>{entry.title}</h3>
                                                <p className={styles.entryBody}>{entry.body}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
