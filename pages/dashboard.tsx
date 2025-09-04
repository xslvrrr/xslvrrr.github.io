import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Dashboard.module.css';

interface UserSession {
  loggedIn: boolean;
  username?: string;
  school?: string;
  isDebug?: boolean;
  timestamp?: string;
}

interface DashboardData {
  user: {
    name: string;
    school: string;
    year: string;
    uid: string;
  };
  timetable: Array<{
    period: string;
    room: string;
    subject: string;
    teacher: string;
    current: boolean;
  }>;
  notices: Array<{
    title: string;
    content: string;
    date?: string;
  }>;
  diary: Array<{
    title: string;
    date: string;
    time: string;
  }>;
  navigation: Array<{
    section: string;
    links: Array<{
      name: string;
      url: string;
    }>;
  }>;
}

interface Widget {
  id: string;
  title: string;
  component: string;
  size: 'small' | 'medium' | 'large';
  gridArea: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [widgets, setWidgets] = useState<Widget[]>([
    { id: 'timetable', title: 'Today\'s Timetable', component: 'timetable', size: 'large', gridArea: 'timetable' },
    { id: 'notices', title: 'Recent Notices', component: 'notices', size: 'medium', gridArea: 'notices' },
    { id: 'diary', title: 'Upcoming Events', component: 'diary', size: 'medium', gridArea: 'diary' },
    { id: 'profile', title: 'Quick Stats', component: 'profile', size: 'small', gridArea: 'profile' },
    { id: 'welcome', title: 'Welcome', component: 'welcome', size: 'small', gridArea: 'welcome' },
  ]);
  const draggedWidget = useRef<Widget | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session?.loggedIn) {
      loadDashboardData();
    }
  }, [session]);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const sessionData = await response.json();
      
      if (!sessionData.loggedIn) {
        router.push('/login');
        return;
      }
      
      setSession(sessionData);
    } catch (error) {
      console.error('Session check failed:', error);
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await fetch('/api/portal/dashboard');
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getUserInitials = (username?: string) => {
    if (!username) return 'U';
    const names = username.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  };

  const handleDragStart = (widget: Widget, e: React.DragEvent) => {
    draggedWidget.current = widget;
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetWidget: Widget, e: React.DragEvent) => {
    e.preventDefault();
    
    if (!draggedWidget.current || draggedWidget.current.id === targetWidget.id) {
      return;
    }

    setWidgets(prevWidgets => {
      const newWidgets = [...prevWidgets];
      const draggedIndex = newWidgets.findIndex(w => w.id === draggedWidget.current!.id);
      const targetIndex = newWidgets.findIndex(w => w.id === targetWidget.id);
      
      // Swap grid areas
      const draggedArea = newWidgets[draggedIndex].gridArea;
      newWidgets[draggedIndex].gridArea = newWidgets[targetIndex].gridArea;
      newWidgets[targetIndex].gridArea = draggedArea;
      
      return newWidgets;
    });
    
    draggedWidget.current = null;
  };

  const renderWidget = (widget: Widget) => {
    const baseProps = {
      key: widget.id,
      className: `${styles.widget} ${styles[widget.size]}`,
      style: { gridArea: widget.gridArea },
      draggable: true,
      onDragStart: (e: React.DragEvent) => handleDragStart(widget, e),
      onDragEnd: handleDragEnd,
      onDragOver: handleDragOver,
      onDrop: (e: React.DragEvent) => handleDrop(widget, e)
    };

    switch (widget.component) {
      case 'welcome':
        return (
          <div {...baseProps}>
            <div className={styles.widgetHeader}>
              <h3>{widget.title}</h3>
              <div className={styles.dragHandle}>⋮⋮</div>
            </div>
            <div className={styles.widgetContent}>
              <div className={styles.welcomeCard}>
                <h2>Welcome back, {dashboardData?.user?.name || session?.username || 'User'}!</h2>
                <p>Here's your dashboard for today.</p>
                <div className={styles.welcomeStats}>
                  <div className={styles.statBadge}>
                    <span className={styles.statNumber}>{dashboardData?.notices?.length || 0}</span>
                    <span className={styles.statLabel}>New Notices</span>
                  </div>
                  <div className={styles.statBadge}>
                    <span className={styles.statNumber}>{dashboardData?.diary?.length || 0}</span>
                    <span className={styles.statLabel}>Upcoming Events</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'timetable':
        return (
          <div {...baseProps}>
            <div className={styles.widgetHeader}>
              <h3>{widget.title}</h3>
              <div className={styles.dragHandle}>⋮⋮</div>
            </div>
            <div className={styles.widgetContent}>
              <div className={styles.timetableGrid}>
                {dashboardData?.timetable && dashboardData.timetable.length > 0 ? (
                  dashboardData.timetable.slice(0, 6).map((period, index) => (
                    <div 
                      key={index} 
                      className={`${styles.periodCard} ${period.current ? styles.currentPeriod : ''}`}
                    >
                      <div className={styles.periodTime}>{period.period}</div>
                      <div className={styles.periodInfo}>
                        <div className={styles.periodSubject}>{period.subject}</div>
                        <div className={styles.periodDetails}>
                          <span className={styles.periodRoom}>{period.room}</span>
                          <span className={styles.periodTeacher}>{period.teacher}</span>
                        </div>
                      </div>
                      {period.current && <div className={styles.currentIndicator}>NOW</div>}
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <img src="/Assets/timetable-icon.svg" alt="No classes" />
                    <p>No classes scheduled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'notices':
        return (
          <div {...baseProps}>
            <div className={styles.widgetHeader}>
              <h3>{widget.title}</h3>
              <div className={styles.dragHandle}>⋮⋮</div>
            </div>
            <div className={styles.widgetContent}>
              <div className={styles.noticesList}>
                {dashboardData?.notices && dashboardData.notices.length > 0 ? (
                  dashboardData.notices.slice(0, 4).map((notice, index) => (
                    <div key={index} className={styles.noticeCard}>
                      <div className={styles.noticeIcon}>📢</div>
                      <div className={styles.noticeContent}>
                        <div className={styles.noticeTitle}>{notice.title}</div>
                        <div className={styles.noticePreview}>
                          {notice.content.substring(0, 80)}...
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <img src="/Assets/notices-icon.svg" alt="No notices" />
                    <p>No recent notices</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'diary':
        return (
          <div {...baseProps}>
            <div className={styles.widgetHeader}>
              <h3>{widget.title}</h3>
              <div className={styles.dragHandle}>⋮⋮</div>
            </div>
            <div className={styles.widgetContent}>
              <div className={styles.diaryList}>
                {dashboardData?.diary && dashboardData.diary.length > 0 ? (
                  dashboardData.diary.slice(0, 5).map((event, index) => (
                    <div key={index} className={styles.diaryCard}>
                      <div className={styles.eventDate}>
                        <div className={styles.eventDay}>
                          {new Date(event.date).getDate()}
                        </div>
                        <div className={styles.eventMonth}>
                          {new Date(event.date).toLocaleDateString('en', { month: 'short' })}
                        </div>
                      </div>
                      <div className={styles.eventContent}>
                        <div className={styles.eventTitle}>{event.title}</div>
                        <div className={styles.eventTime}>{event.time}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <img src="/Assets/calendar-icon.svg" alt="No events" />
                    <p>No upcoming events</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div {...baseProps}>
            <div className={styles.widgetHeader}>
              <h3>{widget.title}</h3>
              <div className={styles.dragHandle}>⋮⋮</div>
            </div>
            <div className={styles.widgetContent}>
              <div className={styles.profileCard}>
                <div className={styles.profileAvatar}>
                  <span className={styles.profileInitials}>
                    {getUserInitials(dashboardData?.user?.name || session?.username)}
                  </span>
                </div>
                <div className={styles.profileInfo}>
                  <div className={styles.profileName}>
                    {dashboardData?.user?.name || session?.username || 'User'}
                    {session?.isDebug && <span className={styles.debugBadge}>DEBUG</span>}
                  </div>
                  <div className={styles.profileSchool}>
                    {dashboardData?.user?.school || session?.school || 'School'}
                  </div>
                  <div className={styles.profileYear}>
                    Year {dashboardData?.user?.year || new Date().getFullYear()}
                  </div>
                </div>
                <button onClick={handleLogout} className={styles.logoutBtn}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect to login
  }

  return (
    <>
      <Head>
        <title>Dashboard - Millennium</title>
        <link rel="icon" href="/Assets/Millennium Logo.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.dashboardBody}>
        <div className={styles.dashboardContainer}>
          <div className={styles.bentoGrid}>
            {widgets.map(widget => renderWidget(widget))}
          </div>
        </div>
      </div>
    </>
  );
}
