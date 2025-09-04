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

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

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
                    {session.username || 'User'}
                    {session.isDebug && <span className={styles.debugBadge}>DEBUG</span>}
                  </div>
                  <div className={styles.userSchool}>{session.school || 'School'}</div>
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
              <h1>Welcome back, {session.username || 'User'}!</h1>
              <p>Here's your dashboard for today.</p>
            </div>

            <div className={styles.dashboardGrid}>
              <div className={styles.dashboardCard}>
                <h2>Quick Stats</h2>
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>3</span>
                    <span className={styles.statLabel}>New Notices</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>2</span>
                    <span className={styles.statLabel}>Upcoming Classes</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>1</span>
                    <span className={styles.statLabel}>Homework Due</span>
                  </div>
                </div>
              </div>

              <div className={styles.dashboardCard}>
                <h2>Recent Activity</h2>
                <div className={styles.activityList}>
                  <div className={styles.activityItem}>
                    <img src="/Assets/notices-icon.svg" alt="Notice" className={styles.activityIcon} />
                    <div className={styles.activityContent}>
                      <p className={styles.activityTitle}>New notice from Mathematics</p>
                      <p className={styles.activityTime}>2 hours ago</p>
                    </div>
                  </div>
                  <div className={styles.activityItem}>
                    <img src="/Assets/homework-icon.svg" alt="Homework" className={styles.activityIcon} />
                    <div className={styles.activityContent}>
                      <p className={styles.activityTitle}>English homework due tomorrow</p>
                      <p className={styles.activityTime}>5 hours ago</p>
                    </div>
                  </div>
                  <div className={styles.activityItem}>
                    <img src="/Assets/timetable-icon.svg" alt="Timetable" className={styles.activityIcon} />
                    <div className={styles.activityContent}>
                      <p className={styles.activityTitle}>Timetable updated</p>
                      <p className={styles.activityTime}>1 day ago</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.dashboardCard}>
                <h2>System Status</h2>
                <div className={styles.systemStatus}>
                  <div className={styles.statusItem}>
                    <div className={`${styles.statusIndicator} ${styles.statusGreen}`}></div>
                    <span>Millennium Services: Online</span>
                  </div>
                  <div className={styles.statusItem}>
                    <div className={`${styles.statusIndicator} ${styles.statusGreen}`}></div>
                    <span>Redesigned Interface: Active</span>
                  </div>
                  {session.isDebug && (
                    <div className={styles.statusItem}>
                      <div className={`${styles.statusIndicator} ${styles.statusBlue}`}></div>
                      <span>Debug Mode: Enabled</span>
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
