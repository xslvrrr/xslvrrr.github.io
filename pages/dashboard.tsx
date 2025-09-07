import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Dashboard.module.css';

interface UserSession {
  loggedIn: boolean;
  username?: string;
  school?: string;
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
  
  // Enhanced dashboard state
  const [currentSection, setCurrentSection] = useState('home');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

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

  const loadPortalData = async (force = false) => {
    if (dataLoading) return;
    
    // Check if we have recent data (less than 2 minutes old) and not forcing refresh
    if (!force && portalData?.lastUpdated) {
      const lastUpdate = new Date(portalData.lastUpdated);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      
      if (diffMinutes < 2) {
        console.log('Using cached portal data (less than 2 minutes old)');
        return;
      }
    }
    
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

  // Memoized calculations for better performance
  const displayName = useMemo(() => {
    return portalData?.user.name || session?.username || 'User';
  }, [portalData?.user.name, session?.username]);

  const displaySchool = useMemo(() => {
    return portalData?.user.school || session?.school || 'School';
  }, [portalData?.user.school, session?.school]);

  // Enhanced functionality methods
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  }, []);

  const handleSectionClick = useCallback((section: string) => {
    setCurrentSection(section);
    setShowUserDropdown(false);
  }, []);

  const toggleUserDropdown = useCallback(() => {
    setShowUserDropdown(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setShowSearchModal(true);
    }
    // Escape to close modals
    if (e.key === 'Escape') {
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchSuggestions([]);
      setSelectedSuggestion(-1);
    }
    if (showSearchModal && searchSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev < searchSuggestions.length - 1 ? prev + 1 : 0
        );
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev > 0 ? prev - 1 : searchSuggestions.length - 1
        );
      }
      if (e.key === 'Enter' && selectedSuggestion >= 0) {
        e.preventDefault();
        const selected = searchSuggestions[selectedSuggestion];
        handleSearchSelect(selected);
      }
      if (e.key === 'Tab' && selectedSuggestion >= 0) {
        e.preventDefault();
        const selected = searchSuggestions[selectedSuggestion];
        setSearchQuery(selected.title);
      }
    }
  }, [showSearchModal, searchSuggestions, selectedSuggestion]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      }
      if (e.key === 'Escape') {
        setShowSearchModal(false);
        setSearchQuery('');
        setSearchResults([]);
        setSearchSuggestions([]);
        setSelectedSuggestion(-1);
      }
      if (showSearchModal && searchSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestion(prev => 
            prev < searchSuggestions.length - 1 ? prev + 1 : 0
          );
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestion(prev => 
            prev > 0 ? prev - 1 : searchSuggestions.length - 1
          );
        }
        if (e.key === 'Enter' && selectedSuggestion >= 0) {
          e.preventDefault();
          const selected = searchSuggestions[selectedSuggestion];
          handleSearchSelect(selected);
        }
        if (e.key === 'Tab' && selectedSuggestion >= 0) {
          e.preventDefault();
          const selected = searchSuggestions[selectedSuggestion];
          setSearchQuery(selected.title);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSearchModal, searchSuggestions, selectedSuggestion]);

  const handleSearchSelect = (item) => {
    if (item.type === 'page') {
      setCurrentSection(item.path);
    } else if (item.type === 'action' && item.path === 'notifications') {
      setShowNotificationsModal(true);
    }
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSuggestions([]);
    setSelectedSuggestion(-1);
  };

  const searchableItems = [
    { type: 'page', title: 'Dashboard', path: 'home', description: 'View your overview and quick actions' },
    { type: 'page', title: 'Notices', path: 'notices', description: 'Check student notices and announcements' },
    { type: 'page', title: 'Timetable', path: 'timetable', description: 'View your class schedule' },
    { type: 'page', title: 'Account', path: 'account', description: 'Manage your account settings' },
    { type: 'action', title: 'View Notifications', path: 'notifications', description: 'Open notifications panel' },
    { type: 'data', title: 'Classes Today', path: 'classes', description: 'See today\'s class schedule' },
    { type: 'data', title: 'Recent Activity', path: 'activity', description: 'View recent portal activity' },
  ];

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setSearchSuggestions([]);
      return;
    }
    
    const results = searchableItems.filter(item => 
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
    setSearchSuggestions(results.slice(0, 5));
    setSelectedSuggestion(-1);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showUserDropdown && !target.closest('.user-profile') && !target.closest('.user-dropdown')) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showUserDropdown]);

  const renderCurrentSection = () => {
    switch (currentSection) {
      case 'home':
        return (
          <div className={styles.contentWrapper}>
            <div className={styles.contentWrapperInner}>
              {/* Welcome card */}
              <div className={`${styles.card} ${styles.welcomeCard}`}>
                <div className={styles.cardContent}>
                  <h2 className={styles.cardTitle}>Welcome to Millennium</h2>
                  <p className={styles.cardText}>This is the redesigned Millennium interface, built for productivity and ease of use.</p>
                  {dataLoading && (
                    <p className={styles.cardText} style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                      Loading portal data...
                    </p>
                  )}
                  {portalData?.lastUpdated && (
                    <p className={styles.cardText} style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                      Last updated: {new Date(portalData.lastUpdated).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Quick access grid */}
              <div className={styles.gridSection}>
                <h2 className={styles.sectionTitle}>Quick Access</h2>
                <div className={styles.cardGrid}>
                  <div className={styles.quickCard} onClick={() => handleSectionClick('timetable')}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/today-icon.svg" alt="Today" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Today&apos;s Classes</h3>
                      <p className={styles.quickCardText}>View your schedule for today</p>
                    </div>
                  </div>
                  <div className={styles.quickCard} onClick={() => handleSectionClick('homework')}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/homework-icon.svg" alt="Homework" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Assignments</h3>
                      <p className={styles.quickCardText}>Check your pending assignments</p>
                    </div>
                  </div>
                  <div className={styles.quickCard} onClick={() => setShowNotificationsModal(true)}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/notification-icon.svg" alt="Notifications" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Notifications</h3>
                      <p className={styles.quickCardText}>View recent notifications</p>
                    </div>
                  </div>
                  <div className={styles.quickCard} onClick={() => handleSectionClick('resources')}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/resources-icon.svg" alt="Resources" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Resources</h3>
                      <p className={styles.quickCardText}>Access learning materials</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent activity */}
              <div className={styles.listSection}>
                <h2 className={styles.sectionTitle}>Recent Activity</h2>
                <div className={styles.activityCard}>
                  <ul className={styles.activityList}>
                    <li className={styles.activityItem}>
                      <div className={styles.activityIcon}>
                        <img src="/Assets/activity-icon.svg" alt="Activity" />
                      </div>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTitle}>Portal Data Synced</div>
                        <div className={styles.activityTime}>Just now</div>
                      </div>
                    </li>
                    <li className={styles.activityItem}>
                      <div className={styles.activityIcon}>
                        <img src="/Assets/activity-icon.svg" alt="Activity" />
                      </div>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTitle}>Logged into Dashboard</div>
                        <div className={styles.activityTime}>Today</div>
                      </div>
                    </li>
                    <li className={styles.activityItem}>
                      <div className={styles.activityIcon}>
                        <img src="/Assets/activity-icon.svg" alt="Activity" />
                      </div>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTitle}>Account Settings Updated</div>
                        <div className={styles.activityTime}>Yesterday</div>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Classes list (linear style) */}
              <div className={styles.listSection}>
                <h2 className={styles.sectionTitle}>Your Classes</h2>
                <div className={styles.card}>
                  <table className={styles.listTable}>
                    <thead className={styles.listTableHeader}>
                      <tr>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Room</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const today = new Date();
                        const isWeekend = today.getDay() === 0 || today.getDay() === 6;
                        
                        if (dataLoading) {
                          return (
                            <tr className={styles.listTableRow}>
                              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                Loading classes...
                              </td>
                            </tr>
                          );
                        }
                        
                        if (isWeekend) {
                          return (
                            <tr className={styles.listTableRow}>
                              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                No classes today
                              </td>
                            </tr>
                          );
                        }
                        
                        if (!portalData?.timetable || portalData.timetable.length === 0) {
                          return (
                            <tr className={styles.listTableRow}>
                              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                No data to display
                              </td>
                            </tr>
                          );
                        }
                        
                        return portalData.timetable.map((item, index) => (
                          <tr key={index} className={styles.listTableRow}>
                            <td>{item.subject}</td>
                            <td>{item.teacher}</td>
                            <td>{item.room}</td>
                            <td>{item.period}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      case 'notices':
        return (
          <div className={styles.contentWrapper}>
            <div className={styles.contentWrapperInner}>
              <div className={`${styles.card} ${styles.noticesCard}`}>
                <h2>Student Notices</h2>
                <div className={styles.noticesList}>
                  {(() => {
                    if (dataLoading) {
                      return (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          Loading notices...
                        </div>
                      );
                    }
                    
                    if (!portalData?.notices || portalData.notices.length === 0) {
                      return (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          No data to display
                        </div>
                      );
                    }
                    
                    return portalData.notices.map((notice, index) => (
                      <div key={index} className={styles.noticeItem}>
                        <div className={styles.noticeTitle}>{notice.title}</div>
                        <div className={styles.noticePreview}>{notice.preview}</div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        );

      case 'timetable':
        return (
          <div className={styles.contentWrapper}>
            <div className={styles.contentWrapperInner}>
              <div className={`${styles.card} ${styles.timetableCard}`}>
                <h2>Today&apos;s Timetable</h2>
                <div className={styles.timetableList}>
                  {(() => {
                    const today = new Date();
                    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
                    
                    if (dataLoading) {
                      return (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          Loading timetable...
                        </div>
                      );
                    }
                    
                    if (isWeekend) {
                      return (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          No classes today
                        </div>
                      );
                    }
                    
                    if (!portalData?.timetable || portalData.timetable.length === 0) {
                      return (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          No data to display
                        </div>
                      );
                    }
                    
                    return portalData.timetable.map((item, index) => (
                      <div key={index} className={`${styles.timetableItem} ${item.isActive ? styles.active : ''}`}>
                        <span className={styles.timetablePeriod}>{item.period}</span>
                        <span className={styles.timetableSubject}>{item.subject}</span>
                        <span className={styles.timetableTeacher}>{item.teacher}</span>
                        <span className={styles.timetableRoom}>{item.room}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className={styles.contentWrapper}>
            <div className={styles.contentWrapperInner}>
              <div className={`${styles.card} ${styles.accountCard}`}>
                <h2>Account Information</h2>
                <div className={styles.accountFields}>
                  <div className={styles.accountField}>
                    <label className={styles.accountFieldLabel}>Name</label>
                    <div className={styles.accountFieldValue}>{displayName}</div>
                  </div>
                  <div className={styles.accountField}>
                    <label className={styles.accountFieldLabel}>School</label>
                    <div className={styles.accountFieldValue}>{displaySchool}</div>
                  </div>
                  <div className={styles.accountField}>
                    <label className={styles.accountFieldLabel}>Username</label>
                    <div className={styles.accountFieldValue}>{session?.username || 'N/A'}</div>
                  </div>
                  <div className={styles.accountField}>
                    <label className={styles.accountFieldLabel}>Last Login</label>
                    <div className={styles.accountFieldValue}>
                      {session?.timestamp ? new Date(session.timestamp).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className={styles.contentWrapper}>
            <div className={styles.contentWrapperInner}>
              <div className={`${styles.card} ${styles.placeholderCard}`}>
                <div className={styles.placeholderMessage}>
                  <div className={styles.placeholderIcon}>
                    <img src="/Assets/question-mark.svg" alt="Coming soon" />
                  </div>
                  <h3>Coming Soon</h3>
                  <p>The {currentSection} section is coming soon. Stay tuned for updates!</p>
                </div>
              </div>
            </div>
          </div>
        );
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
              <div className={`${styles.userProfile} user-profile`} onClick={toggleUserDropdown}>
                <div className={styles.userAvatar}>
                  <span className={styles.userInitials}>
                    {getUserInitials(session.username)}
                  </span>
                </div>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>
                    {displayName}
                  </div>
                  <div className={styles.userSchool}>{displaySchool}</div>
                </div>
              </div>

              {/* Navigation - Essentials */}
              <div className={`${styles.navSection} ${collapsedSections.includes('essentials') ? styles.collapsed : ''}`}>
                <div className={styles.navHeadingContainer} onClick={() => toggleSection('essentials')}>
                  <h2 className={styles.navHeading}>Essentials</h2>
                  <img 
                    src="/Assets/angle-down.svg" 
                    alt="Collapse" 
                    className={styles.navCollapseIcon}
                    style={{ transform: collapsedSections.includes('essentials') ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                </div>
                <ul className={styles.navList}>
                  <li className={`${styles.navItem} ${currentSection === 'home' ? styles.active : ''}`}>
                    <a href="#home" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('home'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/home-icon.svg" alt="Home" />
                      </span>
                      <span>Home</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'account' ? styles.active : ''}`}>
                    <a href="#account" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('account'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/account-icon.svg" alt="Account" />
                      </span>
                      <span>Account</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'notices' ? styles.active : ''}`}>
                    <a href="#notices" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('notices'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/notices-icon.svg" alt="Notices" />
                      </span>
                      <span>Notices</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'calendar' ? styles.active : ''}`}>
                    <a href="#calendar" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('calendar'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/calendar-icon.svg" alt="Calendar" />
                      </span>
                      <span>Calendar</span>
                    </a>
                  </li>
                </ul>
              </div>

              {/* Navigation - Register */}
              <div className={`${styles.navSection} ${collapsedSections.includes('register') ? styles.collapsed : ''}`}>
                <div className={styles.navHeadingContainer} onClick={() => toggleSection('register')}>
                  <h2 className={styles.navHeading}>Register</h2>
                  <img 
                    src="/Assets/angle-down.svg" 
                    alt="Collapse" 
                    className={styles.navCollapseIcon}
                    style={{ transform: collapsedSections.includes('register') ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                </div>
                <ul className={styles.navList}>
                  <li className={`${styles.navItem} ${currentSection === 'classes' ? styles.active : ''}`}>
                    <a href="#classes" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('classes'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/classes-icon.svg" alt="Classes" />
                      </span>
                      <span>Classes</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'timetable' ? styles.active : ''}`}>
                    <a href="#timetable" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('timetable'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/timetable-icon.svg" alt="Timetable" />
                      </span>
                      <span>Timetable</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'reports' ? styles.active : ''}`}>
                    <a href="#reports" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('reports'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/reports-icon.svg" alt="Reports" />
                      </span>
                      <span>Reports</span>
                    </a>
                  </li>
                  <li className={`${styles.navItem} ${currentSection === 'attendance' ? styles.active : ''}`}>
                    <a href="#attendance" className={styles.navLink} onClick={(e) => { e.preventDefault(); handleSectionClick('attendance'); }}>
                      <span className={styles.navIcon}>
                        <img src="/Assets/attendance-icon.svg" alt="Attendance" />
                      </span>
                      <span>Attendance</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* User dropdown menu */}
            <div className={`${styles.userDropdown} user-dropdown ${showUserDropdown ? styles.active : ''}`}>
              <div className={styles.dropdownItem} onClick={() => handleSectionClick('preferences')}>
                <img src="/Assets/preferences-icon.svg" alt="Preferences" className={styles.dropdownIcon} />
                <span>Preferences</span>
              </div>
              <div className={styles.dropdownItem} onClick={handleLogout}>
                <img src="/Assets/cross.svg" alt="Logout" className={styles.dropdownIcon} />
                <span>Log out</span>
              </div>
            </div>
          </nav>

          {/* Main content area */}
          <main className={styles.mainContent}>
            <div className={styles.contentContainer}>
              <header className={styles.contentHeader}>
                <h1 className={styles.pageTitle}>{currentSection.charAt(0).toUpperCase() + currentSection.slice(1)}</h1>
                
                {/* Search shortcut info */}
                <div className={styles.headerSearchShortcut}>
                  Press <span className={styles.shortcutKey}>⌘</span><span className={styles.shortcutKey}>K</span> to search
                </div>
                
                {/* Header actions */}
                <div className={styles.headerActions}>
                  <button 
                    className={styles.headerActionBtn} 
                    onClick={() => loadPortalData(true)}
                    disabled={dataLoading}
                    title="Refresh"
                  >
                    <img src="/Assets/refresh-icon.svg" alt="Refresh" />
                  </button>
                  <button 
                    className={styles.headerActionBtn} 
                    onClick={() => setShowNotificationsModal(true)}
                    title="Notifications"
                  >
                    <img src="/Assets/notification-icon.svg" alt="Notifications" />
                  </button>
                  <button 
                    className={styles.headerActionBtn} 
                    onClick={() => handleSectionClick('preferences')}
                    title="Preferences"
                  >
                    <img src="/Assets/preferences-icon.svg" alt="Preferences" />
                  </button>
                </div>
              </header>

              {renderCurrentSection()}
            </div>
          </main>
        </div>

        {/* Search modal */}
        {showSearchModal && (
          <div className={styles.searchModal} onClick={(e) => e.target === e.currentTarget && setShowSearchModal(false)}>
            <div className={styles.searchModalContainer}>
              <div className={styles.searchModalHeader}>
                <input 
                  type="text" 
                  className={styles.searchModalInput} 
                  placeholder="Search commands, pages, and more..." 
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.searchModalResults}>
                {searchQuery ? (
                  <div>
                    <div className={styles.searchCategoryHeader}>Navigation</div>
                    {searchResults
                      .filter(item => item.type === 'page')
                      .map(item => (
                        <div key={item.title} className={styles.searchResult} onClick={() => {
                          handleSearchSelect(item);
                        }}>
                          <div className={styles.searchResultIcon}>
                            <img src={`/Assets/${item.path === 'home' ? 'home' : item.path === 'account' ? 'account' : item.path === 'notices' ? 'notices' : item.path === 'calendar' ? 'calendar' : item.path === 'classes' ? 'classes' : item.path === 'timetable' ? 'timetable' : item.path === 'reports' ? 'reports' : 'attendance'}-icon.svg`} alt={item.title} />
                            <img src={`/Assets/${item === 'home' ? 'home' : item === 'account' ? 'account' : item === 'notices' ? 'notices' : item === 'calendar' ? 'calendar' : item === 'classes' ? 'classes' : item === 'timetable' ? 'timetable' : item === 'reports' ? 'reports' : 'attendance'}-icon.svg`} alt={item} />
                          </div>
                          <div className={styles.searchResultContent}>
                            <div className={styles.searchResultTitle}>{item.charAt(0).toUpperCase() + item.slice(1)}</div>
                            <div className={styles.searchResultDescription}>Navigate to {item}</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className={styles.searchEmptyState}>
                    <p>Start typing to search...</p>
                  </div>
                )}
              </div>
              <div className={styles.searchModalFooter}>
                <div className={styles.searchShortcutHint}>
                  <span className={styles.shortcutKey}>⌘</span>
                  <span className={styles.shortcutKey}>K</span>
                  <span className={styles.shortcutLabel}>to search</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications modal */}
        {showNotificationsModal && (
          <div className={`${styles.notificationsModal} ${showNotificationsModal ? styles.active : ''}`} onClick={(e) => e.target === e.currentTarget && setShowNotificationsModal(false)}>
            <div className={`${styles.notificationsModalContainer} ${styles.emailStyle}`}>
              {/* Left sidebar for categories */}
              <div className={styles.notificationsSidebar}>
                <div className={styles.notificationsSidebarHeader}>
                  <h3>Notifications</h3>
                </div>
                <div className={styles.notificationsSidebarContent}>
                  <ul className={styles.notificationsCategories}>
                    <li className={`${styles.categoryItem} ${styles.active}`} data-category="inbox">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/inbox.svg" alt="Inbox" />
                      </div>
                      <span>Inbox</span>
                      <span className={styles.unreadCount}>12</span>
                    </li>
                    <li className={styles.categoryItem} data-category="pinned">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/pinned.svg" alt="Pinned" />
                      </div>
                      <span>Pinned</span>
                      <span className={styles.unreadCount}>3</span>
                    </li>
                    <li className={styles.categoryItem} data-category="alerts">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/alert.svg" alt="Alerts" />
                      </div>
                      <span>Alerts</span>
                      <span className={styles.unreadCount}>5</span>
                    </li>
                    <li className={styles.categoryItem} data-category="calendar">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/calendar-icon.svg" alt="Calendar" />
                      </div>
                      <span>Events</span>
                      <span className={styles.unreadCount}>2</span>
                    </li>
                    <li className={styles.categoryItem} data-category="homework">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/homework-icon.svg" alt="Homework" />
                      </div>
                      <span>Assignments</span>
                      <span className={styles.unreadCount}>4</span>
                    </li>
                    <li className={styles.categoryItem} data-category="archive">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/archive.svg" alt="Archive" />
                      </div>
                      <span>Archive</span>
                    </li>
                    <li className={styles.categoryItem} data-category="trash">
                      <div className={styles.categoryIcon}>
                        <img src="/Assets/trash.svg" alt="Trash" />
                      </div>
                      <span>Trash</span>
                    </li>
                  </ul>
                </div>
                <div className={styles.notificationsSidebarFooter}>
                  <button className={styles.sidebarActionBtn} title="Notification settings">
                    <img src="/Assets/settings-icon.svg" alt="Settings" />
                  </button>
                  <button className={styles.sidebarActionBtn} title="Refresh notifications">
                    <img src="/Assets/refresh-icon.svg" alt="Refresh" />
                  </button>
                  <button className={styles.sidebarActionBtn} onClick={() => setShowNotificationsModal(false)} title="Close notifications">
                    <img src="/Assets/cross.svg" alt="Close" />
                  </button>
                </div>
              </div>

              {/* Middle panel for notification list */}
              <div className={styles.notificationsListPanel}>
                <div className={styles.notificationsListHeader}>
                  <div className={styles.listSearch}>
                    <span className={styles.searchIcon}>
                      <img src="/Assets/search.svg" alt="Search" />
                    </span>
                    <input type="text" placeholder="Search notifications..." />
                  </div>
                  
                  <div className={styles.listHeaderActions}>
                    <button className={styles.headerActionBtn} title="Mark all as read">
                      <img src="/Assets/mark-read.svg" alt="Mark all as read" />
                    </button>
                    <button className={styles.headerActionBtn} title="Filter">
                      <img src="/Assets/filter.svg" alt="Filter" />
                    </button>
                    <button className={styles.headerActionBtn} title="Sort by date">
                      <img src="/Assets/sort.svg" alt="Sort" />
                    </button>
                  </div>
                </div>
                
                <div className={styles.notificationsListContent}>
                  {/* Today's notifications */}
                  <div className={styles.notificationsDateSection}>
                    <h4 className={styles.dateHeader}>Today</h4>
                    <div className={styles.notificationItems}>
                      <div className={`${styles.notificationItem} ${styles.unread} ${styles.selected}`}>
                        <div className={styles.notificationStatus}>
                          <div className={styles.unreadIndicator}></div>
                        </div>
                        <div className={styles.notificationIcon}>
                          <img src="/Assets/alert.svg" alt="Alert" />
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>Portal Maintenance Notice</div>
                          <div className={styles.notificationPreview}>Scheduled maintenance will occur this weekend. Please save your work before Friday 8 PM.</div>
                          <div className={`${styles.priorityIndicator} ${styles.high}`}></div>
                        </div>
                        <div className={styles.notificationTime}>10:45 AM</div>
                        <div className={styles.notificationActions}>
                          <button className={styles.notifActionBtn} title="Mark as read">
                            <img src="/Assets/mark-read.svg" alt="Mark as read" />
                          </button>
                          <button className={styles.notifActionBtn} title="Pin notification">
                            <img src="/Assets/pin.svg" alt="Pin" />
                          </button>
                        </div>
                      </div>
                      
                      <div className={`${styles.notificationItem} ${styles.unread}`}>
                        <div className={styles.notificationStatus}>
                          <div className={styles.unreadIndicator}></div>
                        </div>
                        <div className={styles.notificationIcon}>
                          <img src="/Assets/homework-icon.svg" alt="Homework" />
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>New Assignment Posted</div>
                          <div className={styles.notificationPreview}>Mathematics assignment on functions has been posted. Due next Monday.</div>
                          <div className={`${styles.priorityIndicator} ${styles.medium}`}></div>
                        </div>
                        <div className={styles.notificationTime}>9:30 AM</div>
                        <div className={styles.notificationActions}>
                          <button className={styles.notifActionBtn} title="Mark as read">
                            <img src="/Assets/mark-read.svg" alt="Mark as read" />
                          </button>
                          <button className={styles.notifActionBtn} title="Pin notification">
                            <img src="/Assets/pin.svg" alt="Pin" />
                          </button>
                        </div>
                      </div>
                      
                      <div className={`${styles.notificationItem} ${styles.unread}`}>
                        <div className={styles.notificationStatus}>
                          <div className={styles.unreadIndicator}></div>
                        </div>
                        <div className={styles.notificationIcon}>
                          <img src="/Assets/calendar-icon.svg" alt="Calendar" />
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>Assembly Rescheduled</div>
                          <div className={styles.notificationPreview}>School assembly moved to Thursday at 10 AM in the main hall.</div>
                          <div className={`${styles.priorityIndicator} ${styles.medium}`}></div>
                        </div>
                        <div className={styles.notificationTime}>8:15 AM</div>
                        <div className={styles.notificationActions}>
                          <button className={styles.notifActionBtn} title="Mark as read">
                            <img src="/Assets/mark-read.svg" alt="Mark as read" />
                          </button>
                          <button className={styles.notifActionBtn} title="Pin notification">
                            <img src="/Assets/pin.svg" alt="Pin" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.notificationsDateSection}>
                    <h4 className={styles.dateHeader}>Yesterday</h4>
                    <div className={styles.notificationItems}>
                      <div className={styles.notificationItem}>
                        <div className={styles.notificationStatus}></div>
                        <div className={styles.notificationIcon}>
                          <img src="/Assets/grade.svg" alt="Grade" />
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>Assignment Graded</div>
                          <div className={styles.notificationPreview}>Your essay has been graded. Check your assignments for feedback.</div>
                          <div className={`${styles.priorityIndicator} ${styles.low}`}></div>
                        </div>
                        <div className={styles.notificationTime}>Yesterday</div>
                        <div className={styles.notificationActions}>
                          <button className={styles.notifActionBtn} title="Mark as unread">
                            <img src="/Assets/mark-unread.svg" alt="Mark as unread" />
                          </button>
                          <button className={styles.notifActionBtn} title="Pin notification">
                            <img src="/Assets/pin.svg" alt="Pin" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right panel for notification details */}
              <div className={styles.notificationsDetailPanel}>
                <div className={styles.noNotificationSelected}>
                  <img src="/Assets/inbox.svg" alt="No notification selected" className={styles.emptyStateIcon} />
                  <h3>No notification selected</h3>
                  <p>Select a notification to view its details</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}