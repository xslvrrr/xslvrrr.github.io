import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
    IconArrowRight,
    IconSchool,
    IconBell,
    IconClock,
    IconReportAnalytics,
    IconClipboardCheck,
    IconCalendar,
    IconRocket,
    IconUser,
    IconHeart,
    IconProps,
    IconChevronLeft,
    IconChevronRight,
    IconRefresh,
    IconHome,
    IconSearch,
    IconSettings,
    IconFileText,
    IconActivity,
    IconMailOpened,
    IconArchive,
    IconBook,
    IconInbox,
    IconPin,
    IconAlertCircle
} from '@tabler/icons-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import styles from '../styles/Home.module.css';
import { ForwardRefExoticComponent, RefAttributes } from 'react';

interface FeatureCard {
    id: string;
    title: string;
    description: string;
    fullDescription: string;
    Icon: ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;
    benefits: string[];
}

const features: FeatureCard[] = [
    {
        id: 'timetable',
        title: 'Smart Timetable',
        description: 'View your daily schedule with real-time updates and attendance tracking.',
        fullDescription: 'Access your complete timetable with period times, room locations, and teacher information. Track your attendance status for each class and receive notifications for schedule changes.',
        Icon: IconClock,
        benefits: ['Real-time period updates', 'Room and teacher info', 'Attendance tracking', 'Change notifications'],
    },
    {
        id: 'notifications',
        title: 'Unified Notifications',
        description: 'All your school notices, alerts, and updates in one organized inbox.',
        fullDescription: 'Never miss an important announcement again. Our unified notification system categorizes notices by type—alerts, events, assignments—and lets you pin, archive, or mark items as read.',
        Icon: IconBell,
        benefits: ['Categorized notices', 'Pin important items', 'Archive old notices', 'Mark as read'],
    },
    {
        id: 'classes',
        title: 'Class Management',
        description: 'Stay connected with your teachers and track your academic progress.',
        fullDescription: 'View detailed information about all your enrolled classes, including teacher contact details and class resources. Track assignments, upcoming assessments, and receive personalized updates.',
        Icon: IconSchool,
        benefits: ['Teacher contacts', 'Class resources', 'Assignment tracking', 'Assessment schedules'],
    },
    {
        id: 'reports',
        title: 'Academic Reports',
        description: 'Access your grades, feedback, and performance insights instantly.',
        fullDescription: 'Get comprehensive access to your academic reports and performance data. View historical grades, teacher feedback, and track your progress over time with detailed analytics.',
        Icon: IconReportAnalytics,
        benefits: ['Grade history', 'Teacher feedback', 'Progress tracking', 'Performance analytics'],
    },
    {
        id: 'attendance',
        title: 'Attendance Tracking',
        description: 'Monitor your attendance records and stay on top of your presence.',
        fullDescription: 'Keep track of your attendance across all classes with detailed records. View your attendance percentage, identify patterns, and receive alerts when attention is needed.',
        Icon: IconClipboardCheck,
        benefits: ['Attendance records', 'Percentage tracking', 'Pattern insights', 'Absence alerts'],
    },
    {
        id: 'calendar',
        title: 'School Calendar',
        description: 'Important dates, events, and deadlines all in one place.',
        fullDescription: 'Stay organized with a comprehensive school calendar showing term dates, events, assessment periods, and holidays. Set reminders for important deadlines.',
        Icon: IconCalendar,
        benefits: ['Term dates', 'Event listings', 'Assessment periods', 'Custom reminders'],
    },
];

const pillars = [
    {
        id: 'custom',
        title: 'Make it yours',
        description: 'Tune layouts, visuals, and controls so the platform adapts to your workflow instead of forcing one pattern.',
        visualClass: 'pillarVisualCustom',
    },
    {
        id: 'streamlined',
        title: 'Streamlined experience',
        description: 'Trimmed of filler features so navigation is faster, interactions feel lighter, and everyday actions stay responsive.',
        visualClass: 'pillarVisualStreamlined',
    },
    {
        id: 'workflows',
        title: 'Unite your workflows',
        description: 'Keep planning, updates, and action in one connected flow across your key tools instead of scattered tabs.',
        visualClass: 'pillarVisualWorkflows',
    },
];

const roadmapItems = [
    {
        id: 'release',
        title: 'Release',
        description: 'Public launch of Millennium with the redesigned dashboard, notifications, and core student workflow tools.',
        date: 'Feb 15, 2026',
        released: true,
    },
    {
        id: 'classroom',
        title: 'Google Classroom Integration',
        description: 'Sync assignments, due dates, and class stream updates directly into the Millennium workspace.',
        date: '???',
        released: false,
    },
    {
        id: 'desktop',
        title: 'Desktop App release',
        description: 'A dedicated desktop experience with faster startup, native shortcuts, and offline-friendly sessions.',
        date: '???',
        released: false,
    },
];

const themeAccentOptions = [
    { id: 'indigo', name: 'Indigo', hex: '#6468F0', rgb: '100 104 240', hue: 76 },
    { id: 'azure', name: 'Azure', hex: '#1D9BF0', rgb: '29 155 240', hue: 62 },
    { id: 'cyan', name: 'Cyan', hex: '#06B6D4', rgb: '6 182 212', hue: 56 },
    { id: 'emerald', name: 'Emerald', hex: '#22C55E', rgb: '34 197 94', hue: 44 },
    { id: 'lime', name: 'Lime', hex: '#84CC16', rgb: '132 204 22', hue: 38 },
    { id: 'amber', name: 'Amber', hex: '#F59E0B', rgb: '245 158 11', hue: 29 },
    { id: 'orange', name: 'Orange', hex: '#F97316', rgb: '249 115 22', hue: 24 },
    { id: 'rose', name: 'Rose', hex: '#F43F5E', rgb: '244 63 94', hue: 9 },
    { id: 'magenta', name: 'Magenta', hex: '#D946EF', rgb: '217 70 239', hue: 84 },
    { id: 'violet', name: 'Violet', hex: '#8B5CF6', rgb: '139 92 246', hue: 81 },
];

const themePresetOptions = [
    { id: 'midnight', name: 'Midnight Pulse', subtitle: 'Dark · Gradient', surface: '#0B0D13', panel: '#151924' },
    { id: 'graphite', name: 'Graphite Studio', subtitle: 'Dark · Neutral', surface: '#0D0F12', panel: '#181B1F' },
    { id: 'charcoal', name: 'Charcoal Bloom', subtitle: 'Dark · Soft', surface: '#0D1015', panel: '#161A22' },
];

