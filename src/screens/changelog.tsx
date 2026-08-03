import { IconClockHour4 } from '@tabler/icons-react';

import { SectionBump } from '@/components/changelog/SectionBump';
import { PublicHeader } from '@/components/public/PublicHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChangelogBumps } from '@/hooks/useChangelogBumps';
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
    const bumps = useChangelogBumps();
    const hasShipped = countdown?.isComplete ?? false;

    return (
        <TooltipProvider>
            <div className={styles.page}>
                <PublicHeader activePage="changelog" />

                <main className={styles.main}>
                    <section className={styles.hero}>
                        <div className={styles.heroInner}>
                            <span className={styles.heroEyebrow}>
                                <IconClockHour4 stroke={1.75} aria-hidden="true" />
                                Next release
                            </span>
                            <p className={styles.heroLead}>
                                {hasShipped
                                    ? 'The next Millennium is here.'
                                    : 'Counting down to the next Millennium.'}
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
                                <p className={styles.heroTarget}>
                                    Released <strong>{NEXT_RELEASE_LABEL}</strong>. Everything below is now live.
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
                        <div className={styles.notesInner}>
                            <nav className={styles.index} aria-label="Changelog sections">
                                <span className={styles.indexLabel}>In this release</span>
                                <ol className={styles.indexList}>
                                    {UPCOMING_CHANGELOG.map((section) => (
                                        <li key={section.id}>
                                            <a className={styles.indexLink} href={`#${section.id}`}>
                                                {section.title}
                                            </a>
                                        </li>
                                    ))}
                                </ol>
                            </nav>

                            <div className={styles.notesBody}>
                                <header className={styles.notesHeader}>
                                    <h1 className={styles.notesTitle}>{UPCOMING_HEADLINE}</h1>
                                    <p className={styles.notesLead}>
                                        This is the largest update Millennium has had — large enough that what
                                        follows may still not be all of it. The application has been rebuilt from the
                                        ground up, gained a native desktop app, an assistant that works on your own
                                        data, and a study system, with a substantial amount of security and
                                        reliability work underneath all of it.
                                    </p>
                                    <p className={styles.notesAllowance}>
                                        {bumps.isReady
                                            ? `Star the features you most want to see. You have ${bumps.state.remaining} of ${bumps.state.maxBumps} bumps remaining.`
                                            : 'Star the features you most want to see.'}
                                    </p>
                                    {bumps.error ? (
                                        <p className={styles.notesError} role="status">
                                            {bumps.error}
                                        </p>
                                    ) : null}
                                </header>

                                <div className={styles.sections}>
                                    {UPCOMING_CHANGELOG.map((section) => (
                                        <article key={section.id} id={section.id} className={styles.section}>
                                            <div className={styles.sectionHead}>
                                                <div className={styles.sectionHeadText}>
                                                    <h2 className={styles.sectionTitle}>{section.title}</h2>
                                                    <p className={styles.sectionSummary}>{section.summary}</p>
                                                </div>
                                                <SectionBump
                                                    sectionId={section.id}
                                                    sectionTitle={section.title}
                                                    count={bumps.state.counts[section.id] ?? 0}
                                                    hasBumped={bumps.state.bumped.includes(section.id)}
                                                    remaining={bumps.state.remaining}
                                                    maxBumps={bumps.state.maxBumps}
                                                    isReady={bumps.isReady}
                                                    isSubmitting={bumps.isSubmitting}
                                                    onConfirm={bumps.bump}
                                                />
                                            </div>

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

                                <p className={styles.notesFooter}>
                                    And a great deal more that did not fit on this page.
                                </p>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </TooltipProvider>
    );
}
