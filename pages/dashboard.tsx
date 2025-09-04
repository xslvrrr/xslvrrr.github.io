import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

interface DashboardCard {
  id: string;
  title: string;
  type: 'stats' | 'timetable' | 'notices' | 'activity' | 'status';
  gridColumn: string;
  component: React.ReactNode;
}

interface SortableCardProps {
  card: DashboardCard;
  children: React.ReactNode;
}

// Sortable Card Component
function SortableCard({ card, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${styles.dashboardCard} ${styles[card.type + 'Card']}`}
      data-card-type={card.type}
    >
      {children}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cardOrder, setCardOrder] = useState<string[]>(['stats', 'timetable', 'activity', 'notices', 'status']);
  const [portalData, setPortalData] = useState<{
    user: { name: string; school: string };
    timetable: TimetableEntry[];
    notices: Notice[];
    diary: DiaryEntry[];
    lastUpdated: string;
  } | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session?.loggedIn) {
      loadPortalData();
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over?.id as string);

        const newOrder = arrayMove(items, oldIndex, newIndex);
        // Persist to localStorage
        localStorage.setItem('dashboardCardOrder', JSON.stringify(newOrder));
        return newOrder;
      });
    }
  };

  // Load card order from localStorage on component mount
  useEffect(() => {
    const savedOrder = localStorage.getItem('dashboardCardOrder');
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        if (Array.isArray(parsedOrder)) {
          setCardOrder(parsedOrder);
        }
      } catch (error) {
        console.error('Error parsing saved card order:', error);
      }
    }
  }, []);

  // Generate dashboard cards based on order
  const generateDashboardCards = (): DashboardCard[] => {
    const cardDefinitions: Record<string, DashboardCard> = {
      stats: {
        id: 'stats',
        title: "Today's Overview",
        type: 'stats',
        gridColumn: 'span 4',
        component: (
          <>
            <h2>Today's Overview</h2>
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
          </>
        ),
      },
      timetable: {
        id: 'timetable',
        title: "Today's Timetable",
        type: 'timetable',
        gridColumn: 'span 6',
        component: (
          <>
            <h2>Today's Timetable</h2>
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
          </>
        ),
      },
      activity: {
        id: 'activity',
        title: 'Upcoming Events',
        type: 'activity',
        gridColumn: 'span 4',
        component: (
          <>
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
          </>
        ),
      },
      notices: {
        id: 'notices',
        title: 'Student Notices',
        type: 'notices',
        gridColumn: 'span 6',
        component: (
          <>
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
          </>
        ),
      },
      status: {
        id: 'status',
        title: 'System Status',
        type: 'status',
        gridColumn: 'span 8',
        component: (
          <>
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
              {session?.isDebug && (
                <div className={styles.statusItem}>
                  <div className={`${styles.statusIndicator} ${styles.statusOrange}`}></div>
                  <span>Debug Mode Enabled</span>
                </div>
              )}
            </div>
          </>
        ),
      },
    };

    return cardOrder.map(id => cardDefinitions[id]).filter(Boolean);
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
                <div className={styles.dashboardGrid}>
                  {generateDashboardCards().map((card) => (
                    <SortableCard key={card.id} card={card}>
                      {card.component}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </main>
        </div>
      </div>
    </>
  );
}