const notificationPreviewItems = [
    {
        id: 'campus-map',
        title: 'Campus map refresh is live',
        preview: 'Building labels and room aliases were updated for this term.',
        body: 'The internal campus map now includes updated building labels, room aliases, and a quicker lookup for specialist blocks. Use Search to jump directly to your next class location.',
        meta: 'Inbox · 14 Feb 2026',
        unread: true,
    },
    {
        id: 'lunch-pass',
        title: 'Lunch pass queue moved to Gate B',
        preview: 'Pickup window is now next to the canteen courtyard.',
        body: 'From Monday, lunch pass collection will run from Gate B to reduce congestion at the front office. Keep your student ID ready and arrive before the second bell.',
        meta: 'Inbox · 13 Feb 2026',
        unread: true,
    },
    {
        id: 'mock-exams',
        title: 'Mock exam timetable published',
        preview: 'Your exam blocks are now visible in Timetable and Calendar.',
        body: 'The mock exam schedule has been published. Check your updated room allocations and arrival windows. Bring approved stationery and follow seating instructions on arrival.',
        meta: 'Alerts · 13 Feb 2026',
        unread: true,
    },
    {
        id: 'library-hours',
        title: 'Library late hours this Thursday',
        preview: 'Study spaces remain open until 6:00 PM for assessments.',
        body: 'The library will stay open until 6:00 PM this Thursday. Group tables can be booked in 30-minute slots, and silent booths are first-come, first-served.',
        meta: 'Events · 12 Feb 2026',
        unread: false,
    },
    {
        id: 'robotics-signup',
        title: 'Robotics showcase signup closes soon',
        preview: 'Final registrations close at 4:00 PM tomorrow.',
        body: 'Showcase registration closes at 4:00 PM tomorrow. Teams should submit project title, summary, and stage setup requirements before the deadline.',
        meta: 'Inbox · 12 Feb 2026',
        unread: true,
    },
    {
        id: 'studio-room-change',
        title: 'Design studio moved to Room D14',
        preview: 'Today only due to maintenance in the original lab.',
        body: 'The design studio session has been relocated to Room D14 for today due to equipment checks in the regular lab. Please bring your folio and device as usual.',
        meta: 'Alerts · 11 Feb 2026',
        unread: true,
    },
    {
        id: 'sports-trials',
        title: 'Afternoon sports trials reminder',
        preview: 'Arrive 15 minutes early for warmup and check-in.',
        body: 'Students attending sports trials should arrive 15 minutes early for check-in and warmup. Water bottles and appropriate footwear are required.',
        meta: 'Events · 11 Feb 2026',
        unread: false,
    },
    {
        id: 'yearbook-photos',
        title: 'Yearbook photo slots reopened',
        preview: 'Extra times have been added for next week.',
        body: 'Additional yearbook photo sessions are now available next week. Reserve your preferred slot in the Calendar page before all spaces are filled.',
        meta: 'Inbox · 10 Feb 2026',
        unread: true,
    },
    {
        id: 'science-fair-kit',
        title: 'Science fair kit collection',
        preview: 'Collection point is now outside Lab C.',
        body: 'Science fair starter kits can be collected from the table outside Lab C during recess and lunch. One kit per student, while supplies last.',
        meta: 'Events · 10 Feb 2026',
        unread: false,
    },
    {
        id: 'printing-credit',
        title: 'Printing credits top-up complete',
        preview: 'Your balance was refreshed for this month.',
        body: 'Monthly printing credits have been applied to student accounts. You can view your remaining balance in Account > Resources.',
        meta: 'Inbox · 9 Feb 2026',
        unread: false,
    },
    {
        id: 'house-meeting',
        title: 'House meeting starts 8:35 AM',
        preview: 'Check your allocated hall before period one.',
        body: 'House meetings begin at 8:35 AM. Please check your assigned hall and arrive seated before roll is marked.',
        meta: 'Alerts · 9 Feb 2026',
        unread: true,
    },
    {
        id: 'debate-training',
        title: 'Debate training room update',
        preview: 'Session now runs in the media center seminar room.',
        body: 'This week’s debate training has moved to the media center seminar room. Bring your prepared arguments and research notes.',
        meta: 'Inbox · 8 Feb 2026',
        unread: false,
    },
    {
        id: 'canteen-menu',
        title: 'Canteen menu refresh',
        preview: 'New weekly specials are now listed in the app.',
        body: 'The canteen has introduced a new weekly specials menu. Open the food tab in student services to review options and dietary notes.',
        meta: 'Events · 8 Feb 2026',
        unread: false,
    },
    {
        id: 'uniform-check',
        title: 'Uniform policy reminder',
        preview: 'Please review updated guidelines before Monday.',
        body: 'A quick reminder that updated uniform guidelines take effect on Monday. Refer to the handbook summary in resources for approved items.',
        meta: 'Alerts · 7 Feb 2026',
        unread: true,
    },
    {
        id: 'music-room-booking',
        title: 'Music room booking opened',
        preview: 'Practice rooms are now available after school.',
        body: 'Practice room bookings are now open for after-school sessions. Reserve your slot in advance to avoid overlap with ensemble rehearsals.',
        meta: 'Inbox · 7 Feb 2026',
        unread: false,
    },
    {
        id: 'assessment-window',
        title: 'Assessment submission window',
        preview: 'Portal uploads close at 11:59 PM Friday.',
        body: 'Assessment uploads remain open until 11:59 PM Friday. Verify your file format and confirmation receipt after submitting.',
        meta: 'Alerts · 6 Feb 2026',
        unread: true,
    },
    {
        id: 'wellbeing-workshop',
        title: 'Wellbeing workshop seats added',
        preview: 'Extra seats available for Wednesday lunchtime.',
        body: 'More seats have been added for the wellbeing workshop this Wednesday at lunch. Sign up early if you would like a guaranteed place.',
        meta: 'Events · 6 Feb 2026',
        unread: false,
    },
    {
        id: 'parking-dropoff',
        title: 'Morning drop-off lane update',
        preview: 'Traffic flow changes begin tomorrow morning.',
        body: 'Updated traffic flow rules for drop-off lanes start tomorrow. Follow signage and staff directions to keep entry clear and safe.',
        meta: 'Inbox · 5 Feb 2026',
        unread: false,
    },
    {
        id: 'art-exhibit',
        title: 'Student art exhibit opening',
        preview: 'Gallery walk opens Friday in the main hall.',
        body: 'The student art exhibit opens this Friday in the main hall. Families and peers are welcome during the designated viewing window.',
        meta: 'Events · 5 Feb 2026',
        unread: false,
    },
    {
        id: 'helpdesk-hours',
        title: 'IT helpdesk support hours',
        preview: 'Extended support is available this week.',
        body: 'IT helpdesk support will run extended hours this week for account and device setup assistance. Bring your device and school login details.',
        meta: 'Inbox · 4 Feb 2026',
        unread: false,
    },
];

