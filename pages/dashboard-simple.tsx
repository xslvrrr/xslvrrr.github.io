import { useState, useEffect } from 'react';
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

interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  isActive?: boolean;
}

interface Notice {
  title: string;
  preview: string;
  content: string;
}

interface DiaryEntry {
  date: string;
  title: string;
  description?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portalData, setPortalData] = useState<{
    user: { name: string; school: string };
    timetable: TimetableEntry[];
    notices: Notice[];
    diary: DiaryEntry[];
    lastUpdated: string;
  } | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session?.loggedIn) {
      loadPortalData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadPortalData = async () => {
    if (dataLoading) return;
    
    setDataLoading(true);
    try {
      const response = await fetch('/api/portal/scrape');
      const data = await response.json();
      
      if (response.ok) {
        setPortalData(data);
      } else if (data.expired) {
        // Session expired, redirect to login
        router.push('/login');
      } else {
        console.error('Failed to load portal data:', data.message);
      }
    } catch (error) {
      console.error('Error loading portal data:', error);
    } finally {
      setDataLoading(false);
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
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  };

  const getCurrentTime = () => {
    return new Date().toLocaleDateString('en-AU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getActiveClassesCount = () => {
    if (!portalData?.timetable) return 0;
    return portalData.timetable.filter(item => item.isActive).length;
  };

  const getUpcomingActivities = () => {
    if (!portalData?.diary) return [];
    return portalData.diary.slice(0, 3);
  };

  const getDisplayName = () => {
    return portalData?.user.name || session?.username || 'User';
  };

  const getDisplaySchool = () => {
    return portalData?.user.school || session?.school || 'School';
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
    return null;
  }

  return (
    <>
      <Head>
        <title>Dashboard - Millennium</title>
        <link rel="icon" href="/Assets/Millennium Logo.png" type="image/png" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.dashboardBody}>
        <div className={styles.dashboardContainer}>
          {/* Left sidebar */}
          <nav className={styles.sidebar}>
            <div className={styles.sidebarTop}>
              {/* User profile */}
              <div className={styles.userProfile}>
                <div className={styles.userAvatar}>
                  <span className={styles.userInitials}>
                    {getUserInitials(session.username)}
                  </span>
                </div>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>
                    {getDisplayName()}
                    {session.isDebug && <span className={styles.debugBadge}>DEBUG</span>}
                  </div>
                  <div className={styles.userSchool}>{getDisplaySchool()}</div>
                </div>
              </div>

              {/* Navigation */}
              <div className={styles.navSection}>
                <h2 className={styles.navHeading}>Essentials</h2>
                <ul className={styles.navList}>
                  <li className={`${styles.navItem} ${styles.active}`}>
                    <a href="#home" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/home-icon.svg" alt="Home" />
                      </span>
                      <span>Home</span>
                    </a>
                  </li>
                  <li className={styles.navItem}>
                    <a href="#notices" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/notices-icon.svg" alt="Notices" />
                      </span>
                      <span>Notices</span>
                    </a>
                  </li>
                  <li className={styles.navItem}>
                    <a href="#timetable" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/timetable-icon.svg" alt="Timetable" />
                      </span>
                      <span>Timetable</span>
                    </a>
                  </li>
                </ul>
              </div>

              <div className={styles.navSection}>
                <h2 className={styles.navHeading}>Learning</h2>
                <ul className={styles.navList}>
                  <li className={styles.navItem}>
                    <a href="#classes" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/classes-icon.svg" alt="Classes" />
                      </span>
                      <span>Classes</span>
                    </a>
                  </li>
                  <li className={styles.navItem}>
                    <a href="#homework" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/homework-icon.svg" alt="Homework" />
                      </span>
                      <span>Homework</span>
                    </a>
                  </li>
                  <li className={styles.navItem}>
                    <a href="#resources" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/resources-icon.svg" alt="Resources" />
                      </span>
                      <span>Resources</span>
                    </a>
                  </li>
                </ul>
              </div>

              <div className={styles.navSection}>
                <h2 className={styles.navHeading}>Assessment</h2>
                <ul className={styles.navList}>
                  <li className={styles.navItem}>
                    <a href="#reports" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/reports-icon.svg" alt="Reports" />
                      </span>
                      <span>Reports</span>
                    </a>
                  </li>
                  <li className={styles.navItem}>
                    <a href="#attendance" className={styles.navLink}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/attendance-icon.svg" alt="Attendance" />
                      </span>
                      <span>Attendance</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.sidebarBottom}>
              <button onClick={handleLogout} className={styles.logoutBtn}>
                Logout
              </button>
            </div>
          </nav>

          {/* Main content area */}
          <main className={styles.mainContent}>
            <div className={styles.contentHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>Good morning, {getDisplayName()}!</h1>
                  <p>{getCurrentTime()}</p>
                  {dataLoading && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      Loading portal data...
                    </div>
                  )}
                  {portalData?.lastUpdated && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      Last updated: {new Date(portalData.lastUpdated).toLocaleTimeString()}
                    </div>
                  )}
                </div>
                <button 
                  onClick={loadPortalData}
                  disabled={dataLoading}
                  style={{
                    padding: '8px 12px',
                    background: dataLoading ? '#f3f4f6' : '#6366f1',
                    color: dataLoading ? '#6b7280' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: dataLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {dataLoading ? 'Refreshing...' : 'Refresh Data'}
                </button>
              </div>
            </div>

            <div className={styles.dashboardGrid}>
              {/* Stats Card */}
              <div className={`${styles.dashboardCard} ${styles.statsCard}`}>
                <h2>Today&apos;s Overview</h2>
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{portalData?.notices.length || 0}</span>
                    <span className={styles.statLabel}>New Notices</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{getActiveClassesCount()}</span>
                    <span className={styles.statLabel}>Active Classes</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{portalData?.timetable.length || 0}</span>
                    <span className={styles.statLabel}>Total Periods</span>
                  </div>
                </div>
              </div>

              {/* Timetable Card */}
              <div className={`${styles.dashboardCard} ${styles.timetableCard}`}>
                <h2>Today&apos;s Timetable</h2>
                <div className={styles.timetableList}>
                  {portalData?.timetable.length ? (
                    portalData.timetable.map((item, index) => (
                      <div key={index} className={`${styles.timetableItem} ${item.isActive ? styles.active : ''}`}>
                        <span className={styles.timetablePeriod}>{item.period}</span>
                        <span className={styles.timetableSubject}>{item.subject}</span>
                        <span className={styles.timetableTeacher}>{item.teacher}</span>
                        <span className={styles.timetableRoom}>{item.room}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                      {dataLoading ? 'Loading timetable...' : 'No timetable data available'}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity/Diary Card */}
              <div className={`${styles.dashboardCard} ${styles.activityCard}`}>
                <h2>Upcoming Events</h2>
                <div className={styles.activityList}>
                  {getUpcomingActivities().map((item, index) => (
                    <div key={index} className={styles.activityItem}>
                      <div className={styles.activityDate}>{item.date}</div>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTitle}>{item.title}</div>
                        {item.description && (
                          <div className={styles.activityDescription}>{item.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notices Card */}
              <div className={`${styles.dashboardCard} ${styles.noticesCard}`}>
                <h2>Student Notices</h2>
                <div className={styles.noticesList}>
                  {portalData?.notices.length ? (
                    portalData.notices.slice(0, 6).map((notice, index) => (
                      <div key={index} className={styles.noticeItem}>
                        <div className={styles.noticeTitle}>{notice.title}</div>
                        <div className={styles.noticePreview}>{notice.preview}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                      {dataLoading ? 'Loading notices...' : 'No notices available'}
                    </div>
                  )}
                </div>
              </div>

              {/* System Status Card */}
              <div className={`${styles.dashboardCard} ${styles.statusCard}`}>
                <h2>System Status</h2>
                <div className={styles.systemStatus}>
                  <div className={styles.statusItem}>
                    <div className={`${styles.statusIndicator} ${styles.statusGreen}`}></div>
                    <span>Millennium Services</span>
                  </div>
                  <div className={styles.statusItem}>
                    <div className={`${styles.statusIndicator} ${styles.statusGreen}`}></div>
                    <span>Redesigned Interface</span>
                  </div>
                  <div className={styles.statusItem}>
                    <div className={`${styles.statusIndicator} ${styles.statusBlue}`}></div>
                    <span>Data Synchronization</span>
                  </div>
                  {session.isDebug && (
                    <div className={styles.statusItem}>
                      <div className={`${styles.statusIndicator} ${styles.statusOrange}`}></div>
                      <span>Debug Mode Enabled</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
