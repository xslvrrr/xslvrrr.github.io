import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import styles from '../styles/Dashboard.module.css';
import { UserSession, TimetableEntry, Notice, DiaryEntry } from '../types/portal';
import { useDashboardData } from '../hooks/useDashboardData';
import { useNotifications } from '../hooks/useNotifications';
import { useKeyboardShortcuts, createDashboardShortcuts } from '../hooks/useKeyboardShortcuts';

// Dynamically import heavy components for code splitting
const LoadingSkeleton = dynamic(() => import('../components/LoadingSkeleton').then(mod => ({ default: mod.LoadingSkeleton })), {
  ssr: false
});

export default function Dashboard() {
  const router = useRouter();
  
  // Use custom hooks for better organization
  const {
    session,
    isLoading,
    portalData,
    dataLoading,
    checkSession,
    loadPortalData,
    handleLogout
  } = useDashboardData();
  
  const notificationHooks = useNotifications(portalData?.notices);
  
  // Enhanced dashboard state
  const [currentSection, setCurrentSection] = useState('home');
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [currentView, setCurrentView] = useState<string>('dashboard');
  
  // Destructure notification hooks
  const {
    selectedCategory,
    setSelectedCategory,
    selectedNotification,
    setSelectedNotification,
    notificationSearchQuery,
    setNotificationSearchQuery,
    showTooltip,
    setShowTooltip,
    notificationCounts,
    toggleRead,
    togglePin,
    toggleArchive,
    getFilteredNotifications,
    getNotificationId
  } = notificationHooks;

  // Keyboard shortcuts
  const shortcuts = createDashboardShortcuts({
    onSearch: () => setShowSearchModal(true),
    onHome: () => {
      window.location.hash = 'home';
      setCurrentView('dashboard');
    },
    onNotifications: () => {
      window.location.hash = 'notifications';
      setCurrentView('notifications');
    },
    onRefresh: () => loadPortalData(true)
  });
  
  useKeyboardShortcuts(shortcuts);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Handle hash-based navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (hash === 'notifications') {
        setCurrentView('notifications');
        setCurrentSection('');
      } else if (hash) {
        setCurrentSection(hash);
        setCurrentView('dashboard');
      } else {
        setCurrentSection('home');
        setCurrentView('dashboard');
      }
    };

    // Handle initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (session?.loggedIn) {
      loadPortalData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Removed duplicate notification count update - handled above

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
    window.location.hash = section;
    setShowUserDropdown(false);
  }, []);

  const toggleUserDropdown = useCallback(() => {
    setShowUserDropdown(prev => !prev);
  }, []);

  // Get filtered search results
  const getSearchResults = useCallback(() => {
    const sections = ['home', 'account', 'notices', 'calendar', 'classes', 'timetable', 'reports', 'attendance'];
    return sections.filter(item => 
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Handle search modal keyboard navigation
  const handleSearchKeyDown = useCallback((e: any) => {
    const results = getSearchResults();
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex(prev => 
        prev < results.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex(prev => 
        prev > 0 ? prev - 1 : results.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedSearchIndex]) {
        handleSectionClick(results[selectedSearchIndex]);
        setShowSearchModal(false);
        setSearchQuery('');
        setSelectedSearchIndex(0);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (results[selectedSearchIndex]) {
        setSearchQuery(results[selectedSearchIndex]);
      }
    }
  }, [getSearchResults, selectedSearchIndex, handleSectionClick]);

  // Reset selected index when search query changes
  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [searchQuery]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setShowSearchModal(true);
      setSelectedSearchIndex(0);
    }
    // Escape to close modals
    if (e.key === 'Escape') {
      setShowSearchModal(false);
      setShowUserDropdown(false);
      setSearchQuery('');
      setSelectedSearchIndex(0);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
                  <div className={styles.quickCard} onClick={() => handleSectionClick('notices')}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/notices-icon.svg" alt="Notices" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Notices</h3>
                      <p className={styles.quickCardText}>Check school notices</p>
                    </div>
                  </div>
                  <div className={styles.quickCard} onClick={() => { setCurrentView('notifications'); setCurrentSection(''); }}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/notification-icon.svg" alt="Notifications" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Notifications</h3>
                      <p className={styles.quickCardText}>View recent notifications</p>
                    </div>
                  </div>
                  <div className={styles.quickCard} onClick={() => handleSectionClick('reports')}>
                    <div className={styles.quickCardContent}>
                      <div className={styles.quickCardIcon}>
                        <img src="/Assets/reports-icon.svg" alt="Reports" />
                      </div>
                      <h3 className={styles.quickCardTitle}>Reports</h3>
                      <p className={styles.quickCardText}>Access your reports</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent activity */}
              <div className={styles.listSection}>
                <h2 className={styles.sectionTitle}>Recent Activity</h2>
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>
                    <img src="/Assets/activity-icon.svg" alt="No activity" />
                  </div>
                  <div className={styles.emptyStateText}>No recent activity</div>
                </div>
              </div>

              {/* Classes list (linear style) */}
              <div className={styles.listSection}>
                <h2 className={styles.sectionTitle}>Your Classes</h2>
                {dataLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner}></div>
                    <span>Loading classes...</span>
                  </div>
                ) : (
                  <table className={styles.listTable}>
                    <thead className={styles.listTableHeader}>
                      <tr>
                        <th>Status</th>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Room</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portalData?.timetable && portalData.timetable.length > 0 ? (
                        portalData.timetable.map((item, index) => (
                          <tr key={index} className={`${styles.listTableRow} ${item.attendanceStatus === 'present' ? styles.presentClass : ''}`}>
                            <td>
                              <div className={`${styles.attendanceIndicator} ${styles[item.attendanceStatus]}`}>
                                {item.attendanceStatus === 'present' ? '●' : 
                                 item.attendanceStatus === 'absent' ? '●' :
                                 item.attendanceStatus === 'partial' ? '●' : '○'}
                              </div>
                            </td>
                            <td>{item.subject}</td>
                            <td>{item.teacher}</td>
                            <td>{item.room}</td>
                            <td>{item.period}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className={styles.listTableRow}>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            {(() => {
                              const day = new Date().getDay();
                              if (day === 0 || day === 6) return 'No classes - Weekend';
                              return 'No classes today - School holiday';
                            })()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
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
                {dataLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner}></div>
                    <span>Loading notices...</span>
                  </div>
                ) : (
                  <div className={styles.noticesList}>
                    {portalData?.notices && portalData.notices.length > 0 ? (
                      portalData.notices.map((notice, index) => (
                        <div key={index} className={styles.noticeItem}>
                          <div className={styles.noticeTitle}>{notice.title}</div>
                          <div className={styles.noticePreview}>{notice.preview}</div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <img src="/Assets/notification-icon.svg" alt="No notices" />
                        </div>
                        <div className={styles.emptyStateText}>No notices available</div>
                      </div>
                    )}
                  </div>
                )}
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
                {dataLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner}></div>
                    <span>Loading timetable...</span>
                  </div>
                ) : (
                  <div className={styles.timetableList}>
                    {portalData?.timetable && portalData.timetable.length > 0 ? (
                      portalData.timetable.map((item, index) => (
                        <div key={index} className={`${styles.timetableItem} ${item.attendanceStatus === 'present' ? styles.present : ''}`}>
                          <span className={styles.timetablePeriod}>{item.period}</span>
                          <span className={styles.timetableSubject}>{item.subject}</span>
                          <span className={styles.timetableTeacher}>{item.teacher}</span>
                          <span className={styles.timetableRoom}>{item.room}</span>
                          <span className={`${styles.attendanceStatus} ${styles[item.attendanceStatus]}`}>
                            {item.attendanceStatus === 'present' ? '● Present' : 
                             item.attendanceStatus === 'absent' ? '● Absent' :
                             item.attendanceStatus === 'partial' ? '● Partial' : '○ Unmarked'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <img src="/Assets/today-icon.svg" alt="No classes" />
                        </div>
                        <div className={styles.emptyStateText}>
                          {(() => {
                            const day = new Date().getDay();
                            if (day === 0 || day === 6) return 'No classes - Weekend';
                            return 'No classes - School holiday';
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

      case 'reports':
      case 'classes':
      case 'attendance':
      case 'calendar':
      case 'preferences':
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
        <title>{currentSection === 'home' ? 'Dashboard' : `${currentSection.charAt(0).toUpperCase() + currentSection.slice(1)}`} - Millennium Portal</title>
        <meta name="description" content="Your student dashboard - access timetable, notices, and more" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
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
                  <img 
                    src="/Assets/angle-down.svg" 
                    alt="Collapse" 
                    className={styles.navCollapseIcon}
                    style={{ transform: collapsedSections.includes('essentials') ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                  <h2 className={styles.navHeading}>Essentials</h2>
                </div>
                <ul className={styles.navList}>
                  <li className={`${styles.navItem} ${currentView === 'notifications' ? styles.active : ''}`}>
                    <a 
                      href="#notifications"
                      className={styles.navLink}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentView('notifications');
                        setCurrentSection('');
                      }}
                    >
                      <span className={styles.navIcon}>
                        <img src="/Assets/notification-icon.svg" alt="Notifications" />
                        {notificationCounts.inbox > 0 && (
                          <span className={styles.notificationBadge}>{notificationCounts.inbox}</span>
                        )}
                      </span>
                      <span>Notifications</span>
                    </a>
                  </li>
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
                  <img 
                    src="/Assets/angle-down.svg" 
                    alt="Collapse" 
                    className={styles.navCollapseIcon}
                    style={{ transform: collapsedSections.includes('register') ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                  <h2 className={styles.navHeading}>Register</h2>
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

          {/* Main Content */}
          <div className={styles.mainContent}>
            {currentView === 'notifications' ? (
              <>
                {/* Header */}
                <div className={styles.header}>
                  <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Notifications</h1>
                  </div>
                  <div className={styles.headerRight}>
                    <button 
                      className={styles.headerActionBtn} 
                      onClick={() => setShowSearchModal(true)}
                      title="Search"
                    >
                      <img src="/Assets/search.svg" alt="Search" />
                    </button>
                    <button 
                      className={styles.headerActionBtn} 
                      onClick={() => loadPortalData(true)}
                      title="Refresh"
                    >
                      <img src="/Assets/refresh-icon.svg" alt="Refresh" />
                    </button>
                  </div>
                </div>
                <div className={styles.notificationsContainer}>
                  {/* Left sidebar - categories */}
                  <div className={styles.notificationsSidebar}>
                    
                    <div className={styles.sidebarContent}>
                      <div className={styles.categoryList}>
                        {[
                          { id: 'inbox', label: 'Inbox', icon: 'inbox.svg', count: notificationCounts.inbox },
                          { id: 'pinned', label: 'Pinned', icon: 'pin.svg', count: notificationCounts.pinned },
                          { id: 'alerts', label: 'Alerts', icon: 'alert.svg', count: notificationCounts.alerts },
                          { id: 'events', label: 'Events', icon: 'calendar-icon.svg', count: notificationCounts.events },
                          { id: 'assignments', label: 'Assignments', icon: 'homework-icon.svg', count: notificationCounts.assignments },
                          { id: 'archive', label: 'Archive', icon: 'archive.svg', count: notificationCounts.archive },
                          { id: 'trash', label: 'Trash', icon: 'trash.svg', count: notificationCounts.trash }
                        ].map((category) => (
                          <button
                            key={category.id}
                            className={`${styles.categoryItem} ${selectedCategory === category.id ? styles.active : ''}`}
                            onClick={() => setSelectedCategory(category.id)}
                            onMouseEnter={() => setShowTooltip(category.id)}
                            onMouseLeave={() => setShowTooltip(null)}
                          >
                            <div className={styles.categoryIcon}>
                              <img src={`/Assets/${category.icon}`} alt={category.label} />
                            </div>
                            {category.count > 0 && (
                              <span className={styles.categoryCount}>{category.count}</span>
                            )}
                            {showTooltip === category.id && (
                              <div className={styles.tooltip}>{category.label}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className={styles.sidebarFooter}>
                      <button 
                        className={styles.footerBtn}
                        onMouseEnter={() => setShowTooltip('preferences')}
                        onMouseLeave={() => setShowTooltip(null)}
                        onClick={() => handleSectionClick('preferences')}
                      >
                        <img src="/Assets/preferences-icon.svg" alt="Preferences" />
                        {showTooltip === 'preferences' && (
                          <div className={styles.tooltip}>Preferences</div>
                        )}
                      </button>
                      <button 
                        className={styles.footerBtn}
                        onClick={() => loadPortalData(true)}
                        onMouseEnter={() => setShowTooltip('refresh')}
                        onMouseLeave={() => setShowTooltip(null)}
                      >
                        <img src="/Assets/refresh-icon.svg" alt="Refresh" />
                        {showTooltip === 'refresh' && (
                          <div className={styles.tooltip}>Refresh</div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Middle panel - notification list */}
                  <div className={styles.notificationsList}>
                    <div className={styles.listHeader}>
                      <div className={styles.searchContainer}>
                        <img src="/Assets/search.svg" alt="Search" className={styles.searchIcon} />
                        <input 
                          type="text" 
                          placeholder="Search notifications..."
                          value={notificationSearchQuery}
                          onChange={(e) => setNotificationSearchQuery(e.target.value)}
                          className={styles.searchInput}
                        />
                      </div>
                      
                      <div className={styles.listActions}>
                        <button 
                          className={styles.actionBtn}
                          onMouseEnter={() => setShowTooltip('markAll')}
                          onMouseLeave={() => setShowTooltip(null)}
                        >
                          <img src="/Assets/mark-read.svg" alt="Mark all as read" />
                          {showTooltip === 'markAll' && (
                            <div className={styles.tooltip}>Mark all as read</div>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className={styles.listContent}>
                      {(() => {
                        const filteredNotifications = getFilteredNotifications();
                        return filteredNotifications.length > 0 ? (
                          <div className={styles.notificationGroup}>
                            <div className={styles.groupHeader}>
                              {selectedCategory === 'inbox' && 'Inbox'}
                              {selectedCategory === 'pinned' && 'Pinned'}
                              {selectedCategory === 'alerts' && 'Alerts'}
                              {selectedCategory === 'events' && 'Events'}
                              {selectedCategory === 'assignments' && 'Assignments'}
                              {selectedCategory === 'archive' && 'Archive'}
                              {selectedCategory === 'trash' && 'Trash'}
                            </div>
                            {filteredNotifications.map((notice, index) => {
                              const originalIndex = portalData?.notices?.findIndex(n => n === notice) || 0;
                              const notificationId = getNotificationId(notice, originalIndex);
                              const isRead = notificationHooks.notificationStates[notificationId]?.read || false;
                              const isPinned = notificationHooks.notificationStates[notificationId]?.pinned || false;
                              
                              return (
                                <div 
                                  key={index} 
                                  className={`${styles.notificationItem} ${selectedNotification === notice ? styles.selected : ''} ${isRead ? styles.read : ''}`}
                                  onClick={() => setSelectedNotification(notice)}
                                >
                                  <div className={styles.notificationMeta}>
                                    {!isRead && <div className={styles.unreadDot}></div>}
                                    <div className={styles.notificationIcon}>
                                      <img src="/Assets/notification-icon.svg" alt="Notice" />
                                    </div>
                                  </div>
                                  <div className={styles.notificationBody}>
                                    <div className={styles.notificationHeader}>
                                      <span className={styles.notificationTitle}>{notice.title}</span>
                                      <span className={styles.notificationTime}>Recent</span>
                                    </div>
                                    <div className={styles.notificationPreview}>{notice.preview}</div>
                                  </div>
                                  <div className={styles.notificationActions}>
                                    <button 
                                      className={styles.notificationActionBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleRead(getNotificationId(notice, index));
                                      }}
                                      onMouseEnter={() => setShowTooltip(`read-${originalIndex}`)}
                                      onMouseLeave={() => setShowTooltip(null)}
                                    >
                                      <img src={isRead ? "/Assets/mark-unread.svg" : "/Assets/mark-read.svg"} alt={isRead ? "Mark as unread" : "Mark as read"} />
                                      {showTooltip === `read-${originalIndex}` && (
                                        <div className={styles.tooltip}>{isRead ? "Mark as unread" : "Mark as read"}</div>
                                      )}
                                    </button>
                                    <button 
                                      className={styles.notificationActionBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePin(notificationId);
                                      }}
                                      onMouseEnter={() => setShowTooltip(`pin-${originalIndex}`)}
                                      onMouseLeave={() => setShowTooltip(null)}
                                    >
                                      <img src={isPinned ? "/Assets/pinned.svg" : "/Assets/pin.svg"} alt={isPinned ? "Unpin" : "Pin"} />
                                      {showTooltip === `pin-${originalIndex}` && (
                                        <div className={styles.tooltip}>{isPinned ? "Unpin notification" : "Pin notification"}</div>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={styles.emptyState}>
                            <img src="/Assets/inbox.svg" alt="No notifications" />
                            <h3>No notifications</h3>
                            <p>{selectedCategory === 'trash' ? 'Trash is empty' : 'No notifications in this category'}</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Right panel - notification details */}
                  <div className={styles.notificationDetails}>
                    {selectedNotification ? (() => {
                      const selectedIndex = portalData?.notices?.findIndex(n => n === selectedNotification) || 0;
                      const selectedId = getNotificationId(selectedNotification, selectedIndex);
                      const isSelectedRead = notificationHooks.notificationStates[selectedId]?.read || false;
                      const isSelectedPinned = notificationHooks.notificationStates[selectedId]?.pinned || false;
                      
                      return (
                        <div className={styles.detailsContent}>
                          <div className={styles.detailsHeader}>
                            <h3>{selectedNotification.title}</h3>
                            <div className={styles.detailsActions}>
                              <button 
                                className={styles.detailActionBtn}
                                onClick={() => toggleRead(getNotificationId(selectedNotification, selectedIndex))}
                                onMouseEnter={() => setShowTooltip('detailRead')}
                                onMouseLeave={() => setShowTooltip(null)}
                              >
                                <img src={isSelectedRead ? "/Assets/mark-unread.svg" : "/Assets/mark-read.svg"} alt={isSelectedRead ? "Mark as unread" : "Mark as read"} />
                                {showTooltip === 'detailRead' && (
                                  <div className={styles.tooltip}>{isSelectedRead ? "Mark as unread" : "Mark as read"}</div>
                                )}
                              </button>
                              <button 
                                className={styles.detailActionBtn}
                                onClick={() => togglePin(selectedId)}
                                onMouseEnter={() => setShowTooltip('detailPin')}
                                onMouseLeave={() => setShowTooltip(null)}
                              >
                                <img src={isSelectedPinned ? "/Assets/pinned.svg" : "/Assets/pin.svg"} alt={isSelectedPinned ? "Unpin" : "Pin"} />
                                {showTooltip === 'detailPin' && (
                                  <div className={styles.tooltip}>{isSelectedPinned ? "Unpin notification" : "Pin notification"}</div>
                                )}
                              </button>
                              <button 
                                className={styles.detailActionBtn}
                                onClick={() => toggleArchive(selectedId)}
                                onMouseEnter={() => setShowTooltip('detailArchive')}
                                onMouseLeave={() => setShowTooltip(null)}
                              >
                                <img src="/Assets/archive.svg" alt="Archive" />
                                {showTooltip === 'detailArchive' && (
                                  <div className={styles.tooltip}>Archive</div>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className={styles.detailsBody}>
                            <p>{selectedNotification.content}</p>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className={styles.emptyState}>
                        <img src="/Assets/inbox.svg" alt="No notification selected" />
                        <h3>No notification selected</h3>
                        <p>Select a notification to view its details</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div className={styles.header}>
                  <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>
                      {currentSection === 'account' && 'Account'}
                      {currentSection === 'notices' && 'Notices'}
                      {currentSection === 'calendar' && 'Calendar'}
                      {currentSection === 'timetable' && 'Timetable'}
                      {currentSection === 'attendance' && 'Attendance'}
                      {currentSection === 'homework' && 'Homework'}
                      {currentSection === 'grades' && 'Grades'}
                      {currentSection === 'resources' && 'Resources'}
                      {currentSection === 'reports' && 'Reports'}
                      {currentSection === 'preferences' && 'Preferences'}
                      {currentView === 'notifications' && 'Notifications'}
                      {!currentSection && !currentView && 'Dashboard'}
                    </h1>
                  </div>
                  <div className={styles.headerRight}>
                    <button 
                      className={styles.headerActionBtn} 
                      onClick={() => setShowSearchModal(true)}
                      title="Search"
                    >
                      <img src="/Assets/search.svg" alt="Search" />
                    </button>
                    <button 
                      className={styles.headerActionBtn} 
                      onClick={() => handleSectionClick('preferences')}
                      title="Preferences"
                    >
                      <img src="/Assets/preferences-icon.svg" alt="Preferences" />
                    </button>
                  </div>
                </div>

                {renderCurrentSection()}
              </>
            )}
          </div>
        </div>

        {/* Search modal */}
        {showSearchModal && (
          <div className={`${styles.searchModal} ${showSearchModal ? styles.active : ''}`} onClick={(e) => e.target === e.currentTarget && setShowSearchModal(false)}>
            <div className={styles.searchModalContainer}>
              <div className={styles.searchModalHeader}>
                <input 
                  type="text" 
                  className={styles.searchModalInput} 
                  placeholder="Search commands, pages, and more..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoFocus
                />
              </div>
              <div className={styles.searchModalResults}>
                {searchQuery ? (
                  <div>
                    <div className={styles.searchCategoryHeader}>Navigation</div>
                    {getSearchResults().map((item, index) => (
                      <div 
                        key={item} 
                        className={`${styles.searchResult} ${index === selectedSearchIndex ? styles.selected : ''}`} 
                        onClick={() => {
                          handleSectionClick(item);
                          setShowSearchModal(false);
                          setSearchQuery('');
                          setSelectedSearchIndex(0);
                        }}
                      >
                        <div className={styles.searchResultIcon}>
                          <img src={`/Assets/${item}-icon.svg`} alt={item} />
                        </div>
                        <div className={styles.searchResultContent}>
                          <div className={styles.searchResultTitle}>{item.charAt(0).toUpperCase() + item.slice(1)}</div>
                          <div className={styles.searchResultDescription}>Navigate to {item}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.searchEmptyState}>
                    <p>Start typing to search...</p>
                    <div className={styles.searchHints}>
                      <div className={styles.searchHint}>
                        <span className={styles.shortcutKey}>↑</span>
                        <span className={styles.shortcutKey}>↓</span>
                        <span>to navigate</span>
                      </div>
                      <div className={styles.searchHint}>
                        <span className={styles.shortcutKey}>↵</span>
                        <span>to select</span>
                      </div>
                      <div className={styles.searchHint}>
                        <span className={styles.shortcutKey}>Tab</span>
                        <span>to autocomplete</span>
                      </div>
                    </div>
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

      </div>
    </>
  );
}