export default function Home() {
    const [selectedFeature, setSelectedFeature] = useState<FeatureCard | null>(null);
    const [animationStarted, setAnimationStarted] = useState(false);
    const [activePreviewTab, setActivePreviewTab] = useState<'home' | 'notifications' | 'account' | 'calendar' | 'classes' | 'timetable' | 'reports' | 'attendance'>('home');
    const [activeLandingNotificationId, setActiveLandingNotificationId] = useState(notificationPreviewItems[0].id);
    const [landingNotificationSearch, setLandingNotificationSearch] = useState('');
    const [activeThemeAccentId, setActiveThemeAccentId] = useState(themeAccentOptions[0].id);
    const [activeThemePresetId, setActiveThemePresetId] = useState(themePresetOptions[0].id);

    useEffect(() => {
        const timer = setTimeout(() => setAnimationStarted(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const heroTitle = "The new era of educative tools";
    const heroWords = heroTitle.split(' ');
    const previewTitleMap: Record<typeof activePreviewTab, string> = {
        home: 'Home',
        notifications: 'Notifications',
        account: 'Account',
        calendar: 'Calendar',
        classes: 'Classes',
        timetable: 'Timetable',
        reports: 'Reports',
        attendance: 'Attendance',
    };

    const handleExpandClick = (feature: FeatureCard) => {
        setSelectedFeature(feature);
    };
    const filteredNotificationPreviewItems = notificationPreviewItems.filter((item) => {
        const query = landingNotificationSearch.trim().toLowerCase();
        if (!query) return true;
        return `${item.title} ${item.preview} ${item.body} ${item.meta}`.toLowerCase().includes(query);
    });
    const activeLandingNotification = filteredNotificationPreviewItems.find((item) => item.id === activeLandingNotificationId) ?? filteredNotificationPreviewItems[0] ?? null;
    const activeThemeAccent = themeAccentOptions.find((option) => option.id === activeThemeAccentId) ?? themeAccentOptions[0];
    const activeThemePreset = themePresetOptions.find((option) => option.id === activeThemePresetId) ?? themePresetOptions[0];

    useEffect(() => {
        if (filteredNotificationPreviewItems.length === 0) return;
        const hasActiveSelection = filteredNotificationPreviewItems.some((item) => item.id === activeLandingNotificationId);
        if (!hasActiveSelection) {
            setActiveLandingNotificationId(filteredNotificationPreviewItems[0].id);
        }
    }, [filteredNotificationPreviewItems, activeLandingNotificationId]);

    return (
        <>
            <Head>
                <title>Millennium Portal - Modern Student Portal</title>
                <meta name="description" content="A beautifully redesigned student portal experience. Access your timetable, notifications, reports, and more." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.png" />
            </Head>

            <div className={styles.page}>
                {/* Header */}
                <header className={styles.header}>
                    <div className={styles.headerContent}>
                        <Link href="/" className={styles.headerLogo}>
                            <img src="/Assets/Millennium Logo 2.png" alt="Millennium" className={styles.logoImage} />
                        </Link>
                        <Link href="/login">
                            <Button className={styles.loginBtn}>
                                Log in
                            </Button>
                        </Link>
                    </div>
                </header>

                <main className={styles.main}>
                    {/* Hero Section */}
                    <section className={styles.hero}>
                        <div className={styles.heroGradientBand} />
                        <div className={styles.heroContent}>
                            <h1 className={styles.heroTitle}>
                                {heroWords.map((word, index) => (
                                    <span
                                        key={index}
                                        className={`${styles.heroWord} ${animationStarted ? styles.heroWordVisible : ''}`}
                                        style={{ animationDelay: `${index * 0.07}s` }}
                                    >
                                        {word}
                                    </span>
                                ))}
                            </h1>
                            <p className={`${styles.heroSubtitle} ${animationStarted ? styles.blockVisible : ''}`}>
                                What was once a burden, reimagined as a hub for all work.
                            </p>
                            <div className={`${styles.heroPreviewWrap} ${animationStarted ? styles.blockVisible : ''}`}>
                                <div className={styles.heroPreview}>
                                    <div className={styles.previewSidebar}>
                                        <div className={styles.previewProfile}>
                                            <div className={styles.previewAvatar} />
                                            <div>
                                                <p className={styles.previewProfileName}>Your Name</p>
                                                <p className={styles.previewProfileMeta}>Example High School</p>
                                            </div>
                                        </div>
                                        <div className={styles.previewNavGroup}>
                                            <p className={styles.previewNavHeading}>Essentials</p>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'home' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('home')}><IconHome size={14} />Home</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'notifications' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('notifications')}><IconBell size={14} />Notifications</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'account' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('account')}><IconUser size={14} />Account</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'calendar' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('calendar')}><IconCalendar size={14} />Calendar</button>
                                        </div>
                                        <div className={styles.previewNavGroup}>
                                            <p className={styles.previewNavHeading}>Register</p>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'classes' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('classes')}><IconBook size={14} />Classes</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'timetable' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('timetable')}><IconClock size={14} />Timetable</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'reports' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('reports')}><IconActivity size={14} />Reports</button>
                                            <button className={`${styles.previewNavItem} ${activePreviewTab === 'attendance' ? styles.previewNavItemActive : ''}`} onClick={() => setActivePreviewTab('attendance')}><IconClipboardCheck size={14} />Attendance</button>
                                        </div>
                                    </div>

                                    <div className={styles.heroPreviewBody}>
                                        <div className={styles.previewTopbar}>
                                            <div className={styles.previewTopbarNav}>
                                                <button><IconChevronLeft size={14} /></button>
                                                <button><IconChevronRight size={14} /></button>
                                                <button><IconRefresh size={14} /></button>
                                            </div>
                                            <p className={styles.previewTopbarTitle}>{previewTitleMap[activePreviewTab]}</p>
                                            <div className={styles.previewTopbarActions}>
                                                <button className={styles.previewTopbarIcon}><IconSearch size={14} /></button>
                                                <button className={styles.previewTopbarIcon}><IconSettings size={14} /></button>
                                            </div>
                                        </div>

                                        {activePreviewTab === 'home' && (
                                            <div className={styles.previewDashboardGrid}>
                                                <div className={styles.previewCol}>
                                                    <div className={styles.previewCard}>
                                                        <div className={styles.previewCardHeader}>
                                                            <p className={styles.previewCardTitle}>Note</p>
                                                            <span className={styles.previewPill}>Edit</span>
                                                        </div>
                                                        <p className={styles.previewCardMuted}>You can edit this note!</p>
                                                    </div>
                                                    <div className={styles.previewCard}>
                                                        <p className={styles.previewCardTitle}>Today&apos;s Classes</p>
                                                        <p className={styles.previewCardMuted}>Monday</p>
                                                        <div className={styles.previewCardBar}>8:45 AM Advanced English</div>
                                                        <div className={styles.previewCardBar}>10:30 AM Design Technology</div>
                                                    </div>
                                                    <div className={styles.previewCard}>
                                                        <p className={styles.previewCardTitle}>Attendance</p>
                                                        <p className={styles.previewCardMuted}>Current year snapshot</p>
                                                        <div className={styles.previewCardBar}>Overall attendance <strong>92.4%</strong></div>
                                                    </div>
                                                </div>

                                                <div className={styles.previewCol}>
                                                    <div className={styles.previewQuickGrid}>
                                                        <div className={styles.previewQuickCard}><p>Calendar</p><span>Open calendar</span></div>
                                                        <div className={styles.previewQuickCard}><p>New Event</p><span>Create calendar event</span></div>
                                                        <div className={styles.previewQuickCard}><p>Account</p><span>Open profile</span></div>
                                                        <div className={styles.previewQuickCard}><p>Notifications</p><span>Open notifications</span></div>
                                                    </div>
                                                    <div className={styles.previewCard}>
                                                        <p className={styles.previewCardTitle}>Calendar</p>
                                                        <p className={styles.previewCardMuted}>Running now and coming up today</p>
                                                        <div className={styles.previewCardBar}>11:15 AM Product Design Studio</div>
                                                    </div>
                                                    <div className={styles.previewCard}>
                                                        <p className={styles.previewCardTitle}>Notifications</p>
                                                        <p className={styles.previewCardMuted}>Latest: Sat, 14 Feb</p>
                                                        <div className={styles.previewCardBar}>Library timetable update published</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'notifications' && (
                                            <div className={styles.previewNotificationsLayout}>
                                                <div className={styles.previewNotificationsRail}>
                                                    <button className={`${styles.previewRailItem} ${styles.previewRailItemActive}`}><IconInbox size={13} /></button>
                                                    <button className={styles.previewRailItem}><IconPin size={13} /></button>
                                                    <button className={styles.previewRailItem}><IconAlertCircle size={13} /></button>
                                                    <button className={styles.previewRailItem}><IconCalendar size={13} /></button>
                                                    <button className={styles.previewRailItem}><IconArchive size={13} /></button>
                                                </div>
                                                <div className={styles.previewNotificationsList}>
                                                    <div className={styles.previewNotificationsHeader}>
                                                        <div className={styles.previewSearchField}>Search notifications...</div>
                                                        <button className={styles.previewMiniBtn}><IconMailOpened size={12} /></button>
                                                    </div>
                                                    <div className={`${styles.previewNoticeItem} ${styles.previewNoticeItemActive}`}><p>Library timetable update</p><span>Open hours and room availability changed.</span></div>
                                                    <div className={styles.previewNoticeItem}><p>Parent forum RSVP</p><span>Reply before Monday 4:00 PM.</span></div>
                                                    <div className={styles.previewNoticeItem}><p>Design showcase info</p><span>Submission rubric now available.</span></div>
                                                    <div className={styles.previewNoticeItem}><p>Music rehearsal slot</p><span>New rehearsal session added Friday.</span></div>
                                                </div>
                                                <div className={styles.previewNotificationsDetail}>
                                                    <h4>Library timetable update</h4>
                                                    <p>Category: Inbox</p>
                                                    <p>The library now closes at 4:30 PM on Wednesdays. Quiet study booths are bookable in 30-minute blocks through the portal.</p>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'account' && (
                                            <div className={styles.previewStack}>
                                                <div className={styles.previewCard}>
                                                    <div className={styles.previewAccountHeader}>
                                                        <div className={styles.previewAvatarLarge} />
                                                        <div>
                                                            <p className={styles.previewCardTitle}>Your Name</p>
                                                            <p className={styles.previewCardMuted}>Example High School</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={styles.previewCard}>
                                                    <p className={styles.previewCardTitle}>Account Information</p>
                                                    <div className={styles.previewInfoRow}><span>Username</span><strong>your.username</strong></div>
                                                    <div className={styles.previewInfoRow}><span>Last Login</span><strong>14 Feb 2026, 3:12 PM</strong></div>
                                                    <div className={styles.previewInfoRow}><span>Last Synced</span><strong>14 Feb 2026, 3:08 PM</strong></div>
                                                </div>
                                                <div className={styles.previewCard}>
                                                    <p className={styles.previewCardTitle}>Actions</p>
                                                    <div className={styles.previewActionRow}><button>Sync Portal Data</button><button>Log out</button></div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'calendar' && (
                                            <div className={styles.previewCalendarLayout}>
                                                <div className={styles.previewCalendarSidebar}>
                                                    <div className={styles.previewCalendarMonthRow}>
                                                        <span>February 2026</span>
                                                        <div className={styles.previewCalendarMonthArrows}>
                                                            <button><IconChevronLeft size={12} /></button>
                                                            <button><IconChevronRight size={12} /></button>
                                                        </div>
                                                    </div>
                                                    <div className={styles.previewMiniCalendar}>
                                                        <div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div><div>Su</div>
                                                        <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
                                                        <span>9</span><span>10</span><span>11</span><span>12</span><span>13</span><span className={styles.previewMiniCalendarActive}>14</span><span>15</span>
                                                        <span>16</span><span>17</span><span>18</span><span>19</span><span>20</span><span>21</span><span>22</span>
                                                    </div>
                                                    <div className={styles.previewCalendarSideBlock}>
                                                        <p>Today&apos;s Notices</p>
                                                        <span>Library timetable update</span>
                                                        <span>Workshop venue confirmed</span>
                                                    </div>
                                                    <div className={styles.previewCalendarSideBlock}>
                                                        <p>Upcoming Today</p>
                                                        <span>Design Studio - 11:15 AM</span>
                                                        <span>English Seminar - 2:00 PM</span>
                                                    </div>
                                                    <div className={styles.previewCalendarSideBlock}>
                                                        <p>Calendars</p>
                                                        <span>My Events</span>
                                                        <span>Classes</span>
                                                        <span>Example School Calendar</span>
                                                    </div>
                                                </div>
                                                <div className={styles.previewCalendarMain}>
                                                    <div className={styles.previewCalendarToolbar}>
                                                        <div className={styles.previewCalendarToolbarMonth}>February 2026</div>
                                                        <div className={styles.previewCalendarToolbarActions}>
                                                            <button>Today</button>
                                                            <button>Day</button>
                                                            <button className={styles.previewCalendarToolbarActive}>Week</button>
                                                            <button>Month</button>
                                                            <button className={styles.previewCalendarToolbarPrimary}>+ Add Event</button>
                                                        </div>
                                                    </div>
                                                    <div className={styles.previewCalendarSchedule}>
                                                        <div className={styles.previewCalendarTimes}>
                                                            <span>9AM</span>
                                                            <span>10AM</span>
                                                            <span>11AM</span>
                                                            <span>12PM</span>
                                                            <span>1PM</span>
                                                            <span>2PM</span>
                                                            <span>3PM</span>
                                                        </div>
                                                        <div className={styles.previewCalendarGrid}>
                                                            <div className={styles.previewCalendarDays}><span>MON 9</span><span>TUE 10</span><span>WED 11</span><span>THU 12</span><span>FRI 13</span></div>
                                                            <div className={styles.previewCalendarCanvas}>
                                                                <div className={styles.previewCalendarEvent} style={{ left: '1%', top: '8%', width: '18%', height: '24%' }}>
                                                                    <p>8:45 AM</p><span>Physics Fundamentals</span><small>Lab 1</small>
                                                                </div>
                                                                <div className={`${styles.previewCalendarEvent} ${styles.pink}`} style={{ left: '21%', top: '8%', width: '18%', height: '24%' }}>
                                                                    <p>8:45 AM</p><span>Chemistry Concepts</span><small>Room 8</small>
                                                                </div>
                                                                <div className={`${styles.previewCalendarEvent} ${styles.blue}`} style={{ left: '41%', top: '32%', width: '18%', height: '28%' }}>
                                                                    <p>10:30 AM</p><span>Math Extension</span><small>Room 12</small>
                                                                </div>
                                                                <div className={styles.previewCalendarEvent} style={{ left: '61%', top: '56%', width: '18%', height: '26%' }}>
                                                                    <p>1:00 PM</p><span>Design Studio</span><small>Studio B</small>
                                                                </div>
                                                                <div className={styles.previewCalendarEvent} style={{ left: '81%', top: '56%', width: '18%', height: '26%' }}>
                                                                    <p>1:00 PM</p><span>English Seminar</span><small>Room 3</small>
                                                                </div>
                                                                <div className={styles.previewCalendarNowLine}><span>1:47 PM</span></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'classes' && (
                                            <div className={styles.previewStack}>
                                                <div className={styles.previewCard}>
                                                    <p className={styles.previewCardTitle}>Classes</p>
                                                    <p className={styles.previewCardMuted}>5 classes enrolled</p>
                                                    <div className={styles.previewClassesTable}>
                                                        <div className={styles.previewTableHead}>
                                                            <span>Course</span><span>Class</span><span>Teacher</span><span>Rolls</span>
                                                        </div>
                                                        <div className={styles.previewTableRow}><span>Design Technology</span><span>DTECH.2</span><span>Ms Rivera</span><strong>14</strong></div>
                                                        <div className={styles.previewTableRow}><span>Advanced English</span><span>AENG.1</span><span>Mr Patel</span><strong>12</strong></div>
                                                        <div className={styles.previewTableRow}><span>Math Extension</span><span>MEX.3</span><span>Dr Chen</span><strong>15</strong></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'timetable' && (
                                            <div className={styles.previewStack}>
                                                <div className={styles.previewCard}>
                                                    <div className={styles.previewWeekToggle}>
                                                        <button className={styles.previewWeekBtnActive}>Week A</button>
                                                        <button className={styles.previewWeekBtn}>Week B</button>
                                                    </div>
                                                </div>
                                                <div className={styles.previewCard}>
                                                    <p className={styles.previewCardTitle}>Monday</p>
                                                    <div className={styles.previewSimpleRow}><span>P1-P2 Advanced English</span><strong>E2</strong></div>
                                                    <div className={styles.previewSimpleRow}><span>P3-P4 Design Technology</span><strong>DT1</strong></div>
                                                    <div className={styles.previewSimpleRow}><span>P5-P6 Math Extension</span><strong>M3</strong></div>
                                                    <div className={styles.previewSimpleRow}><span>P7 Media Studies</span><strong>MS2</strong></div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'reports' && (
                                            <div className={styles.previewStack}>
                                                <div className={styles.previewReportsGrid}>
                                                    <div className={styles.previewReportCard}>
                                                        <div className={styles.previewReportIcon}><IconFileText size={15} /></div>
                                                        <p>Year 10</p>
                                                        <span>Semester 2 Report</span>
                                                    </div>
                                                    <div className={styles.previewReportCard}>
                                                        <div className={styles.previewReportIcon}><IconFileText size={15} /></div>
                                                        <p>Year 10</p>
                                                        <span>Semester 1 Report</span>
                                                    </div>
                                                    <div className={styles.previewReportCard}>
                                                        <div className={styles.previewReportIcon}><IconFileText size={15} /></div>
                                                        <p>Year 9</p>
                                                        <span>Semester 2 Report</span>
                                                    </div>
                                                    <div className={styles.previewReportCard}>
                                                        <div className={styles.previewReportIcon}><IconFileText size={15} /></div>
                                                        <p>Year 9</p>
                                                        <span>Semester 1 Report</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activePreviewTab === 'attendance' && (
                                            <div className={styles.previewStack}>
                                                <div className={styles.previewCard}>
                                                    <div className={styles.previewSummaryGrid}>
                                                        <div><p>89.8%</p><span>Overall Average</span></div>
                                                        <div><p>822</p><span>Total School Days</span></div>
                                                        <div><p>64</p><span>Total Absences</span></div>
                                                        <div><p>5</p><span>Years Tracked</span></div>
                                                    </div>
                                                </div>
                                                <div className={styles.previewAttendanceGrid}>
                                                    <div className={styles.previewAttendanceCard}><p>2026</p><strong>93.1%</strong></div>
                                                    <div className={styles.previewAttendanceCard}><p>2025</p><strong>90.8%</strong></div>
                                                    <div className={styles.previewAttendanceCard}><p>2024</p><strong>88.9%</strong></div>
                                                    <div className={styles.previewAttendanceCard}><p>2023</p><strong>86.4%</strong></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Features Section */}
                    <section className={styles.features} id="features">
                        <div className={styles.container}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.pillarsTitle}>The pillars upholding Millennium</h2>
                                <p className={styles.pillarsSubtitle}>Three foundations behind control, speed, and connected work.</p>
                            </div>
                            <div className={styles.pillarsGrid}>
                                {pillars.map((pillar) => (
                                    <article key={pillar.id} className={styles.pillarCard}>
                                        <div className={`${styles.pillarVisual} ${styles[pillar.visualClass as keyof typeof styles]}`}>
                                            {pillar.id === 'custom' && (
                                                <div className={styles.pillarUiScene}>
                                                    <div className={styles.pillarWindowChrome}>
                                                        <span />
                                                        <span />
                                                        <span />
                                                    </div>
                                                    <div className={styles.pillarSceneLabel}>Theme preset</div>
                                                    <div className={styles.pillarComboShell}>
                                                        <div className={styles.pillarComboTrigger}>
                                                            <span className={styles.pillarComboValueA}>Slate Midnight</span>
                                                            <span className={styles.pillarComboValueB}>Paper Light</span>
                                                            <i />
                                                        </div>
                                                        <div className={styles.pillarComboMenu}>
                                                            <button className={styles.pillarComboItemActive}>Slate Midnight</button>
                                                            <button className={styles.pillarComboItem}>Paper Light</button>
                                                            <button className={styles.pillarComboItem}>System Match</button>
                                                        </div>
                                                    </div>
                                                    <div className={styles.pillarThemePreviewRow}>
                                                        <div className={styles.pillarThemeChip} />
                                                        <div className={`${styles.pillarThemeChip} ${styles.pillarThemeChipAlt}`} />
                                                    </div>
                                                </div>
                                            )}

                                            {pillar.id === 'streamlined' && (
                                                <div className={styles.pillarUiScene}>
                                                    <div className={styles.pillarWindowChrome}>
                                                        <span />
                                                        <span />
                                                        <span />
                                                    </div>
                                                    <div className={styles.pillarSearchShell}>
                                                        <div className={styles.pillarSearchIconDot} />
                                                        <span className={styles.pillarSearchText}>Search classes, files, notices</span>
                                                        <kbd className={styles.pillarSearchShortcut}>/</kbd>
                                                    </div>
                                                    <div className={styles.pillarSearchResults}>
                                                        <div className={styles.pillarSearchResult} />
                                                        <div className={styles.pillarSearchResult} />
                                                        <div className={`${styles.pillarSearchResult} ${styles.pillarSearchResultShort}`} />
                                                    </div>
                                                </div>
                                            )}

                                            {pillar.id === 'workflows' && (
                                                <div className={styles.pillarUiScene}>
                                                    <div className={styles.pillarWindowChrome}>
                                                        <span />
                                                        <span />
                                                        <span />
                                                    </div>
                                                    <div className={styles.pillarCalendarHeader}>
                                                        <span>Friday 14</span>
                                                    </div>
                                                    <div className={styles.pillarCalendarGrid}>
                                                        {Array.from({ length: 14 }).map((_, idx) => (
                                                            <span
                                                                key={idx}
                                                                className={`${styles.pillarCalendarCell} ${idx === 9 ? styles.pillarCalendarCellActive : ''}`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <div className={styles.pillarContextMenu}>
                                                        <button className={styles.pillarContextActionActive}>+ New event</button>
                                                        <button className={styles.pillarContextAction}>Duplicate day</button>
                                                        <button className={styles.pillarContextAction}>Clear reminders</button>
                                                    </div>
                                                    <div className={styles.pillarEventDraft}>
                                                        <p>New event</p>
                                                        <span>Design review • 2:15 PM</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className={styles.pillarTextIn}>
                                                <h3 className={styles.pillarTitle}>{pillar.title}</h3>
                                                <p className={styles.pillarDescription}>{pillar.description}</p>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Notifications Showcase */}
                    <section className={styles.notificationsShowcase}>
                        <div className={styles.container}>
                            <div className={styles.notificationsShowcaseShell}>
                                <div className={styles.notificationsShowcaseCopy}>
                                    <h2 className={styles.notificationsShowcaseTitle}>Notifications, Refined</h2>
                                    <p className={styles.sectionSubtitle}>
                                        A focused inbox view that keeps the list and message detail in one glance, so students can process updates quickly without context switching.
                                    </p>
                                    <div className={styles.notificationsShowcaseMeta}>
                                        <span>Inbox first</span>
                                        <span>Fast triage</span>
                                        <span>Built for daily school flow</span>
                                    </div>
                                </div>

                                <div className={styles.notificationsShowcasePreviewWrap}>
                                    <div className={styles.notificationsShowcasePreview}>
                                        <div className={styles.notificationsPreviewTopbar}>
                                            <div className={styles.notificationsPreviewTopbarNav}>
                                                <button><IconChevronLeft size={13} /></button>
                                                <button><IconChevronRight size={13} /></button>
                                                <button><IconRefresh size={13} /></button>
                                            </div>
                                            <p>Notifications</p>
                                            <div className={styles.notificationsPreviewTopbarActions}>
                                                <button><IconSearch size={13} /></button>
                                                <button><IconSettings size={13} /></button>
                                            </div>
                                        </div>

                                        <div className={styles.notificationsPreviewBody}>
                                            <div className={styles.notificationsPreviewListPane}>
                                                <div className={styles.notificationsPreviewListHeader}>
                                                    <input
                                                        className={styles.notificationsPreviewSearch}
                                                        placeholder="Search notification..."
                                                        value={landingNotificationSearch}
                                                        onChange={(event) => setLandingNotificationSearch(event.target.value)}
                                                    />
                                                    <button className={styles.notificationsPreviewAction}><IconMailOpened size={12} /></button>
                                                </div>

                                                <div className={styles.notificationsPreviewListContent}>
                                                    {filteredNotificationPreviewItems.length === 0 ? (
                                                        <div className={styles.notificationsPreviewEmpty}>
                                                            No fake notifications match that search.
                                                        </div>
                                                    ) : (
                                                        filteredNotificationPreviewItems.map((item) => (
                                                            <button
                                                                key={item.id}
                                                                className={`${styles.notificationsPreviewItem} ${item.id === activeLandingNotification?.id ? styles.notificationsPreviewItemActive : ''}`}
                                                                onClick={() => setActiveLandingNotificationId(item.id)}
                                                            >
                                                                <div className={styles.notificationsPreviewItemDot}>
                                                                    {item.unread ? <span /> : null}
                                                                </div>
                                                                <div className={styles.notificationsPreviewItemText}>
                                                                    <p>{item.title}</p>
                                                                    <span>{item.preview}</span>
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            <div className={styles.notificationsPreviewDetailPane}>
                                                {activeLandingNotification ? (
                                                    <>
                                                        <h4>{activeLandingNotification.title}</h4>
                                                        <p className={styles.notificationsPreviewMeta}>{activeLandingNotification.meta}</p>
                                                        <p>{activeLandingNotification.body}</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <h4>No results</h4>
                                                        <p>Try a different search term to view fake notification details.</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Theme Builder Showcase */}
                    <section className={styles.themeBuilderShowcase}>
                        <div className={styles.container}>
                            <div className={styles.themeBuilderShowcaseShell}>
                                <div
                                    className={styles.themeBuilderShowcasePreviewWrap}
                                    style={{
                                        ['--tb-accent' as string]: activeThemeAccent.hex,
                                        ['--tb-accent-rgb' as string]: activeThemeAccent.rgb,
                                        ['--tb-hue' as string]: `${activeThemeAccent.hue}%`,
                                        ['--tb-surface' as string]: activeThemePreset.surface,
                                        ['--tb-panel' as string]: activeThemePreset.panel,
                                    } as React.CSSProperties}
                                >
                                    <div className={styles.themeBuilderShowcasePreview}>
                                        <div className={styles.themeBuilderPreviewTopbar}>
                                            <div className={styles.themeBuilderPreviewTopbarNav}>
                                                <button><IconChevronLeft size={13} /></button>
                                                <button><IconChevronRight size={13} /></button>
                                                <button><IconRefresh size={13} /></button>
                                            </div>
                                            <p>Theme Builder</p>
                                            <div className={styles.themeBuilderPreviewTopbarActions}>
                                                <button><IconSettings size={13} /></button>
                                            </div>
                                        </div>

                                        <div className={styles.themeBuilderPreviewBody}>
                                            <div className={styles.themeBuilderPreviewMain}>
                                                <div className={styles.themeBuilderThemeRow}>
                                                    {themePresetOptions.map((preset) => (
                                                        <button
                                                            key={preset.id}
                                                            className={`${styles.themeBuilderThemeCardButton} ${preset.id === activeThemePreset.id ? styles.themeBuilderThemeCardActive : styles.themeBuilderThemeCard}`}
                                                            onClick={() => setActiveThemePresetId(preset.id)}
                                                        >
                                                            <span />
                                                            <p>{preset.name}</p>
                                                            <small>{preset.subtitle}</small>
                                                        </button>
                                                    ))}
                                                    <div className={styles.themeBuilderThemeCardCreate}>+ Create New</div>
                                                </div>

                                                <div className={styles.themeBuilderPanel}>
                                                    <div className={styles.themeBuilderToggleRow}>
                                                        <h4>Toggle Controls</h4>
                                                        <button className={styles.themeBuilderToggleTrack}>
                                                            <span />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className={styles.themeBuilderPanel}>
                                                    <h4>Buttons</h4>
                                                    <div className={styles.themeBuilderButtonRow}>
                                                        <button className={styles.themeBuilderPrimary}>Primary</button>
                                                        <button className={styles.themeBuilderSecondary}>Secondary</button>
                                                        <button className={styles.themeBuilderGhost}>Ghost</button>
                                                    </div>
                                                </div>

                                                <div className={styles.themeBuilderPanel}>
                                                    <h4>Form Inputs</h4>
                                                    <div className={styles.themeBuilderInputRow}>
                                                        <input readOnly value="Text input..." />
                                                        <button>Option 1</button>
                                                    </div>
                                                </div>

                                                <div className={styles.themeBuilderPanel}>
                                                    <h4>Badges & Status</h4>
                                                    <div className={styles.themeBuilderBadgeRow}>
                                                        <span className={styles.themeBuilderBadgePrimary}>Primary</span>
                                                        <span className={styles.themeBuilderBadgeMuted}>Secondary</span>
                                                        <span className={styles.themeBuilderBadgeMuted}>Success</span>
                                                    </div>
                                                </div>

                                                <div className={styles.themeBuilderPanel}>
                                                    <h4>Progress</h4>
                                                    <div className={styles.themeBuilderProgressTrack}>
                                                        <span />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.themeBuilderPreviewPicker}>
                                                <h4>Accent Color</h4>
                                                <div className={styles.themeBuilderColorCanvas}>
                                                    <span />
                                                </div>
                                                <div className={styles.themeBuilderHueSlider}>
                                                    <span />
                                                </div>
                                                <div className={styles.themeBuilderOpacitySlider}>
                                                    <span />
                                                </div>
                                                <div className={styles.themeBuilderPickerValue}>
                                                    <span style={{ backgroundColor: activeThemeAccent.hex }} />
                                                    <p>{activeThemeAccent.hex}</p>
                                                </div>
                                                <div className={styles.themeBuilderSwatchGrid}>
                                                    {themeAccentOptions.map((option) => (
                                                        <button
                                                            key={option.id}
                                                            className={`${styles.themeBuilderSwatch} ${option.id === activeThemeAccent.id ? styles.themeBuilderSwatchActive : ''}`}
                                                            style={{ backgroundColor: option.hex }}
                                                            onClick={() => setActiveThemeAccentId(option.id)}
                                                            aria-label={`Set accent to ${option.name}`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.themeBuilderShowcaseCopy}>
                                    <h2 className={styles.notificationsShowcaseTitle}>Theme Builder, Live</h2>
                                    <p className={styles.sectionSubtitle}>
                                        Dial in accent color and instantly preview how buttons, badges, and progress states adapt across the interface.
                                    </p>
                                    <div className={styles.notificationsShowcaseMeta}>
                                        <span>Interactive accent color</span>
                                        <span>Real-time component preview</span>
                                        <span>Consistent UI states</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Roadmap Section */}
                    <section className={styles.roadmap} id="roadmap">
                        <div className={styles.container}>
                            <div className={styles.sectionHeader}>
                                <h2 className={styles.roadmapTitle}>Roadmap</h2>
                                <p className={styles.sectionSubtitle}>
                                    A transparent timeline for what is shipping now and what is coming next.
                                </p>
                            </div>

                            <div className={styles.roadmapViewport}>
                                <div className={styles.roadmapTrack}>
                                    <div className={styles.roadmapItems}>
                                        {roadmapItems.map((item, index) => (
                                            <article
                                                key={item.id}
                                                className={`${styles.roadmapItem} ${index === 0 ? styles.roadmapItemFirst : ''}`}
                                            >
                                                <div className={styles.roadmapRail}>
                                                    <span className={styles.roadmapRailBefore} />
                                                    <div className={`${styles.roadmapNode} ${item.released ? styles.roadmapNodeReleased : ''}`}>
                                                        <span />
                                                    </div>
                                                    <span className={styles.roadmapRailAfter} />
                                                </div>
                                                <div className={styles.roadmapCard}>
                                                    <h3>{item.title}</h3>
                                                    <p>{item.description}</p>
                                                    <time>{item.date}</time>
                                                </div>
                                            </article>
                                        ))}
                                    </div>

                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Developer Section */}
                    <section className={styles.developer}>
                        <div className={styles.container}>
                            <div className={styles.developerShell}>
                                <div className={styles.developerLead}>
                                    <div className={styles.developerIcon}>
                                        <IconUser size={26} />
                                    </div>
                                    <h2 className={styles.developerTitle}>Built by a Student, for Students</h2>
                                    <p className={styles.developerLeadText}>
                                        Millennium started as a personal fix for a slow, fragmented school portal. It grew into a full redesign focused on clarity, speed, and daily student workflow quality.
                                    </p>
                                    <div className={styles.developerStatRow}>
                                        <div className={styles.developerStat}>
                                            <span>Vision</span>
                                            <strong>Student-first UX</strong>
                                        </div>
                                        <div className={styles.developerStat}>
                                            <span>Build style</span>
                                            <strong>Fast iterations</strong>
                                        </div>
                                        <div className={styles.developerStat}>
                                            <span>Core goal</span>
                                            <strong>Less friction, more focus</strong>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.developerPrinciples}>
                                    <h3>Build Principles</h3>
                                    <div className={styles.developerPrinciplesList}>
                                        <div className={styles.developerPrinciple}>
                                            <IconRocket size={17} />
                                            <div>
                                                <p>Ship useful improvements quickly</p>
                                                <span>Release practical features that improve day-to-day school flow first.</span>
                                            </div>
                                        </div>
                                        <div className={styles.developerPrinciple}>
                                            <IconHeart size={17} />
                                            <div>
                                                <p>Design with actual student context</p>
                                                <span>Prioritize readability, fewer clicks, and predictable navigation patterns.</span>
                                            </div>
                                        </div>
                                        <div className={styles.developerPrinciple}>
                                            <IconBell size={17} />
                                            <div>
                                                <p>Keep everything connected</p>
                                                <span>Notifications, calendar, classes, and preferences should work as one system.</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className={styles.cta}>
                        <div className={styles.container}>
                            <div className={styles.ctaPanel}>
                                <div className={styles.ctaCopy}>
                                    <h2 className={styles.ctaTitle}>Ready to step into Millennium?</h2>
                                    <p className={styles.ctaSubtitle}>
                                        Launch your account, bring your portal data in, and start using a workflow that feels fast, clear, and genuinely modern.
                                    </p>
                                    <div className={styles.ctaSignals}>
                                        <span>Fast setup</span>
                                        <span>Theme control</span>
                                        <span>One unified workspace</span>
                                    </div>
                                </div>
                                <div className={styles.ctaActions}>
                                    <Link href="/login">
                                        <Button className={styles.ctaBtn}>
                                            Launch Millennium
                                            <IconArrowRight size={16} />
                                        </Button>
                                    </Link>
                                    <a href="#features" className={styles.ctaGhostLink}>Explore Features</a>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>

                {/* Footer */}
                <footer className={styles.footer}>
                    <div className={styles.footerContent}>
                        <div className={styles.footerBrand}>
                            <img
                                src="/Assets/Millennium Logo 2.png"
                                alt="Millennium"
                                className={styles.footerLogo}
                            />
                            <p className={styles.footerText}>
                                A better way to access your school portal.
                            </p>
                        </div>

                        <div className={styles.footerLinks}>
                            <a href="#features">Features</a>
                            <a href="#roadmap">Roadmap</a>
                            <Link href="/login">Log in</Link>
                        </div>

                        <p className={styles.footerCopyright}>
                            Built with care for NSW Department of Education students.
                        </p>
                    </div>
                </footer>

                {/* Feature Detail Dialog */}
                <Dialog open={!!selectedFeature} onOpenChange={(open) => !open && setSelectedFeature(null)}>
                    <DialogContent className={styles.dialogContent}>
                        <DialogHeader>
                            <div className={styles.dialogIcon}>
                                {selectedFeature && <selectedFeature.Icon size={28} />}
                            </div>
                            <DialogTitle className={styles.dialogTitle}>
                                {selectedFeature?.title}
                            </DialogTitle>
                            <DialogDescription className={styles.dialogDescription}>
                                {selectedFeature?.fullDescription}
                            </DialogDescription>
                        </DialogHeader>
                        <div className={styles.dialogFooter}>
                            <Link href="/login">
                                <Button className={styles.dialogBtn}>
                                    Get Started
                                    <IconArrowRight size={14} />
                                </Button>
                            </Link>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
