// Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
  // Check login status and redirect if not logged in
  const debugSession = localStorage.getItem('millenniumDebugSession');
  const realSession = localStorage.getItem('millenniumSession');
  
  if (!debugSession && !realSession) {
    // No valid session found, redirect to login
    window.location.href = 'login.html';
    return;
  }
  
  // Parse session data
  const sessionData = debugSession ? JSON.parse(debugSession) : JSON.parse(realSession);
  
  // Update user profile section
  updateUserProfile(sessionData);
  
  // Set up navigation item click handlers
  setupNavigation();
  
  // Set up collapsible sections
  setupCollapsibleSections();
  
  // Initialize performance optimizations
  initPerformanceOptimizations();
  
  // Check if icons are loaded properly
  checkIcons();
  
  // Setup user dropdown menu (updated)
  setupUserDropdown();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Setup search modal
  setupSearchModal();
  
  // Setup header search
  setupHeaderSearch();
  
  // Setup logout confirmation
  setupLogoutConfirmation();
  
  // Initialize theme handling
  initializeTheme();
  
  // Show welcome screen for first-time users
  checkFirstTimeUser();
  
  // Setup header action buttons
  setupHeaderActions();
  
  // Setup notifications modal
  setupNotificationsModal();
  
  // Setup custom tooltips
  setupCustomTooltips();
  
  // Setup responsive sidebar
  setupResponsiveSidebar();
  
  // High-performance notification center - main initialization
  initHighPerfNotificationCenter();
});

/**
 * Setup responsive sidebar functionality
 */
function setupResponsiveSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  
  // Check window width and set narrow state if needed
  checkSidebarWidth();
  
  // Add sidebar resizer
  const resizer = document.createElement('div');
  resizer.className = 'sidebar-resizer';
  sidebar.appendChild(resizer);
  
  // Add event listeners for resizing
  let isResizing = false;
  let lastX = 0;
  
  // Start resize when mouse down on resizer
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    lastX = e.clientX;
    document.body.style.userSelect = 'none'; // Prevent text selection during resize
    
    // Add a class to the body to change the cursor
    document.body.classList.add('resizing');
  });
  
  // Update width on mouse move when resizing
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const delta = e.clientX - lastX;
    lastX = e.clientX;
    
    // Get current sidebar width and update it
    const currentWidth = parseInt(getComputedStyle(sidebar).width, 10);
    let newWidth = currentWidth + delta;
    
    // Set min and max width
    newWidth = Math.max(60, Math.min(300, newWidth));
    
    sidebar.style.width = `${newWidth}px`;
    localStorage.setItem('sidebarWidth', newWidth);
    
    // Update sidebar class based on width
    if (newWidth <= 80) {
      sidebar.classList.add('narrow');
    } else {
      sidebar.classList.remove('narrow');
    }
  });
  
  // Stop resizing on mouse up
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
      document.body.classList.remove('resizing');
    }
  });
  
  // Handle window resize
  window.addEventListener('resize', checkSidebarWidth);
  
  // Initial check for stored width
  const storedWidth = localStorage.getItem('sidebarWidth');
  if (storedWidth) {
    sidebar.style.width = `${storedWidth}px`;
    if (parseInt(storedWidth) <= 80) {
      sidebar.classList.add('narrow');
    }
  }
}

/**
 * Check window width and update sidebar state
 */
function checkSidebarWidth() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  
  // Add narrow class for small screens
  if (window.innerWidth < 768) {
    sidebar.classList.add('narrow');
  } else {
    // On larger screens, use stored preference if exists
    const storedWidth = localStorage.getItem('sidebarWidth');
    if (storedWidth && parseInt(storedWidth) <= 80) {
      sidebar.classList.add('narrow');
    } else if (!storedWidth && window.innerWidth < 1024) {
      sidebar.classList.add('narrow');
    } else {
      sidebar.classList.remove('narrow');
    }
  }
  
  // Add class for all navigation sections with headings
  document.querySelectorAll('.nav-section').forEach(section => {
    if (section.querySelector('.nav-heading')) {
      section.classList.add('with-heading');
    }
  });
}

/**
 * Updates the user profile section with session data
 * @param {Object} sessionData - User session information
 */
function updateUserProfile(sessionData) {
  const userNameElement = document.getElementById('user-display-name');
  const userSchoolElement = document.getElementById('user-school');
  const userInitialsElement = document.querySelector('.user-initials');
  
  if (userNameElement && sessionData.username) {
    userNameElement.textContent = sessionData.username;
  }
  
  if (userSchoolElement && sessionData.school) {
    userSchoolElement.textContent = sessionData.school;
  }
  
  // Generate user initials for avatar
  if (userInitialsElement && sessionData.username) {
    const nameParts = sessionData.username.split(' ');
    let initials = '';
    
    if (nameParts.length >= 2) {
      // Get first letter of first and last name
      initials = `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`;
    } else {
      // Just use first 1-2 characters of the username
      initials = sessionData.username.substring(0, 2);
    }
    
    userInitialsElement.textContent = initials.toUpperCase();
  }
}

/**
 * Sets up navigation item click handlers
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pageTitle = document.querySelector('.page-title');
  
  // Keep track of loaded sections for caching
  const loadedContent = new Set(['home']);
  // Keep track of currently active section
  let currentSection = 'home';
  
  navItems.forEach(item => {
    const link = item.querySelector('.nav-link');
    
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Get the target section from href
      const targetSection = this.getAttribute('href').substring(1);
      
      // Skip if clicking on already active section
      if (targetSection === currentSection) {
        return;
      }
      
      // Update active state
      navItems.forEach(navItem => navItem.classList.remove('active'));
      item.classList.add('active');
      
      // Update current section tracker
      currentSection = targetSection;
      
      // Update page title
      if (pageTitle) {
        pageTitle.textContent = this.querySelector('span:last-child').textContent;
      }
      
      // Load section content
      loadSectionContent(targetSection, loadedContent);
    });
  });
}

/**
 * Loads section-specific content
 * @param {string} section - Section identifier
 * @param {Set} loadedContent - Set of already loaded content sections
 */
function loadSectionContent(section, loadedContent) {
  const contentWrapper = document.querySelector('.content-wrapper');
  
  if (!contentWrapper) return;
  
  // Add loading state
  contentWrapper.classList.add('loading');
  
  // Create a slight delay for visual feedback
  setTimeout(() => {
    // Generate section content
    const content = generateSectionContent(section);
    
    // Update the DOM
    const contentInner = contentWrapper.querySelector('.content-wrapper-inner');
    if (contentInner) {
      // Cache old content for quick retrieval later
      if (!loadedContent.has(section)) {
        loadedContent.add(section);
      }
      
      // Set up transition 
      contentInner.style.opacity = '0';
      contentInner.style.transform = 'translateY(10px)';
      
      setTimeout(() => {
        // Replace content
        contentInner.innerHTML = content;
        
        // Fade in smoothly
        contentInner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        contentInner.style.opacity = '1';
        contentInner.style.transform = 'translateY(0)';
        
        // Initialize any components in the new content
        initializeSectionComponents(section);
        
        // Reset transition after animation completes
        setTimeout(() => {
          contentInner.style.transition = '';
        }, 300);
      }, 50);
    }
    
    // Remove loading state
    contentWrapper.classList.remove('loading');
  }, 50); // Reduced delay for better performance
}

/**
 * Generate content for different sections
 * @param {string} section - Section identifier
 * @returns {string} - HTML content for the section
 */
function generateSectionContent(section) {
  switch(section) {
    case 'home':
      return `
        <!-- Welcome card -->
        <div class="card welcome-card">
          <div class="card-content">
            <h2 class="card-title">Welcome to Millennium</h2>
            <p class="card-text">This is the new Millennium interface, designed for productivity and ease of use.</p>
            <p class="card-text">You are currently using a test account with no special permissions.</p>
          </div>
        </div>

        <!-- Quick access grid -->
        <div class="grid-section">
          <h2 class="section-title">Quick Access</h2>
          <div class="card-grid">
            <div class="quick-card">
              <div class="quick-card-content">
                <div class="quick-card-icon">
                  <img src="Assets/today-icon.svg" alt="Today">
                </div>
                <h3 class="quick-card-title">Today's Classes</h3>
                <p class="quick-card-text">View your schedule for today</p>
              </div>
            </div>
            <div class="quick-card">
              <div class="quick-card-content">
                <div class="quick-card-icon">
                  <img src="Assets/homework-icon.svg" alt="Homework">
                </div>
                <h3 class="quick-card-title">Assignments</h3>
                <p class="quick-card-text">Check your pending assignments</p>
              </div>
            </div>
            <div class="quick-card">
              <div class="quick-card-content">
                <div class="quick-card-icon">
                  <img src="Assets/notification-icon.svg" alt="Notifications">
                </div>
                <h3 class="quick-card-title">Notifications</h3>
                <p class="quick-card-text">View recent notifications</p>
              </div>
            </div>
            <div class="quick-card">
              <div class="quick-card-content">
                <div class="quick-card-icon">
                  <img src="Assets/resources-icon.svg" alt="Resources">
                </div>
                <h3 class="quick-card-title">Resources</h3>
                <p class="quick-card-text">Access learning materials</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent activity -->
        <div class="list-section">
          <h2 class="section-title">Recent Activity</h2>
          <div class="card activity-card">
            <ul class="activity-list">
              <li class="activity-item">
                <div class="activity-icon">
                  <img src="Assets/activity-icon.svg" alt="Activity">
                </div>
                <div class="activity-content">
                  <div class="activity-title">English Assignment Submitted</div>
                  <div class="activity-time">Yesterday</div>
                </div>
              </li>
              <li class="activity-item">
                <div class="activity-icon">
                  <img src="Assets/activity-icon.svg" alt="Activity">
                </div>
                <div class="activity-content">
                  <div class="activity-title">Math Test Graded</div>
                  <div class="activity-time">2 days ago</div>
                </div>
              </li>
              <li class="activity-item">
                <div class="activity-icon">
                  <img src="Assets/activity-icon.svg" alt="Activity">
                </div>
                <div class="activity-content">
                  <div class="activity-title">Science Project Reminder</div>
                  <div class="activity-time">3 days ago</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
        
        <!-- Classes list (linear style) -->
        <div class="list-section">
          <h2 class="section-title">Your Classes</h2>
          <div class="card">
            <table class="list-table">
              <thead class="list-table-header">
                <tr>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Room</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr class="list-table-row">
                  <td>English</td>
                  <td>Ms. Johnson</td>
                  <td>E301</td>
                  <td>9:00 AM</td>
                </tr>
                <tr class="list-table-row">
                  <td>Mathematics</td>
                  <td>Mr. Williams</td>
                  <td>M105</td>
                  <td>10:30 AM</td>
                </tr>
                <tr class="list-table-row">
                  <td>Science</td>
                  <td>Dr. Brown</td>
                  <td>S204</td>
                  <td>1:15 PM</td>
                </tr>
                <tr class="list-table-row">
                  <td>History</td>
                  <td>Mrs. Davis</td>
                  <td>H102</td>
                  <td>2:45 PM</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
      
    case 'account':
      return `
        <div class="card welcome-card">
          <div class="card-content">
            <h2 class="card-title">Your Account</h2>
            <p class="card-text">Manage your profile, settings, and preferences.</p>
          </div>
        </div>
        
        <!-- Account information -->
        <div class="grid-section">
          <h2 class="section-title">Personal Information</h2>
          <div class="card">
            <div class="card-content">
              <div class="account-field">
                <div class="account-field-label">Name</div>
                <div class="account-field-value" id="account-name">Test Student</div>
              </div>
              <div class="account-field">
                <div class="account-field-label">School</div>
                <div class="account-field-value" id="account-school">Test School</div>
              </div>
              <div class="account-field">
                <div class="account-field-label">Email</div>
                <div class="account-field-value">student@testschool.edu</div>
              </div>
              <div class="account-field">
                <div class="account-field-label">Role</div>
                <div class="account-field-value">Student</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Preferences section -->
        <div class="list-section">
          <h2 class="section-title">Preferences</h2>
          <div class="card">
            <div class="card-content">
              <div class="preference-group">
                <h3 class="preference-title">Theme</h3>
                <div class="preference-options">
                  <button class="preference-btn active">Dark</button>
                  <button class="preference-btn">Light</button>
                  <button class="preference-btn">System</button>
                </div>
              </div>
              <div class="preference-group">
                <h3 class="preference-title">Notifications</h3>
                <div class="preference-toggle-group">
                  <div class="preference-toggle-item">
                    <span>Email notifications</span>
                    <label class="toggle">
                      <input type="checkbox" checked>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                  <div class="preference-toggle-item">
                    <span>Browser notifications</span>
                    <label class="toggle">
                      <input type="checkbox">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
    case 'notices':
      return `
        <div class="card welcome-card">
          <div class="card-content">
            <h2 class="card-title">Notices</h2>
            <p class="card-text">View important announcements and notifications.</p>
          </div>
        </div>
        
        <!-- Notices list -->
        <div class="list-section">
          <h2 class="section-title">Latest Notices</h2>
          <div class="card">
            <ul class="notices-list">
              <li class="notice-item">
                <div class="notice-header">
                  <h3 class="notice-title">School Assembly - Friday</h3>
                  <span class="notice-date">Today</span>
                </div>
                <p class="notice-content">All students should attend the assembly in the main hall at 9:00 AM on Friday.</p>
              </li>
              <li class="notice-item">
                <div class="notice-header">
                  <h3 class="notice-title">Parent-Teacher Conference</h3>
                  <span class="notice-date">Yesterday</span>
                </div>
                <p class="notice-content">Parent-Teacher conferences will be held next Tuesday from 4:00 PM to 7:00 PM.</p>
              </li>
              <li class="notice-item">
                <div class="notice-header">
                  <h3 class="notice-title">System Maintenance</h3>
                  <span class="notice-date">3 days ago</span>
                </div>
                <p class="notice-content">The portal will be undergoing scheduled maintenance this weekend.</p>
              </li>
            </ul>
          </div>
        </div>
      `;
      
    case 'calendar':
      return `
        <div class="card welcome-card">
          <div class="card-content">
            <h2 class="card-title">Calendar</h2>
            <p class="card-text">View and manage your schedule and important dates.</p>
          </div>
        </div>
        
        <!-- Calendar view placeholder -->
        <div class="grid-section">
          <div class="calendar-header">
            <button class="calendar-nav-btn">&lt;</button>
            <h2 class="calendar-title">October 2023</h2>
            <button class="calendar-nav-btn">&gt;</button>
          </div>
          <div class="calendar-container">
            <div class="calendar-weekdays">
              <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
            </div>
            <div class="calendar-days">
              <!-- Empty cells for days from previous month -->
              <div class="calendar-day empty"></div>
              <div class="calendar-day empty"></div>
              <div class="calendar-day empty"></div>
              <div class="calendar-day empty"></div>
              <div class="calendar-day empty"></div>
              <div class="calendar-day empty"></div>
              
              <!-- Days of current month -->
              <div class="calendar-day">1</div>
              <div class="calendar-day">2</div>
              <div class="calendar-day">3</div>
              <div class="calendar-day">4</div>
              <div class="calendar-day">5</div>
              <div class="calendar-day">6</div>
              <div class="calendar-day">7</div>
              <div class="calendar-day">8</div>
              <div class="calendar-day">9</div>
              <div class="calendar-day">10</div>
              <div class="calendar-day">11</div>
              <div class="calendar-day">12</div>
              <div class="calendar-day has-event">13</div>
              <div class="calendar-day">14</div>
              <div class="calendar-day">15</div>
              <div class="calendar-day has-event">16</div>
              <div class="calendar-day">17</div>
              <div class="calendar-day">18</div>
              <div class="calendar-day">19</div>
              <div class="calendar-day">20</div>
              <div class="calendar-day">21</div>
              <div class="calendar-day">22</div>
              <div class="calendar-day today">23</div>
              <div class="calendar-day">24</div>
              <div class="calendar-day">25</div>
              <div class="calendar-day">26</div>
              <div class="calendar-day">27</div>
              <div class="calendar-day has-event">28</div>
              <div class="calendar-day">29</div>
              <div class="calendar-day">30</div>
              <div class="calendar-day">31</div>
            </div>
          </div>
        </div>
        
        <!-- Upcoming events -->
        <div class="list-section">
          <h2 class="section-title">Upcoming Events</h2>
          <div class="card">
            <ul class="events-list">
              <li class="event-item">
                <div class="event-date">Oct 13</div>
                <div class="event-content">
                  <div class="event-title">School Sports Day</div>
                  <div class="event-time">All day</div>
                </div>
              </li>
              <li class="event-item">
                <div class="event-date">Oct 16</div>
                <div class="event-content">
                  <div class="event-title">Science Fair</div>
                  <div class="event-time">1:00 PM - 4:00 PM</div>
                </div>
              </li>
              <li class="event-item">
                <div class="event-date">Oct 28</div>
                <div class="event-content">
                  <div class="event-title">Parent-Teacher Conference</div>
                  <div class="event-time">4:00 PM - 7:00 PM</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      `;
      
    case 'classes':
    case 'timetable':
    case 'reports':
    case 'attendance':
    default:
      return `
        <div class="card welcome-card">
          <div class="card-content">
            <h2 class="card-title">Welcome to ${section.charAt(0).toUpperCase() + section.slice(1)}</h2>
            <p class="card-text">This section is under development. Check back soon!</p>
          </div>
        </div>
        
        <!-- Placeholder content -->
        <div class="grid-section">
          <h2 class="section-title">Coming Soon</h2>
          <div class="placeholder-message">
            <img src="Assets/${section}-icon.svg" alt="${section}" class="placeholder-icon">
            <h3>This feature is coming soon</h3>
            <p>We're working hard to bring you the best ${section} experience.</p>
          </div>
        </div>
      `;
  }
}

/**
 * Initialize components in newly loaded sections
 * @param {string} section - Section identifier
 */
function initializeSectionComponents(section) {
  // Attach click handlers to quick cards
  document.querySelectorAll('.quick-card').forEach(card => {
    card.addEventListener('click', function() {
      this.classList.add('clicked');
      setTimeout(() => {
        this.classList.remove('clicked');
      }, 300);
    });
  });
  
  // Update any account data
  if (section === 'account') {
    const nameElement = document.getElementById('account-name');
    const schoolElement = document.getElementById('account-school');
    
    const userDisplayName = document.getElementById('user-display-name');
    const userSchool = document.getElementById('user-school');
    
    if (nameElement && userDisplayName) {
      nameElement.textContent = userDisplayName.textContent;
    }
    
    if (schoolElement && userSchool) {
      schoolElement.textContent = userSchool.textContent;
    }
    
    // Add event listeners to theme preference buttons
    document.querySelectorAll('.preference-btn').forEach((btn, index) => {
      btn.addEventListener('click', function() {
        // Apply theme based on button index
        const theme = index === 0 ? 'dark' : index === 1 ? 'light' : 'system';
        applyTheme(theme);
      });
    });
    
    // Add save search filter toggle
    setupSearchFilterPreference();
  }
}

/**
 * Setup search filter preference toggle
 */
function setupSearchFilterPreference() {
  // If the preference section exists
  const prefSection = document.querySelector('.preference-group:nth-child(2)');
  
  if (!prefSection) return;
  
  // Create search filter preference
  const searchFilterToggle = document.createElement('div');
  searchFilterToggle.className = 'preference-toggle-item';
  searchFilterToggle.innerHTML = `
    <span>Save search filters</span>
    <label class="toggle">
      <input type="checkbox" id="save-search-filter">
      <span class="toggle-slider"></span>
    </label>
  `;
  
  // Append to preferences
  prefSection.querySelector('.preference-toggle-group').appendChild(searchFilterToggle);
  
  // Set current state from localStorage
  const saveSearchFilter = localStorage.getItem('saveSearchFilter') === 'true';
  document.getElementById('save-search-filter').checked = saveSearchFilter;
  
  // Add event listener
  document.getElementById('save-search-filter').addEventListener('change', function() {
    localStorage.setItem('saveSearchFilter', this.checked);
    
    // Clear saved search if disabling
    if (!this.checked) {
      localStorage.removeItem('lastSearch');
    }
  });
}

/**
 * Sets up collapsible sections
 */
function setupCollapsibleSections() {
  const sectionHeadings = document.querySelectorAll('.nav-heading-container');
  
  sectionHeadings.forEach(heading => {
    heading.addEventListener('click', () => {
      const section = heading.closest('.nav-section');
      section.classList.toggle('collapsed');
      
      // Save section state to localStorage for persistence
      const sectionName = heading.dataset.section;
      if (sectionName) {
        const collapsedSections = JSON.parse(localStorage.getItem('collapsedSections') || '{}');
        collapsedSections[sectionName] = section.classList.contains('collapsed');
        localStorage.setItem('collapsedSections', JSON.stringify(collapsedSections));
      }
    });
  });
  
  // Restore collapsed state from localStorage
  const collapsedSections = JSON.parse(localStorage.getItem('collapsedSections') || '{}');
  for (const [sectionName, isCollapsed] of Object.entries(collapsedSections)) {
    const section = document.querySelector(`.nav-heading-container[data-section="${sectionName}"]`)?.closest('.nav-section');
    if (section && isCollapsed) {
      section.classList.add('collapsed');
    }
  }
}

/**
 * Simulates loading content for different sections
 * @param {string} section - Section identifier
 * @param {Set} loadedContent - Set of already loaded content sections
 */
function simulateContentLoading(section, loadedContent) {
  const contentWrapper = document.querySelector('.content-wrapper');
  
  // Add loading state
  contentWrapper.classList.add('loading');
  
  // Simulate network request
  setTimeout(() => {
    // Check if content already loaded (for performance optimization)
    if (loadedContent.has(section)) {
      // Content already cached, just show it immediately
      contentWrapper.classList.remove('loading');
      return;
    }
    
    // For demo purposes, just update the welcome card title
    const cardTitle = document.querySelector('.card-title');
    if (cardTitle) {
      cardTitle.textContent = `Welcome to ${section.charAt(0).toUpperCase() + section.slice(1)}`;
    }
    
    // Mark as loaded
    loadedContent.add(section);
    
    // Remove loading state
    contentWrapper.classList.remove('loading');
  }, 100); // Fast loading for demo
}

/**
 * Check if icons are loading properly
 */
function checkIcons() {
  const icons = document.querySelectorAll('img[src^="Assets/"]');
  const iconErrorCount = { count: 0 };
  
  icons.forEach(icon => {
    // Add error handler to detect if icons fail to load
    icon.addEventListener('error', () => {
      iconErrorCount.count++;
      
      // Check if there are multiple icon loading errors
      if (iconErrorCount.count > 2 && !localStorage.getItem('iconErrorLogged')) {
        console.warn('Multiple icons failed to load. Check that icon files exist in the Assets folder.');
        localStorage.setItem('iconErrorLogged', true);
        
        // Replace broken icon with a text placeholder
        icon.style.display = 'none';
        const iconText = document.createElement('span');
        iconText.textContent = icon.alt ? icon.alt.charAt(0) : 'I';
        iconText.style.fontWeight = '600';
        iconText.style.opacity = '0.8';
        icon.parentNode.appendChild(iconText);
      }
    });
    
    // Add a handler to confirm successful loading
    icon.addEventListener('load', () => {
      // Reset cached error state if icons start loading
      if (localStorage.getItem('iconErrorLogged')) {
        localStorage.removeItem('iconErrorLogged');
      }
    });
  });
}

/**
 * Initializes performance optimizations
 */
function initPerformanceOptimizations() {
  // Prefetch resources
  prefetchResources();
  
  // Set up intersection observer for lazy loading
  setupLazyLoading();
  
  // Add event delegation for improved event handling
  setupEventDelegation();
  
  // Fix quick card click issues
  fixQuickCardClicks();
}

/**
 * Fix click issues on quick cards
 */
function fixQuickCardClicks() {
  // Direct click handlers for quick cards
  document.querySelectorAll('.quick-card').forEach(card => {
    // Remove any existing click handler issues
    card.style.pointerEvents = 'auto';
    
    // Add a clean click handler
    card.addEventListener('click', function(e) {
      // Visual feedback
      this.classList.add('clicked');
      setTimeout(() => {
        this.classList.remove('clicked');
      }, 300);
      
      // Get card title for action
      const cardTitle = this.querySelector('.quick-card-title')?.textContent;
      console.log(`Quick access: ${cardTitle}`);
      
      // Simple demo action based on card title
      if (cardTitle) {
        if (cardTitle.includes('Today')) {
          alert('Today\'s classes would be displayed here');
        } else if (cardTitle.includes('Assignment')) {
          alert('Assignments would be displayed here');
        } else if (cardTitle.includes('Notification')) {
          alert('Notifications would be displayed here');
        } else if (cardTitle.includes('Resources')) {
          alert('Resources would be displayed here');
        }
      }
    });
  });
}

/**
 * Prefetch resources that might be needed soon
 */
function prefetchResources() {
  // Function to create prefetch link
  const prefetch = (url) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };
  
  // Icons that might be needed (actual icons would be defined in production)
  const commonIcons = [
    'home-icon.svg',
    'account-icon.svg',
    'notices-icon.svg',
    'calendar-icon.svg',
    'classes-icon.svg',
    'timetable-icon.svg',
    'reports-icon.svg',
    'attendance-icon.svg',
    'refresh-icon.svg',
    'settings.svg',
    'angle-down.svg',
    'cross.svg',
    'preferences-icon.svg',
    'triangle-warning.svg'
  ];
  
  // Only prefetch icons that haven't been loaded yet
  commonIcons.forEach(icon => {
    if (!document.querySelector(`img[src="Assets/${icon}"]`)) {
      prefetch(`Assets/${icon}`);
    }
  });
}

/**
 * Sets up lazy loading for images and other resources
 */
function setupLazyLoading() {
  // Check if Intersection Observer is supported
  if ('IntersectionObserver' in window) {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          
          // If it's an image with data-src
          if (element.tagName === 'IMG' && element.dataset.src) {
            element.src = element.dataset.src;
            element.removeAttribute('data-src');
          }
          
          // Stop observing this element
          observer.unobserve(element);
        }
      });
    }, options);
    
    // Observe all elements with the 'lazy-load' class
    document.querySelectorAll('.lazy-load').forEach(el => {
      observer.observe(el);
    });
  } else {
    // Fallback for browsers without IntersectionObserver
    document.querySelectorAll('.lazy-load').forEach(el => {
      if (el.tagName === 'IMG' && el.dataset.src) {
        el.src = el.dataset.src;
      }
    });
  }
}

/**
 * Sets up event delegation for improved performance
 */
function setupEventDelegation() {
  // Example: Delegate quick card clicks
  const cardGrid = document.querySelector('.card-grid');
  
  if (cardGrid) {
    cardGrid.addEventListener('click', e => {
      const quickCard = e.target.closest('.quick-card');
      
      if (quickCard) {
        // Handle quick card click
        const cardTitle = quickCard.querySelector('.quick-card-title').textContent;
        console.log(`Quick card clicked: ${cardTitle}`);
        
        // Add a visual feedback animation
        quickCard.classList.add('clicked');
        setTimeout(() => {
          quickCard.classList.remove('clicked');
        }, 300);
      }
    });
  }
  
  // Prevent all animations if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('reduce-motion');
  }
}

/**
 * Setup user dropdown menu
 */
function setupUserDropdown() {
  const userProfile = document.getElementById('user-profile');
  const userDropdown = document.getElementById('user-dropdown');
  const preferencesOption = document.getElementById('preferences-option');
  const logoutOption = document.getElementById('logout-option');
  
  if (!userProfile || !userDropdown) {
    console.error('User profile or dropdown elements not found');
    return;
  }
  
  // Toggle dropdown on user profile click
  userProfile.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing the dropdown
    userDropdown.classList.toggle('active');
    
    // Ensure dropdown is positioned correctly
    positionUserDropdown();
  });
  
  // Function to position the dropdown
  function positionUserDropdown() {
    // No need for complex positioning with new layout
    userDropdown.style.visibility = '';
    userDropdown.style.display = '';
  }
  
  // Handle preferences option click
  if (preferencesOption) {
    preferencesOption.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event from bubbling to document
      userDropdown.classList.remove('active');
      // Navigate to preferences/account page
      navigateTo('account');
    });
  }
  
  // Handle logout option click
  if (logoutOption) {
    logoutOption.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event from bubbling to document
      userDropdown.classList.remove('active');
      showLogoutConfirmation();
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (userDropdown.classList.contains('active') && 
        !userProfile.contains(e.target) && 
        !userDropdown.contains(e.target)) {
      userDropdown.classList.remove('active');
    }
  });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Check if it's CMD+K (Mac) or Ctrl+K (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault(); // Prevent browser's default action
      toggleSearchModal();
    }
    
    // Navigate home with CMD/Ctrl+H
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault();
      navigateTo('home');
    }
    
    // Refresh with CMD/Ctrl+R (if not in an input field)
    if ((e.metaKey || e.ctrlKey) && e.key === 'r' && 
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) {
        refreshBtn.click();
      }
    }
    
    // Toggle notifications with CMD/Ctrl+N
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && 
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const notificationsModal = document.getElementById('notifications-modal');
      const notificationsBtn = document.getElementById('notifications-btn');
      
      if (notificationsModal.classList.contains('active')) {
        closeNotificationsModal();
      } else if (notificationsBtn) {
        notificationsBtn.click();
      }
    }
    
    // Escape key to close modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

/**
 * Setup notifications modal functionality
 */
function setupNotificationsModal() {
  // Use the high-performance notification center implementation
  // This is a complete rewrite focused on performance optimization
  initHighPerfNotificationCenter();
}

/**
 * Setup notification search functionality
 */
function setupNotificationSearch() {
  const searchInput = document.querySelector('.notifications-list-header .list-search input');
  if (!searchInput) return;
  
  // Clear any previous search
  searchInput.value = '';
  
  // Add input event listener
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    searchNotifications(searchTerm);
  });
  
  // Fix alignment issues
  searchInput.style.paddingTop = '8px';
  searchInput.style.paddingBottom = '8px';
}

/**
 * Search through notifications by title and content
 * @param {string} searchTerm - The search term
 */
function searchNotifications(searchTerm) {
  const notificationItems = document.querySelectorAll('.notification-item');
  const emptyStateTemplate = document.getElementById('empty-state-template');
  let visibleCount = 0;
  
  // Remove any existing empty state
  const existingEmptyState = document.querySelector('.notifications-list-content .empty-state');
  if (existingEmptyState) {
    existingEmptyState.remove();
  }
  
  // Show all date sections by default
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    section.style.display = 'block';
  });
  
  if (!searchTerm) {
    // If search is empty, show all notifications and restore category filter
    const activeCategory = document.querySelector('.category-item.active');
    if (activeCategory) {
      filterNotificationsByCategory(activeCategory.dataset.category);
    } else {
      notificationItems.forEach(item => {
        item.style.display = 'flex';
        visibleCount++;
      });
    }
    return;
  }
  
  // Search through notifications
  notificationItems.forEach(item => {
    const title = item.querySelector('.notification-title').textContent.toLowerCase();
    const preview = item.querySelector('.notification-preview').textContent.toLowerCase();
    
    // Also search in detailed content from our notificationId-content mapping
    const notificationId = item.getAttribute('data-id');
    let detailContent = '';
    
    // Get the associated content for this notification
    switch (notificationId) {
      case 'notif-1':
        detailContent = 'scheduled maintenance system unavailable save work complete assignments';
        break;
      case 'notif-2':
        detailContent = 'math algebra quadratic equations due homework assignment problems chapter textbook';
        break;
      case 'notif-3':
        detailContent = 'school assembly rescheduled thursday friday main hall mandatory student council';
        break;
      case 'notif-4':
        detailContent = 'english essay graded great gatsby symbolism literary techniques';
        break;
      case 'notif-5':
        detailContent = 'password change reminder expire security account settings';
        break;
      case 'notif-6':
        detailContent = 'final exam schedule december mathematics english science history foreign language';
        break;
      case 'notif-7':
        detailContent = 'chemistry lab report titration experiment deadline submission requirements';
        break;
      case 'notif-8':
        detailContent = 'library book due kill mockingbird harper lee return renew';
        break;
      case 'notif-10':
        detailContent = 'science project deadline extended fair submission november';
        break;
      case 'notif-11':
        detailContent = 'parent teacher conference november meeting appointment schedule book';
        break;
      default:
        detailContent = '';
    }
    
    if (title.includes(searchTerm) || 
        preview.includes(searchTerm) || 
        detailContent.includes(searchTerm)) {
      item.style.display = 'flex';
      visibleCount++;
    } else {
      item.style.display = 'none';
    }
  });
  
  // Hide empty date sections
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    const visibleItems = Array.from(section.querySelectorAll('.notification-item')).filter(
      item => item.style.display === 'flex'
    );
    if (visibleItems.length === 0) {
      section.style.display = 'none';
    }
  });
  
  // Show empty state if no notifications visible
  if (visibleCount === 0) {
    showEmptySearchState(searchTerm);
  }
  
  // Update selected notification if the currently selected one is hidden
  const selectedNotification = document.querySelector('.notification-item.selected');
  if (selectedNotification && selectedNotification.style.display === 'none') {
    // Select the first visible notification instead
    const firstVisible = document.querySelector('.notification-item[style="display: flex;"]');
    
    // Clear existing selection
    document.querySelectorAll('.notification-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    if (firstVisible) {
      firstVisible.classList.add('selected');
      updateNotificationDetails(firstVisible);
    } else {
      // No visible notifications, show empty detail panel
      const noNotificationSelected = document.querySelector('.no-notification-selected');
      const notificationDetail = document.querySelector('.notification-detail');
      
      if (noNotificationSelected) {
        noNotificationSelected.style.display = 'flex';
      }
      
      if (notificationDetail) {
        notificationDetail.style.display = 'none';
      }
    }
  }
}

/**
 * Show empty search state
 * @param {string} searchTerm - The search term that yielded no results
 */
function showEmptySearchState(searchTerm) {
  const emptyStateTemplate = document.getElementById('empty-state-template');
  if (!emptyStateTemplate) return;
  
  const emptyState = document.importNode(emptyStateTemplate.content, true);
  const listContent = document.querySelector('.notifications-list-content');
  
  // Update empty state text
  const title = emptyState.querySelector('.empty-state-title');
  const text = emptyState.querySelector('.empty-state-text');
  const icon = emptyState.querySelector('.empty-state-icon');
  
  if (title && text && icon) {
    icon.src = 'Assets/search.svg';
    title.textContent = 'No matching notifications';
    text.textContent = `No notifications found matching "${searchTerm}"`;
  }
  
  if (listContent) {
    listContent.appendChild(emptyState);
  }
  
  // Show empty detail panel
  showEmptyDetailPanel();
}

/**
 * Show empty detail panel
 */
function showEmptyDetailPanel() {
  const noNotificationSelected = document.querySelector('.no-notification-selected');
  const notificationDetail = document.querySelector('.notification-detail');
  
  if (noNotificationSelected) {
    noNotificationSelected.style.display = 'flex';
  }
  
  if (notificationDetail) {
    notificationDetail.style.display = 'none';
  }
}

/**
 * Setup notification item selection
 */
function setupNotificationItemSelection() {
  const notificationItems = document.querySelectorAll('.notification-item');
  
  notificationItems.forEach(item => {
    // Add priority indicators if they don't exist
    const statusContainer = item.querySelector('.notification-status');
    if (statusContainer && !item.querySelector('.priority-indicator')) {
      // Determine priority - For demo, assign randomly
      const priorities = ['high', 'medium', 'low'];
      const randomPriority = priorities[Math.floor(Math.random() * priorities.length)];
      
      const priorityIndicator = document.createElement('div');
      priorityIndicator.className = `priority-indicator ${randomPriority}`;
      statusContainer.appendChild(priorityIndicator);
    }
    
    item.addEventListener('click', (e) => {
      // Ignore if clicking on an action button
      if (e.target.closest('.notification-actions')) {
        return;
      }
      
      // Update selected state
      notificationItems.forEach(notif => notif.classList.remove('selected'));
      item.classList.add('selected');
      
      // In a real app, we would fetch and display the notification details
      // For demo, we'll just update the notification detail panel with the selected notification info
      updateNotificationDetails(item);
      
      // For mobile view, show the detail panel
      const detailPanel = document.querySelector('.notifications-detail-panel');
      if (detailPanel && window.innerWidth <= 992) {
        detailPanel.classList.add('active');
      }
    });
  });
}

/**
 * Update notification selection on page load
 */
function updateNotificationSelection() {
  const firstNotification = document.querySelector('.notification-item');
  if (firstNotification) {
    firstNotification.classList.add('selected');
    updateNotificationDetails(firstNotification);
  } else {
    // Show empty state
    const noNotificationSelected = document.querySelector('.no-notification-selected');
    if (noNotificationSelected) {
      noNotificationSelected.style.display = 'flex';
    }
    
    // Hide notification detail
    const notificationDetail = document.querySelector('.notification-detail');
    if (notificationDetail) {
      notificationDetail.style.display = 'none';
    }
  }
}

/**
 * Update notification details panel based on selected notification
 * @param {HTMLElement} notification - The selected notification element
 */
function updateNotificationDetails(notification) {
  const detailTitle = document.querySelector('.detail-title');
  const detailTime = document.querySelector('.detail-time');
  const detailPriority = document.querySelector('.detail-priority');
  const detailContent = document.querySelector('.detail-content');
  
  if (!detailTitle || !detailTime || !detailPriority || !detailContent) return;
  
  // Get notification data
  const title = notification.querySelector('.notification-title').textContent;
  const time = notification.querySelector('.notification-time').textContent;
  const notificationId = notification.getAttribute('data-id');
  
  // Update detail view
  detailTitle.textContent = title;
  
  // Format the time based on the time text
  if (time.includes('AM') || time.includes('PM')) {
    detailTime.textContent = `Today, ${time}`;
  } else {
    detailTime.textContent = time;
  }
  
  // Update priority class based on the notification's priority indicator
  const priorityIndicator = notification.querySelector('.priority-indicator');
  if (priorityIndicator) {
    detailPriority.className = 'detail-priority';
    
    if (priorityIndicator.classList.contains('high')) {
      detailPriority.classList.add('high');
      detailPriority.textContent = 'High Priority';
    } else if (priorityIndicator.classList.contains('medium')) {
      detailPriority.classList.add('medium');
      detailPriority.textContent = 'Medium Priority';
    } else {
      detailPriority.classList.add('low');
      detailPriority.textContent = 'Low Priority';
    }
  } else {
    // Default to low priority if not specified
    detailPriority.className = 'detail-priority low';
    detailPriority.textContent = 'Low Priority';
  }
  
  // Load specific content based on notification ID
  let content = '';
  switch (notificationId) {
    case 'notif-1': // System Maintenance Alert
      content = `
        <p>Dear Student,</p>
        <p>The Millennium portal will be undergoing <strong>scheduled maintenance</strong> this weekend from:</p>
        <p><strong>Friday, October 27th at 8:00 PM</strong> until <strong>Saturday, October 28th at 6:00 AM</strong></p>
        <p>During this time, the system will be unavailable. Please ensure you save any work and complete any pending assignments before the maintenance begins.</p>
        <p>Key points to note:</p>
        <ul>
          <li>All deadlines that fall during the maintenance window have been automatically extended by 24 hours</li>
          <li>Any assignments submitted in the 2 hours before maintenance will be backed up automatically</li>
          <li>Your account data and work will not be affected by this maintenance</li>
        </ul>
        <p>We apologize for any inconvenience this may cause and appreciate your understanding as we work to improve system performance.</p>
        <p>If you have any urgent matters during this time, please contact your teacher directly.</p>
        <p>Thank you,<br>Millennium IT Support Team</p>
      `;
      break;
      
    case 'notif-2': // New Math Assignment
      content = `
        <p>Your Mathematics teacher has posted a new assignment.</p>
        <p><strong>Assignment Details:</strong></p>
        <ul>
          <li><strong>Subject:</strong> Algebra II</li>
          <li><strong>Topic:</strong> Quadratic Equations</li>
          <li><strong>Due Date:</strong> Monday, October 30th</li>
          <li><strong>Submission Format:</strong> Online submission through the Assignments portal</li>
        </ul>
        <p><strong>Requirements:</strong></p>
        <p>Complete problems 15-30 in Chapter 4 of your textbook. Show all work and steps clearly.</p>
        <p><strong>Additional Resources:</strong></p>
        <ul>
          <li>Video tutorial on solving quadratics by factoring</li>
          <li>Practice worksheet (optional but recommended)</li>
          <li>Virtual office hours: Friday 3-4 PM</li>
        </ul>
        <p>Remember to check the rubric for grading criteria before submitting your work.</p>
      `;
      break;
      
    case 'notif-3': // School Assembly Rescheduled
      content = `
        <p>Important Notice to All Students:</p>
        <p>The school assembly originally scheduled for Friday has been <strong>rescheduled</strong> to <strong>Thursday at 10:00 AM</strong> in the main hall due to facility scheduling conflicts.</p>
        <p><strong>Assembly Details:</strong></p>
        <ul>
          <li><strong>Date:</strong> Thursday, October 26th</li>
          <li><strong>Time:</strong> 10:00 AM - 11:15 AM</li>
          <li><strong>Location:</strong> Main Hall</li>
          <li><strong>Attendance:</strong> Mandatory for all students</li>
        </ul>
        <p><strong>Agenda:</strong></p>
        <ul>
          <li>Principal's Address</li>
          <li>Student Council Announcements</li>
          <li>Sports Team Recognition</li>
          <li>Upcoming Events Overview</li>
        </ul>
        <p>Classes that would normally occur during this time will be rescheduled. Your teachers will provide updated information about any affected class periods.</p>
        <p>Please arrive promptly and in proper school uniform.</p>
      `;
      break;
      
    case 'notif-4': // English Essay Graded
      content = `
        <p>Your English Literature essay has been graded.</p>
        <p><strong>Assignment Details:</strong></p>
        <ul>
          <li><strong>Assignment:</strong> Critical Analysis Essay</li>
          <li><strong>Topic:</strong> Symbolism in "The Great Gatsby"</li>
          <li><strong>Grade:</strong> A- (91/100)</li>
        </ul>
        <p><strong>Teacher Comments:</strong></p>
        <p>"Excellent analysis of the symbolic elements in the novel. Your interpretation of the green light and its connection to Gatsby's character development was particularly insightful. Your writing demonstrates strong critical thinking and a solid grasp of literary techniques."</p>
        <p><strong>Areas of Strength:</strong></p>
        <ul>
          <li>Insightful thesis statement</li>
          <li>Well-structured paragraphs</li>
          <li>Effective use of textual evidence</li>
          <li>Clear and engaging writing style</li>
        </ul>
        <p><strong>Areas for Improvement:</strong></p>
        <ul>
          <li>Some minor grammatical errors in the conclusion</li>
          <li>Consider exploring counter-arguments to strengthen your position</li>
        </ul>
        <p>You can view the full grading rubric and detailed feedback in your assignments portal.</p>
      `;
      break;
      
    case 'notif-5': // Password Change Reminder
      content = `
        <p>Dear Student,</p>
        <p>This is a reminder that your Millennium portal password will expire in <strong>15 days</strong>.</p>
        <p>For security reasons, all users are required to update their passwords every 180 days. Please take a moment to set a new password before it expires to avoid any disruption to your account access.</p>
        <p><strong>To update your password:</strong></p>
        <ol>
          <li>Go to Account Settings in the sidebar</li>
          <li>Select the "Security" tab</li>
          <li>Click "Change Password"</li>
          <li>Follow the prompts to create and confirm your new password</li>
        </ol>
        <p><strong>Password Requirements:</strong></p>
        <ul>
          <li>At least 8 characters long</li>
          <li>Include at least one uppercase letter</li>
          <li>Include at least one number</li>
          <li>Include at least one special character (e.g., !, @, #, $)</li>
          <li>Must not be the same as your previous 3 passwords</li>
        </ul>
        <p>If you need assistance, please contact the IT Support Desk.</p>
      `;
      break;
      
    // Add more cases for other notifications
    case 'notif-6': // Final Exam Schedule Posted
      content = `
        <p>The Fall semester final exam schedule is now available.</p>
        <p><strong>Exam Schedule:</strong></p>
        <ul>
          <li><strong>Mathematics:</strong> Tuesday, December 12th, 9:00 AM - 11:00 AM, Room M105</li>
          <li><strong>English:</strong> Thursday, December 14th, 9:00 AM - 11:00 AM, Room E301</li>
          <li><strong>Science:</strong> Friday, December 15th, 1:00 PM - 3:00 PM, Room S204</li>
          <li><strong>History:</strong> Monday, December 18th, 9:00 AM - 11:00 AM, Room H102</li>
          <li><strong>Foreign Language:</strong> Tuesday, December 19th, 1:00 PM - 3:00 PM, Room F203</li>
        </ul>
        <p><strong>Important Reminders:</strong></p>
        <ul>
          <li>Arrive at least 15 minutes before your exam time</li>
          <li>Bring your student ID</li>
          <li>Only approved calculators are permitted for math and science exams</li>
          <li>No electronic devices allowed during exams</li>
          <li>Review the full exam policy in the student handbook</li>
        </ul>
        <p>Study guides will be available from your teachers by November 15th.</p>
        <p>If you have any schedule conflicts, please contact the academic office immediately to discuss potential accommodations.</p>
      `;
      break;
      
    case 'notif-7': // Chemistry Lab Report Due
      content = `
        <p>This is a reminder about your upcoming Chemistry lab report deadline.</p>
        <p><strong>Assignment Details:</strong></p>
        <ul>
          <li><strong>Subject:</strong> Chemistry</li>
          <li><strong>Assignment:</strong> Lab Report - Acid-Base Titration</li>
          <li><strong>Due Date:</strong> Friday, October 27th at 11:59 PM</li>
          <li><strong>Submission:</strong> Online via the Chemistry class portal</li>
        </ul>
        <p><strong>Report Requirements:</strong></p>
        <ol>
          <li>Title page</li>
          <li>Abstract (150-200 words)</li>
          <li>Introduction with hypothesis</li>
          <li>Materials and methods</li>
          <li>Results with data tables and graphs</li>
          <li>Discussion and error analysis</li>
          <li>Conclusion</li>
          <li>References (APA format)</li>
        </ol>
        <p>Your lab report should follow the scientific format discussed in class and include all calculations, properly labeled graphs, and error analysis.</p>
        <p>The lab manual and example reports can be found in the Resources section of your Chemistry class page.</p>
      `;
      break;
      
    case 'notif-8': // Library Book Due Soon
      content = `
        <p>Library Notice:</p>
        <p>The following item is due soon:</p>
        <p><strong>Title:</strong> To Kill a Mockingbird<br>
        <strong>Author:</strong> Harper Lee<br>
        <strong>Call Number:</strong> F LEE<br>
        <strong>Due Date:</strong> Sunday, October 29th</p>
        <p>Please return this item to the library by the due date to avoid late fees. Current late fees are $0.25 per day for regular circulation items.</p>
        <p><strong>Renewal Options:</strong></p>
        <ul>
          <li>Renew online through your library account</li>
          <li>Call the library at extension 4321</li>
          <li>Visit the library circulation desk</li>
        </ul>
        <p>Items can be renewed up to 2 times if there are no holds. This item currently has no holds and is eligible for renewal.</p>
        <p>Library Hours:<br>
        Monday-Thursday: 7:30 AM - 5:00 PM<br>
        Friday: 7:30 AM - 4:00 PM<br>
        Sunday: 2:00 PM - 5:00 PM (Study Hall only)</p>
      `;
      break;
      
    case 'notif-10': // Science Project Deadline Extended
      content = `
        <p>Good news for Science Fair participants!</p>
        <p>The Science Department has extended the submission deadline for science fair projects.</p>
        <p><strong>Updated Information:</strong></p>
        <ul>
          <li><strong>New Deadline:</strong> Wednesday, November 15th by 4:00 PM</li>
          <li><strong>Original Deadline:</strong> Friday, November 3rd</li>
          <li><strong>Submission Location:</strong> Science Department Office (Room S101) or online through the Science Fair portal</li>
        </ul>
        <p><strong>Reason for Extension:</strong></p>
        <p>This extension is being provided due to the delayed arrival of specialized equipment needed for several project categories and to accommodate the recent field trip schedule conflicts.</p>
        <p><strong>Additional Support:</strong></p>
        <ul>
          <li>Science Lab will have extended hours (3:00-5:00 PM) on Tuesdays and Thursdays until the deadline</li>
          <li>Teacher mentors will be available for additional consultation during these extended hours</li>
          <li>A supplementary workshop on "Data Visualization for Science Projects" will be held on November 7th at lunch in Room S204</li>
        </ul>
        <p>All other science fair requirements and judging criteria remain unchanged. Please see the Science Fair Guidelines document for complete details.</p>
      `;
      break;
      
    case 'notif-11': // Parent-Teacher Conference
      content = `
        <p><strong>Parent-Teacher Conference Information</strong></p>
        <p>Our fall Parent-Teacher Conferences are scheduled for Friday, November 3rd from 3:00 PM to 7:00 PM.</p>
        <p>These conferences provide an important opportunity for parents and teachers to discuss student progress, strengths, areas for growth, and strategies for academic success.</p>
        <p><strong>Conference Details:</strong></p>
        <ul>
          <li><strong>Date:</strong> Friday, November 3rd</li>
          <li><strong>Time:</strong> 3:00 PM - 7:00 PM</li>
          <li><strong>Location:</strong> Individual teacher classrooms</li>
          <li><strong>Format:</strong> 10-minute individual conferences</li>
        </ul>
        <p><strong>Scheduling:</strong></p>
        <p>Parents can book conference slots online through the Parent Portal. The scheduling system will open on October 25th at 8:00 AM and close on November 2nd at 12:00 PM.</p>
        <p>Please note that time slots are limited and fill up quickly. We recommend booking as soon as the system opens.</p>
        <p><strong>Preparation:</strong></p>
        <p>To make the most of the brief conference time:</p>
        <ul>
          <li>Review your current grades and assignments before the conference</li>
          <li>Prepare specific questions for your teachers</li>
          <li>Consider attending with your parents if possible</li>
        </ul>
        <p>If your parents cannot attend in person, virtual conference options are available upon request.</p>
      `;
      break;
      
    default:
      content = `<p>Select a notification to view its details.</p>`;
  }
  
  // Update the detail content
  detailContent.innerHTML = content;
  
  // Show the notification detail and hide empty state
  const noNotificationSelected = document.querySelector('.no-notification-selected');
  const notificationDetail = document.querySelector('.notification-detail');
  
  if (noNotificationSelected) {
    noNotificationSelected.style.display = 'none';
  }
  
  if (notificationDetail) {
    notificationDetail.style.display = 'flex';
  }
  
  // Mark notification as read if it was unread
  if (notification.classList.contains('unread')) {
    markNotificationAsRead(notification);
  }
}

/**
 * Mark a notification as read and update unread counts
 * @param {HTMLElement} notification - The notification element to mark as read
 */
function markNotificationAsRead(notification) {
  if (!notification.classList.contains('unread')) return;
  
  // Remove unread class
  notification.classList.remove('unread');
  
  // Remove unread indicator
  const unreadIndicator = notification.querySelector('.unread-indicator');
  if (unreadIndicator) {
    unreadIndicator.remove();
  }
  
  // Update action button
  updateNotificationItemButtons(notification, false);
  
  // Update unread counts in the sidebar
  updateUnreadCounts();
}

/**
 * Update unread notification counts in the sidebar
 */
function updateUnreadCounts() {
  // Count unread notifications
  const allUnread = document.querySelectorAll('.notification-item.unread');
  
  // Update inbox count
  const inboxCount = document.querySelector('.category-item[data-category="inbox"] .unread-count');
  if (inboxCount) {
    inboxCount.textContent = allUnread.length;
  }
  
  // Update pinned count
  const pinnedUnread = document.querySelectorAll('.notification-item.unread.pinned');
  const pinnedCount = document.querySelector('.category-item[data-category="pinned"] .unread-count');
  if (pinnedCount) {
    pinnedCount.textContent = pinnedUnread.length;
  }
  
  // Update alerts count (high priority)
  let alertsUnread = 0;
  allUnread.forEach(item => {
    const priorityIndicator = item.querySelector('.priority-indicator.high');
    if (priorityIndicator) {
      alertsUnread++;
    }
  });
  
  const alertsCount = document.querySelector('.category-item[data-category="alerts"] .unread-count');
  if (alertsCount) {
    alertsCount.textContent = alertsUnread;
  }
  
  // Update notification indicator in header
  const notificationsBtn = document.getElementById('notifications-btn');
  if (notificationsBtn) {
    if (allUnread.length > 0) {
      notificationsBtn.classList.add('has-notification');
    } else {
      notificationsBtn.classList.remove('has-notification');
    }
  }
}

/**
 * Setup notification action buttons
 */
function setupNotificationActions() {
  // Mark all as read button
  const markAllReadBtn = document.querySelector('#mark-all-read');
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', () => {
      const unreadItems = document.querySelectorAll('.notification-item.unread');
      unreadItems.forEach(item => {
        markNotificationAsRead(item);
      });
      
      // Update notification indicator
      updateUnreadCounts();
    });
  }
  
  // Individual notification action buttons
  document.addEventListener('click', (e) => {
    // Mark as read/unread button
    if (e.target.closest('.notif-action-btn[data-tooltip="Mark as read"]')) {
      const button = e.target.closest('.notif-action-btn');
      const notificationItem = button.closest('.notification-item');
      
      // Mark as read
      markNotificationAsRead(notificationItem);
      
      // Stop event propagation
      e.stopPropagation();
    }
    
    // Mark as unread button
    if (e.target.closest('.notif-action-btn[data-tooltip="Mark as unread"]')) {
      const button = e.target.closest('.notif-action-btn');
      const notificationItem = button.closest('.notification-item');
      
      // Mark as unread
      notificationItem.classList.add('unread');
      
      // Add unread indicator if not exists
      const statusContainer = notificationItem.querySelector('.notification-status');
      if (statusContainer && !notificationItem.querySelector('.unread-indicator')) {
        const unreadIndicator = document.createElement('div');
        unreadIndicator.className = 'unread-indicator';
        statusContainer.prepend(unreadIndicator);
      }
      
      // Update button
      updateNotificationItemButtons(notificationItem, true);
      
      // Update unread counts
      updateUnreadCounts();
      
      // Stop event propagation
      e.stopPropagation();
    }
    
    // Pin/unpin button
    if (e.target.closest('.notif-action-btn[data-tooltip="Pin notification"]') || 
        e.target.closest('.notif-action-btn[data-tooltip="Unpin notification"]')) {
      const button = e.target.closest('.notif-action-btn');
      const notificationItem = button.closest('.notification-item');
      
      // Toggle pinned class
      notificationItem.classList.toggle('pinned');
      
      // Add or remove pinned indicator
      const statusContainer = notificationItem.querySelector('.notification-status');
      const pinnedIndicator = notificationItem.querySelector('.pinned-indicator');
      
      if (notificationItem.classList.contains('pinned')) {
        // Add pinned indicator if not exists
        if (!pinnedIndicator && statusContainer) {
          const newPinnedIndicator = document.createElement('div');
          newPinnedIndicator.className = 'pinned-indicator';
          statusContainer.appendChild(newPinnedIndicator);
        }
        
        // Update tooltip
        button.setAttribute('data-tooltip', 'Unpin notification');
        
        // Update image to use pinned.svg
        const img = button.querySelector('img');
        if (img) {
          img.src = 'Assets/pinned.svg';
          img.alt = 'Unpin';
        }
      } else {
        // Remove pinned indicator
        if (pinnedIndicator) {
          pinnedIndicator.remove();
        }
        
        // Update tooltip
        button.setAttribute('data-tooltip', 'Pin notification');
        
        // Update image back to pin.svg
        const img = button.querySelector('img');
        if (img) {
          img.src = 'Assets/pin.svg';
          img.alt = 'Pin';
        }
      }
      
      // Stop event propagation
      e.stopPropagation();
    }
    
    // Detail action buttons
    if (e.target.closest('.detail-action-btn[data-tooltip="Archive"]')) {
      // Archive the selected notification
      const selectedNotification = document.querySelector('.notification-item.selected');
      if (selectedNotification) {
        // In a real app, we would move the notification to archive
        // For demo, just remove it from the list
        fadeOutAndRemove(selectedNotification);
      }
      e.stopPropagation();
    }
    
    if (e.target.closest('.detail-action-btn[data-tooltip="Delete"]')) {
      // Delete the selected notification
      const selectedNotification = document.querySelector('.notification-item.selected');
      if (selectedNotification) {
        // In a real app, we would move the notification to trash
        // For demo, just remove it from the list
        fadeOutAndRemove(selectedNotification);
      }
      e.stopPropagation();
    }
    
    if (e.target.closest('.detail-footer-btn.primary')) {
      // Mark as read from the detail panel
      const selectedNotification = document.querySelector('.notification-item.selected');
      if (selectedNotification) {
        // Mark as read
        markNotificationAsRead(selectedNotification);
      }
      e.stopPropagation();
    }
  });
}

/**
 * Update notification item buttons based on read/unread state
 * @param {HTMLElement} item - The notification item
 * @param {boolean} isUnread - Whether the notification is unread
 */
function updateNotificationItemButtons(item, isUnread) {
  const actionButton = item.querySelector('.notif-action-btn[data-tooltip="Mark as read"], .notif-action-btn[data-tooltip="Mark as unread"]');
  
  if (actionButton) {
    if (isUnread) {
      actionButton.setAttribute('data-tooltip', 'Mark as read');
      const img = actionButton.querySelector('img');
      if (img) {
        img.src = 'Assets/mark-read.svg';
        img.alt = 'Mark as read';
      }
    } else {
      actionButton.setAttribute('data-tooltip', 'Mark as unread');
      const img = actionButton.querySelector('img');
      if (img) {
        img.src = 'Assets/mark-unread.svg';
        img.alt = 'Mark as unread';
      }
    }
  }
}

/**
 * Update the notification indicator based on unread notifications
 */
function updateNotificationIndicator() {
  const unreadNotifications = document.querySelectorAll('.notification-item.unread');
  const notificationsBtn = document.getElementById('notifications-btn');
  
  if (notificationsBtn) {
    if (unreadNotifications.length > 0) {
      notificationsBtn.classList.add('has-notification');
    } else {
      notificationsBtn.classList.remove('has-notification');
    }
  }
}

/**
 * Fade out and remove a notification item
 * @param {HTMLElement} element - The element to fade out and remove
 */
function fadeOutAndRemove(element) {
  // Animate fade out
  element.style.transition = 'opacity 0.3s ease, height 0.3s ease, padding 0.3s ease';
  element.style.opacity = '0';
  element.style.height = '0';
  element.style.padding = '0';
  element.style.overflow = 'hidden';
  
  // After animation completes, remove the element
  setTimeout(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
    
    // Select another notification if available
    const firstNotification = document.querySelector('.notification-item');
    if (firstNotification) {
      firstNotification.classList.add('selected');
      updateNotificationDetails(firstNotification);
    } else {
      // Show empty state
      const noNotificationSelected = document.querySelector('.no-notification-selected');
      if (noNotificationSelected) {
        noNotificationSelected.style.display = 'flex';
      }
      
      // Hide notification detail
      const notificationDetail = document.querySelector('.notification-detail');
      if (notificationDetail) {
        notificationDetail.style.display = 'none';
      }
    }
  }, 300);
}

/**
 * Setup custom tooltips for better UX
 */
function setupCustomTooltips() {
  const tooltipTriggers = document.querySelectorAll('.tooltip-trigger');
  const tooltipContainer = document.getElementById('custom-tooltip');
  
  if (!tooltipContainer) {
    // Create tooltip container if it doesn't exist
    const newTooltip = document.createElement('div');
    newTooltip.id = 'custom-tooltip';
    newTooltip.className = 'custom-tooltip';
    newTooltip.innerHTML = `
      <div class="tooltip-content"></div>
      <div class="tooltip-arrow"></div>
    `;
    document.body.appendChild(newTooltip);
  }
  
  let tooltipTimeout = null;
  let activeTooltipTrigger = null;
  
  // Setup tooltip event listeners
  tooltipTriggers.forEach(trigger => {
    trigger.addEventListener('mouseenter', () => {
      clearTimeout(tooltipTimeout);
      activeTooltipTrigger = trigger;
      
      // Show tooltip after delay
      tooltipTimeout = setTimeout(() => {
        showTooltip(trigger);
      }, 500); // 0.5 second delay
    });
    
    trigger.addEventListener('mouseleave', (e) => {
      // Check if moving to the tooltip
      const tooltip = document.getElementById('custom-tooltip');
      if (tooltip && !isMouseMovingToTooltip(e, tooltip)) {
        clearTimeout(tooltipTimeout);
        hideTooltip();
      }
    });
  });
  
  // Make tooltip interactive
  document.addEventListener('mousemove', (e) => {
    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip || !tooltip.classList.contains('active')) return;
    
    // Check if mouse is over tooltip or trigger
    const isOverTooltip = e.target.closest('#custom-tooltip');
    const isOverTrigger = e.target.closest('.tooltip-trigger') === activeTooltipTrigger;
    
    if (!isOverTooltip && !isOverTrigger) {
      hideTooltip();
    }
  });
}

/**
 * Show a tooltip at the specified element
 * @param {HTMLElement} trigger - The element triggering the tooltip
 */
function showTooltip(trigger) {
  const tooltipText = trigger.getAttribute('data-tooltip');
  if (!tooltipText) return;
  
  const tooltip = document.getElementById('custom-tooltip');
  if (!tooltip) return;
  
  // Set tooltip content
  const tooltipContent = tooltip.querySelector('.tooltip-content');
  if (tooltipContent) {
    tooltipContent.textContent = tooltipText;
  }
  
  // Position the tooltip before showing for smoother animation
  positionTooltip(tooltip, trigger);
  
  // Make tooltip interactive
  tooltip.classList.add('interactive');
  
  // Show tooltip with animation - requestAnimationFrame for smoother animation
  requestAnimationFrame(() => {
    tooltip.classList.add('active');
  });
}

/**
 * Hide the active tooltip
 */
function hideTooltip() {
  const tooltip = document.getElementById('custom-tooltip');
  if (tooltip) {
    tooltip.classList.remove('active');
    tooltip.classList.remove('interactive');
  }
}

/**
 * Position the tooltip relative to its trigger
 * @param {HTMLElement} tooltip - The tooltip element
 * @param {HTMLElement} trigger - The triggering element
 */
function positionTooltip(tooltip, trigger) {
  // Get positions
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Calculate available space
  const spaceAbove = triggerRect.top;
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceLeft = triggerRect.left;
  const spaceRight = window.innerWidth - triggerRect.right;
  
  // Default position (bottom)
  let top, left;
  let position = 'bottom';
  
  // Determine best position
  if (spaceBelow >= tooltipRect.height + 10 || spaceBelow > spaceAbove) {
    // Position below
    top = triggerRect.bottom + 10;
    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    position = 'bottom';
  } else if (spaceAbove >= tooltipRect.height + 10) {
    // Position above
    top = triggerRect.top - tooltipRect.height - 10;
    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    position = 'top';
  } else if (spaceRight >= tooltipRect.width + 10) {
    // Position right
    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
    left = triggerRect.right + 10;
    position = 'right';
  } else {
    // Position left
    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
    left = triggerRect.left - tooltipRect.width - 10;
    position = 'left';
  }
  
  // Ensure tooltip stays within viewport
  top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));
  left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
  
  // Set position
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  
  // Set position attribute for arrow
  tooltip.setAttribute('data-position', position);
}

/**
 * Check if the mouse is moving from the trigger to the tooltip
 * @param {MouseEvent} e - The mouse event
 * @param {HTMLElement} tooltip - The tooltip element
 * @returns {boolean} - Whether the mouse is moving to the tooltip
 */
function isMouseMovingToTooltip(e, tooltip) {
  if (!tooltip || !tooltip.classList.contains('active')) return false;
  
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Define an area around the tooltip to consider "moving toward"
  const bufferSize = 10;
  const extendedRect = {
    left: tooltipRect.left - bufferSize,
    right: tooltipRect.right + bufferSize,
    top: tooltipRect.top - bufferSize,
    bottom: tooltipRect.bottom + bufferSize
  };
  
  // Check if mouse coordinates are within the extended tooltip area
  return (
    e.clientX >= extendedRect.left &&
    e.clientX <= extendedRect.right &&
    e.clientY >= extendedRect.top &&
    e.clientY <= extendedRect.bottom
  );
}

/**
 * Show the notifications modal
 */
function showNotificationsModal() {
  const notificationsModal = document.getElementById('notifications-modal');
  if (notificationsModal) {
    notificationsModal.classList.add('active');
  }
}

/**
 * Close the notifications modal
 */
function closeNotificationsModal() {
  const notificationsModal = document.getElementById('notifications-modal');
  if (notificationsModal) {
    notificationsModal.classList.remove('active');
    
    // On mobile, also hide the detail panel if it's active
    if (window.innerWidth <= 992) {
      const detailPanel = document.querySelector('.notifications-detail-panel.active');
      if (detailPanel) {
        detailPanel.classList.remove('active');
      }
    }
  }
}

/**
 * Close all modals
 */
function closeAllModals() {
  // Close search modal
  const searchModal = document.getElementById('search-modal');
  if (searchModal && searchModal.classList.contains('active')) {
    searchModal.classList.remove('active');
  }
  
  // Close notifications modal
  closeNotificationsModal();
  
  // Close logout confirmation modal
  const logoutModal = document.getElementById('logout-modal');
  if (logoutModal && logoutModal.classList.contains('active')) {
    logoutModal.classList.remove('active');
  }
  
  // Close welcome modal
  const welcomeModal = document.getElementById('welcome-modal');
  if (welcomeModal && welcomeModal.classList.contains('active')) {
    welcomeModal.classList.remove('active');
  }
  
  // Close user dropdown
  const userDropdown = document.getElementById('user-dropdown');
  if (userDropdown && userDropdown.classList.contains('active')) {
    userDropdown.classList.remove('active');
  }
}

/**
 * Toggle search modal
 */
function toggleSearchModal() {
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-modal-input');
  
  if (!searchModal) return;
  
  searchModal.classList.toggle('active');
  
  if (searchModal.classList.contains('active') && searchInput) {
    // Focus the input field when the modal is opened
    setTimeout(() => {
      searchInput.focus();
      
      // Get search filter preference
      const saveSearchFilter = localStorage.getItem('saveSearchFilter') === 'true';
      
      // If enabled, restore previous search
      if (saveSearchFilter && localStorage.getItem('lastSearch')) {
        searchInput.value = localStorage.getItem('lastSearch');
        handleSearchInput({ target: searchInput });
      }
    }, 100);
    
    // Populate search results
    populateSearchResults();
  }
}

/**
 * Populate search results
 */
function populateSearchResults() {
  const searchResults = document.getElementById('search-modal-results');
  
  if (!searchResults) return;
  
  // Clear previous results
  searchResults.innerHTML = '';
  
  // Comprehensive search results organized by category
  const allResults = [
    // Navigation
    { title: 'Home', description: 'Dashboard home page', icon: 'home-icon.svg', action: () => navigateTo('home'), category: 'Navigation' },
    { title: 'Account', description: 'Manage your account settings', icon: 'account-icon.svg', action: () => navigateTo('account'), category: 'Navigation' },
    { title: 'Notices', description: 'View all notices and announcements', icon: 'notices-icon.svg', action: () => navigateTo('notices'), category: 'Navigation' },
    { title: 'Calendar', description: 'View your calendar and events', icon: 'calendar-icon.svg', action: () => navigateTo('calendar'), category: 'Navigation' },
    
    // Register
    { title: 'Classes', description: 'View and manage your classes', icon: 'classes-icon.svg', action: () => navigateTo('classes'), category: 'Register' },
    { title: 'Timetable', description: 'View your weekly schedule', icon: 'timetable-icon.svg', action: () => navigateTo('timetable'), category: 'Register' },
    { title: 'Reports', description: 'View your academic reports', icon: 'reports-icon.svg', action: () => navigateTo('reports'), category: 'Register' },
    { title: 'Attendance', description: 'Check your attendance records', icon: 'attendance-icon.svg', action: () => navigateTo('attendance'), category: 'Register' },
    
    // Quick actions
    { title: 'Today\'s Classes', description: 'View your schedule for today', icon: 'today-icon.svg', action: () => alert('Today\'s classes would be shown here'), category: 'Quick Actions' },
    { title: 'Assignments', description: 'Check your pending assignments', icon: 'homework-icon.svg', action: () => alert('Assignments would be shown here'), category: 'Quick Actions' },
    { title: 'Notifications', description: 'View recent notifications', icon: 'notification-icon.svg', action: () => alert('Notifications would be shown here'), category: 'Quick Actions' },
    { title: 'Resources', description: 'Access learning materials', icon: 'resources-icon.svg', action: () => alert('Resources would be shown here'), category: 'Quick Actions' },
    
    // Settings
    { title: 'Preferences', description: 'Change your settings and preferences', icon: 'preferences-icon.svg', action: () => alert('Preferences would open here'), category: 'Settings' },
    { title: 'Log out', description: 'Sign out of your account', icon: 'cross.svg', action: () => showLogoutConfirmation(), category: 'Settings' }
  ];
  
  // Group results by category
  const groupedResults = {};
  allResults.forEach(result => {
    if (!groupedResults[result.category]) {
      groupedResults[result.category] = [];
    }
    groupedResults[result.category].push(result);
  });
  
  // Render results by category
  Object.keys(groupedResults).forEach(category => {
    // Create category header
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'search-category-header';
    categoryHeader.textContent = category;
    searchResults.appendChild(categoryHeader);
    
    // Add results for this category
    groupedResults[category].forEach(result => {
      const resultElement = document.createElement('div');
      resultElement.className = 'search-result';
      resultElement.innerHTML = `
        <div class="search-result-icon">
          <img src="Assets/${result.icon}" alt="${result.title}">
        </div>
        <div class="search-result-content">
          <div class="search-result-title">${result.title}</div>
          <div class="search-result-description">${result.description}</div>
        </div>
      `;
      
      // Add click handler
      resultElement.addEventListener('click', () => {
        // Close the modal
        document.getElementById('search-modal').classList.remove('active');
        
        // Execute the action
        result.action();
      });
      
      searchResults.appendChild(resultElement);
    });
  });
}

/**
 * Handle input for search filtering
 * @param {Event} e - Input event
 */
function handleSearchInput(e) {
  const query = e.target.value.toLowerCase();
  const results = document.querySelectorAll('.search-result');
  const categoryHeaders = document.querySelectorAll('.search-category-header');
  
  // Save search if preference enabled
  const saveSearchFilter = localStorage.getItem('saveSearchFilter') === 'true';
  if (saveSearchFilter) {
    localStorage.setItem('lastSearch', query);
  }
  
  // Reset all headers and results visibility
  categoryHeaders.forEach(header => {
    header.style.display = 'none';
  });
  
  let visibleCategories = new Set();
  
  // Filter results
  results.forEach(result => {
    const title = result.querySelector('.search-result-title').textContent.toLowerCase();
    const description = result.querySelector('.search-result-description').textContent.toLowerCase();
    
    if (title.includes(query) || description.includes(query)) {
      result.style.display = 'flex';
      
      // Find category header for this result
      let header = result.previousElementSibling;
      while (header && !header.classList.contains('search-category-header')) {
        header = header.previousElementSibling;
      }
      
      if (header) {
        visibleCategories.add(header);
      }
    } else {
      result.style.display = 'none';
    }
  });
  
  // Show headers for categories with visible results
  visibleCategories.forEach(header => {
    header.style.display = 'block';
  });
  
  // Update autofill suggestion
  updateAutofillSuggestion(query);
}

/**
 * Update autofill suggestion based on input
 * @param {string} input - Current input value
 */
function updateAutofillSuggestion(input) {
  const autofillElement = document.getElementById('autofill-suggestion');
  if (!autofillElement) return;
  
  // If input is empty, clear suggestion
  if (!input.trim()) {
    autofillElement.textContent = '';
    return;
  }
  
  // Get all available search options
  const allResults = document.querySelectorAll('.search-result');
  if (allResults.length === 0) return;
  
  // Get search history to rank by usage
  const searchHistory = JSON.parse(localStorage.getItem('searchUsageHistory') || '{}');
  
  // Filter visible results
  const visibleResults = Array.from(allResults).filter(
    el => el.style.display !== 'none'
  );
  
  if (visibleResults.length > 0) {
    // Sort by usage frequency
    visibleResults.sort((a, b) => {
      const titleA = a.querySelector('.search-result-title')?.textContent || '';
      const titleB = b.querySelector('.search-result-title')?.textContent || '';
      const usageA = searchHistory[titleA] || 0;
      const usageB = searchHistory[titleB] || 0;
      return usageB - usageA; // Sort by most used first
    });
    
    // Get the top result that starts with the current input
    const topResult = visibleResults.find(result => {
      const title = result.querySelector('.search-result-title')?.textContent || '';
      return title.toLowerCase().startsWith(input.toLowerCase()) && title.toLowerCase() !== input.toLowerCase();
    });
    
    // Set the suggestion
    if (topResult) {
      const suggestionText = topResult.querySelector('.search-result-title')?.textContent || '';
      
      // Only show the part that would be completed
      if (suggestionText.toLowerCase().startsWith(input.toLowerCase())) {
        const completionPart = input + suggestionText.substring(input.length);
        autofillElement.textContent = completionPart;
      } else {
        autofillElement.textContent = '';
      }
    } else {
      autofillElement.textContent = '';
    }
  } else {
    autofillElement.textContent = '';
  }
}

/**
 * Setup logout confirmation modal
 */
function setupLogoutConfirmation() {
  const logoutModal = document.getElementById('logout-modal');
  const cancelLogout = document.getElementById('cancel-logout');
  const confirmLogout = document.getElementById('confirm-logout');
  
  if (!logoutModal || !cancelLogout || !confirmLogout) return;
  
  // Cancel button closes the modal
  cancelLogout.addEventListener('click', () => {
    logoutModal.classList.remove('active');
  });
  
  // Confirm button logs out
  confirmLogout.addEventListener('click', () => {
    // Clear session storage
    localStorage.removeItem('millenniumDebugSession');
    localStorage.removeItem('millenniumSession');
    
    // Redirect to login page
    window.location.href = 'login.html';
  });
  
  // Close modal when clicking outside
  logoutModal.addEventListener('click', (e) => {
    if (e.target === logoutModal) {
      logoutModal.classList.remove('active');
    }
  });
}

/**
 * Show logout confirmation modal
 */
function showLogoutConfirmation() {
  const logoutModal = document.getElementById('logout-modal');
  if (logoutModal) {
    logoutModal.classList.add('active');
  }
}

/**
 * Check if this is a first-time user and show welcome screen
 */
function checkFirstTimeUser() {
  const hasSeenWelcome = localStorage.getItem('millenniumWelcomeShown');
  
  if (!hasSeenWelcome) {
    showWelcomeScreen();
  }
}

/**
 * Show welcome screen
 */
function showWelcomeScreen() {
  const welcomeModal = document.getElementById('welcome-modal');
  const welcomeContainer = document.querySelector('.welcome-modal-container');
  const continueBtn = document.getElementById('welcome-continue-btn');
  const disableConfetti = document.getElementById('disable-confetti');
  const userOs = document.getElementById('user-os-name');
  const shortcutsList = document.getElementById('shortcuts-list');
  
  if (!welcomeModal || !continueBtn || !disableConfetti || !userOs || !shortcutsList) {
    console.error('Welcome screen elements not found');
    return;
  }
  
  // Detect OS
  const osName = detectOS();
  userOs.textContent = osName;
  
  // Add shortcuts based on OS
  populateShortcuts(shortcutsList, osName);
  
  // Show the welcome screen
  welcomeModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Prevent scrolling
  
  // Apply zoom effect to dashboard content
  const dashboardContainer = document.querySelector('.dashboard-container');
  if (dashboardContainer) {
    dashboardContainer.style.transition = 'transform 0.4s ease';
    dashboardContainer.style.transform = 'scale(1.03)';
  }
  
  // Handle continue button
  continueBtn.addEventListener('click', () => {
    // Mark as seen
    localStorage.setItem('millenniumWelcomeShown', 'true');
    
    // Remove modal with animation - only animate the container
    if (welcomeContainer) {
      welcomeContainer.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
      welcomeContainer.style.transform = 'scale(0.8)';
      welcomeContainer.style.opacity = '0';
    }
    
    // Fade out the backdrop separately
    welcomeModal.style.transition = 'opacity 0.4s ease';
    welcomeModal.style.opacity = '0';
    
    // Reset dashboard zoom
    if (dashboardContainer) {
      dashboardContainer.style.transform = 'scale(1)';
    }
    
    // Re-enable scrolling
    document.body.style.overflow = '';
    
    setTimeout(() => {
      welcomeModal.classList.remove('active');
      
      // Reset styles after animation completes
      if (welcomeContainer) {
        welcomeContainer.style.transform = '';
        welcomeContainer.style.opacity = '';
        welcomeContainer.style.transition = '';
      }
      welcomeModal.style.opacity = '';
      welcomeModal.style.transition = '';
      
      // Show confetti if not disabled
      if (!disableConfetti.checked) {
        showConfetti();
      }
    }, 400);
  });
}

/**
 * Detect the user's operating system
 * @returns {string} - OS name
 */
function detectOS() {
  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  
  // Check for macOS
  if (/Mac/.test(platform)) {
    return 'macOS';
  }
  
  // Check for iOS
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return 'iOS';
  }
  
  // Check for Windows
  if (/Win/.test(platform)) {
    return 'Windows';
  }
  
  // Check for Android
  if (/Android/.test(userAgent)) {
    return 'Android';
  }
  
  // Check for Linux
  if (/Linux/.test(platform)) {
    return 'Linux';
  }
  
  // Default
  return 'your operating system';
}

/**
 * Populate shortcuts based on OS
 * @param {HTMLElement} container - Container to add shortcuts to
 * @param {string} os - Operating system name
 */
function populateShortcuts(container, os) {
  const isMac = os === 'macOS' || os === 'iOS';
  const modKey = isMac ? '⌘' : 'Ctrl';
  
  const shortcuts = [
    { name: 'Search', keys: [`${modKey}`, 'K'] },
    { name: 'Navigate home', keys: [`${modKey}`, 'H'] },
    { name: 'Open/close notifications', keys: [`${modKey}`, 'N'] },
    { name: 'Close modals', keys: ['Esc'] },
    { name: 'Refresh content', keys: [`${modKey}`, 'R'] }
  ];
  
  shortcuts.forEach(shortcut => {
    const shortcutItem = document.createElement('div');
    shortcutItem.className = 'shortcut-item';
    
    const shortcutName = document.createElement('div');
    shortcutName.className = 'shortcut-name';
    shortcutName.textContent = shortcut.name;
    
    const shortcutCombo = document.createElement('div');
    shortcutCombo.className = 'shortcut-combo';
    
    shortcut.keys.forEach(key => {
      const keyElement = document.createElement('span');
      keyElement.className = 'shortcut-key';
      keyElement.textContent = key;
      shortcutCombo.appendChild(keyElement);
    });
    
    shortcutItem.appendChild(shortcutName);
    shortcutItem.appendChild(shortcutCombo);
    container.appendChild(shortcutItem);
  });
}

/**
 * Show confetti animation with improved physics
 */
function showConfetti() {
  // Create confetti pieces
  const colors = ['#ff577f', '#ff884b', '#ffd384', '#fff9b0', '#7761ff', '#34b3f1', '#39c5bb', '#51cf66'];
  const confettiCount = 180;
  const confettiContainer = document.createElement('div');
  confettiContainer.id = 'confetti-container';
  confettiContainer.style.position = 'fixed';
  confettiContainer.style.top = '0';
  confettiContainer.style.left = '0';
  confettiContainer.style.width = '100%';
  confettiContainer.style.height = '100%';
  confettiContainer.style.pointerEvents = 'none';
  confettiContainer.style.zIndex = '9999';
  confettiContainer.style.overflow = 'hidden';
  document.body.appendChild(confettiContainer);
  
  // Create confetti pieces from both bottom corners
  for (let i = 0; i < confettiCount; i++) {
    setTimeout(() => {
      // Alternate between left and right corner launch points
      const isLeftCorner = i % 2 === 0;
      createConfettiPiece(confettiContainer, colors, isLeftCorner);
    }, i * 15); // Staggered launch for more natural effect
  }
  
  // Clean up after animation completes
  setTimeout(() => {
    if (confettiContainer.parentNode) {
      // Fade out confetti
      confettiContainer.style.transition = 'opacity 0.5s ease';
      confettiContainer.style.opacity = '0';
      
      setTimeout(() => {
        if (confettiContainer.parentNode) {
          confettiContainer.parentNode.removeChild(confettiContainer);
        }
      }, 500);
    }
  }, 5000);
}

/**
 * Create a confetti piece with improved physics
 * @param {HTMLElement} container - Container to add confetti to
 * @param {Array} colors - Array of colors
 * @param {boolean} isLeftCorner - Whether to launch from left corner (otherwise right)
 */
function createConfettiPiece(container, colors, isLeftCorner) {
  const piece = document.createElement('div');
  piece.className = 'confetti-piece';
  
  // Random properties with improved sizes
  const size = Math.random() * 10 + 5; // Smaller confetti (5-15px)
  const shape = Math.random() > 0.6 ? '50%' : Math.random() > 0.5 ? '0%' : '5px'; // Circle, square, or rounded
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  // Starting position (from bottom corners with spread)
  const cornerOffset = 100; // Distance from corner
  const startX = isLeftCorner 
    ? Math.random() * cornerOffset // Left side: 0 to cornerOffset
    : window.innerWidth - (Math.random() * cornerOffset); // Right side: width-cornerOffset to width
    
  const startY = window.innerHeight + 10; // Start just below screen
  
  // Initial angle of launch (upwards with spread)
  const baseAngle = isLeftCorner ? -30 : -150; // Base angle in degrees (-30 for right, -150 for left)
  const angleVariation = 30; // Variation in degrees
  const launchAngle = (baseAngle + (Math.random() * angleVariation - angleVariation/2)) * (Math.PI / 180); // Convert to radians
  
  // Launch velocity
  const speed = Math.random() * 250 + 350; // Speed (pixels per second)
  
  // Set velocity components
  const vx = Math.cos(launchAngle) * speed;
  const vy = Math.sin(launchAngle) * speed;
  
  // Set initial styles
  piece.style.width = `${size}px`;
  piece.style.height = `${size}px`;
  piece.style.backgroundColor = color;
  piece.style.borderRadius = shape;
  piece.style.position = 'absolute';
  piece.style.bottom = `${window.innerHeight - startY}px`;
  piece.style.left = `${startX}px`;
  piece.style.willChange = 'transform';
  
  // Add to container
  container.appendChild(piece);
  
  // Animation variables
  const gravity = 800; // Pixels per second squared
  let x = startX;
  let y = startY;
  let lastTimestamp = null;
  let rotation = 0;
  const rotationSpeed = (Math.random() - 0.5) * 720; // Random rotation speed and direction
  
  // Animate using requestAnimationFrame for smoother physics
  function animate(timestamp) {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
      requestAnimationFrame(animate);
      return;
    }
    
    const deltaTime = (timestamp - lastTimestamp) / 1000; // Convert to seconds
    lastTimestamp = timestamp;
    
    // Update position with physics
    x += vx * deltaTime;
    y += vy * deltaTime;
    
    // Apply gravity
    const newVy = vy + gravity * deltaTime;
    vy = newVy;
    
    // Update rotation
    rotation += rotationSpeed * deltaTime;
    
    // Apply position and rotation
    piece.style.transform = `translate(${x - startX}px, ${startY - y}px) rotate(${rotation}deg)`;
    
    // Apply fade out when rising is complete
    if (vy > 0) {
      const opacity = Math.max(0, 1 - (vy / (speed * 1.5)));
      piece.style.opacity = opacity.toString();
    }
    
    // Continue animation if on screen
    if (y < window.innerHeight + 200 && x > -100 && x < window.innerWidth + 100) {
      requestAnimationFrame(animate);
    } else {
      // Remove when off screen
      container.removeChild(piece);
    }
  }
  
  // Start animation
  requestAnimationFrame(animate);
}

/**
 * Setup header search shortcut display
 */
function setupHeaderSearch() {
  // Update the modifier key based on OS in the header
  const headerModifierKey = document.getElementById('header-modifier-key');
  if (headerModifierKey) {
    const os = detectOS();
    headerModifierKey.textContent = (os === 'macOS' || os === 'iOS') ? '⌘' : 'Ctrl';
  }
}

/**
 * Initialize theme handling
 */
function initializeTheme() {
  // Add CSS variables for light theme
  const style = document.createElement('style');
  document.head.appendChild(style);
  
  // Get theme preference or use system default
  const savedTheme = localStorage.getItem('theme') || 'system';
  applyTheme(savedTheme);
  
  // Watch for system preference changes
  if (window.matchMedia) {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Apply system theme when it changes if system preference is selected
    darkModeMediaQuery.addEventListener('change', () => {
      if (localStorage.getItem('theme') === 'system') {
        applyTheme('system');
      }
    });
  }
}

/**
 * Apply a theme
 * @param {string} theme - Theme to apply ('dark', 'light', or 'system')
 */
function applyTheme(theme) {
  const root = document.documentElement;
  
  // Save theme preference
  localStorage.setItem('theme', theme);
  
  // Determine if we should use dark mode
  let useDarkMode = true;
  
  if (theme === 'system') {
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      useDarkMode = false;
    }
  } else if (theme === 'light') {
    useDarkMode = false;
  }
  
  // Update icons filter based on theme - this ensures icons change with theme
  updateIconsForTheme(useDarkMode);
  
  // Apply appropriate theme
  if (useDarkMode) {
    applyDarkTheme();
  } else {
    applyLightTheme();
  }
  
  // Update preference UI if it exists
  updateThemePreferenceUI(theme);
}

/**
 * Apply dark theme
 */
function applyDarkTheme() {
  const root = document.documentElement;
  
  // Dark theme variables
  root.style.setProperty('--sidebar-bg', '#000000');
  root.style.setProperty('--main-bg', '#000000');
  root.style.setProperty('--card-bg', '#151718');
  root.style.setProperty('--hover-bg', 'rgba(255, 255, 255, 0.08)');
  root.style.setProperty('--active-bg', 'rgba(255, 255, 255, 0.15)');
  root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.08)');
  root.style.setProperty('--header-bg', 'rgba(0, 0, 0, 0.7)');
  
  // Add hover card background for dark theme
  root.style.setProperty('--hover-card-bg', '#1c1e1f');
  root.style.setProperty('--hover-border-color', 'rgba(255, 255, 255, 0.15)');
  
  root.style.setProperty('--text-primary', '#F7F8F8');
  root.style.setProperty('--text-secondary', '#B5B6B6');
  root.style.setProperty('--text-tertiary', '#707070');
  
  document.body.classList.remove('light-theme');
  document.body.classList.add('dark-theme');
}

/**
 * Apply light theme
 */
function applyLightTheme() {
  const root = document.documentElement;
  
  // Light theme variables - softer colors
  root.style.setProperty('--sidebar-bg', '#f0f0f5');
  root.style.setProperty('--main-bg', '#f5f5f7');
  root.style.setProperty('--card-bg', '#ffffff');
  root.style.setProperty('--hover-bg', 'rgba(0, 0, 0, 0.04)');
  root.style.setProperty('--active-bg', 'rgba(0, 0, 0, 0.07)');
  root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.1)');
  root.style.setProperty('--header-bg', 'rgba(245, 245, 247, 0.8)');
  
  // Add hover card background for light theme
  root.style.setProperty('--hover-card-bg', '#f7f7fa');
  root.style.setProperty('--hover-border-color', 'rgba(0, 0, 0, 0.15)');
  
  // Text with better contrast
  root.style.setProperty('--text-primary', '#1a1a1f');
  root.style.setProperty('--text-secondary', '#3a3a3f');
  root.style.setProperty('--text-tertiary', '#6a6a75');
  
  document.body.classList.remove('dark-theme');
  document.body.classList.add('light-theme');
}

/**
 * Update icons filter based on theme
 * @param {boolean} isDarkMode - Whether dark mode is active
 */
function updateIconsForTheme(isDarkMode) {
  // Get all SVG icons
  const icons = document.querySelectorAll('img[src$=".svg"]');
  
  // Update filter based on theme
  icons.forEach(icon => {
    if (isDarkMode) {
      // For dark mode: full invert (white icons)
      icon.style.filter = 'invert(1)';
      icon.style.opacity = '0.7';
    } else {
      // For light mode: partial invert (dark icons)
      icon.style.filter = 'invert(0.2)';
      icon.style.opacity = '0.8';
    }
    
    // Ensure proper hover opacity for icons
    const iconParent = icon.closest('.nav-link') || 
                      icon.closest('.quick-card') || 
                      icon.closest('.activity-item') ||
                      icon.closest('.dropdown-item') ||
                      icon.closest('.search-result');
                      
    if (iconParent) {
      iconParent.addEventListener('mouseenter', () => {
        icon.style.opacity = '1';
      });
      
      iconParent.addEventListener('mouseleave', () => {
        icon.style.opacity = isDarkMode ? '0.7' : '0.8';
      });
    }
  });
}

/**
 * Update theme preference UI
 * @param {string} theme - Current theme
 */
function updateThemePreferenceUI(theme) {
  const darkBtn = document.querySelector('.preference-btn:nth-child(1)');
  const lightBtn = document.querySelector('.preference-btn:nth-child(2)');
  const systemBtn = document.querySelector('.preference-btn:nth-child(3)');
  
  if (!darkBtn || !lightBtn || !systemBtn) return;
  
  // Remove active class from all
  darkBtn.classList.remove('active');
  lightBtn.classList.remove('active');
  systemBtn.classList.remove('active');
  
  // Set active class on current theme
  if (theme === 'dark') {
    darkBtn.classList.add('active');
  } else if (theme === 'light') {
    lightBtn.classList.add('active');
  } else {
    systemBtn.classList.add('active');
  }
}

// Mobile menu toggle functionality (for responsive design)
document.addEventListener('click', function(e) {
  // Check if we need to add a mobile menu button dynamically
  if (window.innerWidth <= 640 && !document.querySelector('.mobile-menu-toggle')) {
    addMobileMenuToggle();
  }
});

/**
 * Adds a mobile menu toggle button for small screens
 */
function addMobileMenuToggle() {
  const header = document.querySelector('.content-header');
  
  if (header && !document.querySelector('.mobile-menu-toggle')) {
    const toggleButton = document.createElement('button');
    toggleButton.className = 'mobile-menu-toggle header-action-btn';
    toggleButton.setAttribute('aria-label', 'Toggle menu');
    toggleButton.innerHTML = '<span></span><span></span><span></span>';
    
    // Insert as first child
    header.insertBefore(toggleButton, header.firstChild);
    
    // Add event listener
    toggleButton.addEventListener('click', function() {
      const sidebar = document.querySelector('.sidebar');
      sidebar.classList.toggle('active');
    });
  }
}

// Handle window resize
window.addEventListener('resize', function() {
  // Check if we need to add/remove mobile menu button
  if (window.innerWidth <= 640 && !document.querySelector('.mobile-menu-toggle')) {
    addMobileMenuToggle();
  } else if (window.innerWidth > 640) {
    // Remove mobile-specific classes when resized larger
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.remove('active');
    }
  }
}, { passive: true });

/**
 * Navigate to a section
 * @param {string} section - The section to navigate to
 */
function navigateTo(section) {
  const navItem = document.querySelector(`.nav-link[href="#${section}"]`);
  if (navItem) {
    navItem.click();
  }
}

/**
 * Setup the search modal with autofill and smart suggestions
 */
function setupSearchModal() {
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-modal-input');
  
  if (!searchModal || !searchInput) return;
  
  // Update the shortcut key based on OS
  updateShortcutKeyDisplay();
  
  // Initialize search usage history from localStorage or create new
  let searchHistory = JSON.parse(localStorage.getItem('searchUsageHistory') || '{}');
  
  // Close when clicking outside the modal content
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) {
      searchModal.classList.remove('active');
    }
  });
  
  // Handle input for search filtering
  searchInput.addEventListener('input', (e) => {
    handleSearchInput(e);
    updateAutofillSuggestion(e.target.value);
  });
  
  // Handle arrow key navigation, enter selection, and tab for autofill
  searchInput.addEventListener('keydown', (e) => {
    const results = Array.from(document.querySelectorAll('.search-result')).filter(
      el => el.style.display !== 'none'
    );
    
    if (results.length === 0) return;
    
    const currentIndex = results.findIndex(el => el.classList.contains('selected'));
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectSearchResult(results, currentIndex + 1 >= results.length ? 0 : currentIndex + 1);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        selectSearchResult(results, currentIndex <= 0 ? results.length - 1 : currentIndex - 1);
        break;
      
      case 'Tab':
      case 'ArrowRight':
        // Handle autofill if we have a suggestion
        const autofillText = document.getElementById('autofill-suggestion')?.textContent;
        if (autofillText) {
          e.preventDefault();
          searchInput.value = autofillText;
          handleSearchInput({ target: searchInput });
          updateAutofillSuggestion(autofillText);
        }
        break;
      
      case 'Enter':
        e.preventDefault();
        if (currentIndex >= 0) {
          const selectedResult = results[currentIndex];
          selectAndRecordUsage(selectedResult);
        } else if (results.length > 0) {
          selectAndRecordUsage(results[0]);
        }
        break;
    }
  });
  
  // Function to handle selection and record usage
  function selectAndRecordUsage(resultElement) {
    // Record usage for this option
    const resultTitle = resultElement.querySelector('.search-result-title')?.textContent;
    if (resultTitle) {
      searchHistory[resultTitle] = (searchHistory[resultTitle] || 0) + 1;
      localStorage.setItem('searchUsageHistory', JSON.stringify(searchHistory));
    }
    
    // Click the result
    resultElement.click();
  }
  
  // Add autofill suggestion element if it doesn't exist
  if (!document.getElementById('autofill-container')) {
    const autofillContainer = document.createElement('div');
    autofillContainer.id = 'autofill-container';
    autofillContainer.innerHTML = `
      <span id="autofill-suggestion"></span>
    `;
    searchModal.querySelector('.search-modal-header').appendChild(autofillContainer);
    
    // Add autofill hint to the footer instead of inline
    const autofillHint = document.createElement('div');
    autofillHint.className = 'autofill-hint';
    autofillHint.innerHTML = `
      <span>Tab</span> or <span>→</span> to autofill
    `;
    searchModal.querySelector('.search-modal-footer').appendChild(autofillHint);
  }
}

/**
 * Select a search result
 * @param {Array} results - Array of search result elements
 * @param {number} index - Index to select
 */
function selectSearchResult(results, index) {
  results.forEach(result => result.classList.remove('selected'));
  
  if (index >= 0 && index < results.length) {
    results[index].classList.add('selected');
    results[index].scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Update shortcut key display based on OS
 */
function updateShortcutKeyDisplay() {
  const modifierKey = document.getElementById('modifier-key');
  if (!modifierKey) return;
  
  const os = detectOS();
  if (os === 'macOS' || os === 'iOS') {
    modifierKey.textContent = '⌘';
  } else {
    modifierKey.textContent = 'Ctrl';
  }
}

/**
 * Setup header action buttons functionality
 */
function setupHeaderActions() {
  const refreshBtn = document.getElementById('refresh-btn');
  const notificationsBtn = document.getElementById('notifications-btn');
  const settingsBtn = document.getElementById('settings-btn');
  
  // Add notification indicator for demo
  notificationsBtn.classList.add('has-notification');
  
  // Setup refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      // Add spinning animation
      const refreshIcon = this.querySelector('img');
      refreshIcon.style.transition = 'transform 0.5s ease';
      refreshIcon.style.transform = 'rotate(360deg)';
      
      // Simulate content refresh
      const contentWrapper = document.querySelector('.content-wrapper');
      if (contentWrapper) {
        contentWrapper.classList.add('loading');
        
        // After a short delay, reset everything
        setTimeout(() => {
          contentWrapper.classList.remove('loading');
          refreshIcon.style.transition = 'none';
          refreshIcon.style.transform = 'rotate(0deg)';
          
          // After removing transition, restore it
          setTimeout(() => {
            refreshIcon.style.transition = 'transform 0.5s ease';
          }, 50);
        }, 800);
      }
    });
  }
  
  // Setup notifications button
  if (notificationsBtn) {
    notificationsBtn.addEventListener('click', function() {
      // Toggle notifications modal
      const notificationsModal = document.getElementById('notifications-modal');
      if (notificationsModal) {
        // Close other modals if open
        closeAllModals();
        // Open notifications modal
        showNotificationsModal();
      }
    });
  }
  
  // Setup settings button
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      // Navigate to account/preferences page
      navigateTo('account');
    });
  }
}

/**
 * Create a forwards icon by rotating the back icon
 * @returns {HTMLElement} The forwards icon element
 */
function createForwardIcon() {
  const forwardIcon = document.createElement('img');
  forwardIcon.src = 'Assets/back.svg';
  forwardIcon.alt = 'Forward';
  forwardIcon.classList.add('forward-icon');
  forwardIcon.style.transform = 'rotate(180deg)';
  return forwardIcon;
}

/**
 * Add status dot indicators based on priority
 * @param {string} priority - Priority level ('high', 'medium', 'low')
 * @param {HTMLElement} container - Container to add the dot to
 */
function addStatusDot(priority, container) {
  const statusDot = document.createElement('span');
  statusDot.className = `status-dot ${priority}`;
  container.appendChild(statusDot);
  
  // Add pulsating effect for high priority
  if (priority === 'high') {
    statusDot.classList.add('pulsate');
  }
}

/**
 * Setup category selection
 */
function setupCategorySelection() {
  const categoryItems = document.querySelectorAll('.category-item');
  categoryItems.forEach(item => {
    item.addEventListener('click', () => {
      // Update active state
      categoryItems.forEach(cat => cat.classList.remove('active'));
      item.classList.add('active');
      
      // Get the selected category
      const category = item.dataset.category;
      console.log(`Selected category: ${category}`);
      
      // Filter notifications based on category
      filterNotificationsByCategory(category);
    });
  });
}

/**
 * Filter notifications based on selected category
 * @param {string} category - The selected notification category
 */
function filterNotificationsByCategory(category) {
  const notificationItems = document.querySelectorAll('.notification-item');
  const emptyStateTemplate = document.getElementById('empty-state-template');
  let visibleCount = 0;
  
  // Remove any existing empty state
  const existingEmptyState = document.querySelector('.notifications-list-content .empty-state');
  if (existingEmptyState) {
    existingEmptyState.remove();
  }
  
  // Show all sections by default
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    section.style.display = 'block';
  });
  
  // Handle different categories with specific filtering
  switch (category) {
    case 'inbox':
      // Show all notifications
      notificationItems.forEach(item => {
        item.style.display = 'flex';
        visibleCount++;
      });
      break;
      
    case 'pinned':
      // Show only pinned notifications
      notificationItems.forEach(item => {
        if (item.classList.contains('pinned')) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      break;
      
    case 'alerts':
      // Show only high priority notifications
      notificationItems.forEach(item => {
        const priorityIndicator = item.querySelector('.priority-indicator');
        if (priorityIndicator && priorityIndicator.classList.contains('high')) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      break;
      
    case 'unread':
      // Show only unread notifications
      notificationItems.forEach(item => {
        if (item.classList.contains('unread')) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      break;
      
    default:
      // Filter by category icon type
      notificationItems.forEach(item => {
        const icon = item.querySelector('.notification-icon img');
        if (icon && icon.getAttribute('alt').toLowerCase() === category) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      break;
  }
  
  // Hide empty date sections
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    const visibleItems = Array.from(section.querySelectorAll('.notification-item')).filter(
      item => item.style.display === 'flex'
    );
    if (visibleItems.length === 0) {
      section.style.display = 'none';
    }
  });
  
  // Show empty state if no notifications visible
  if (visibleCount === 0 && emptyStateTemplate) {
    const emptyState = document.importNode(emptyStateTemplate.content, true);
    const listContent = document.querySelector('.notifications-list-content');
    
    // Update empty state text based on category
    const title = emptyState.querySelector('.empty-state-title');
    const text = emptyState.querySelector('.empty-state-text');
    const icon = emptyState.querySelector('.empty-state-icon');
    
    if (title && text && icon) {
      // Use appropriate icon based on category
      switch (category) {
        case 'starred':
          icon.src = 'Assets/starred.svg';
          title.textContent = 'No pinned notifications';
          text.textContent = 'Pin important notifications to find them quickly.';
          break;
        case 'alerts':
          icon.src = 'Assets/alert.svg';
          title.textContent = 'No alerts';
          text.textContent = 'You don\'t have any high priority notifications.';
          break;
        case 'archive':
          icon.src = 'Assets/archive.svg';
          title.textContent = 'Archive is empty';
          text.textContent = 'Archived notifications will appear here.';
          break;
        case 'trash':
          icon.src = 'Assets/trash.svg';
          title.textContent = 'Trash is empty';
          text.textContent = 'Deleted notifications will appear here.';
          break;
        case 'calendar':
          icon.src = 'Assets/calendar-icon.svg';
          title.textContent = 'No calendar notifications';
          text.textContent = 'Event notifications will appear here.';
          break;
        case 'homework':
          icon.src = 'Assets/homework-icon.svg';
          title.textContent = 'No assignment notifications';
          text.textContent = 'Assignment notifications will appear here.';
          break;
        default:
          // Use category-specific icon if available
          const categoryItem = document.querySelector(`.category-item[data-category="${category}"]`);
          if (categoryItem) {
            const categoryIcon = categoryItem.querySelector('.category-icon img');
            if (categoryIcon) {
              icon.src = categoryIcon.src;
            }
          }
          
          title.textContent = `No ${category} notifications`;
          text.textContent = `You don't have any ${category} notifications yet.`;
      }
    }
    
    if (listContent) {
      listContent.appendChild(emptyState);
    }
  }
  
  // Update selected notification if the currently selected one is hidden
  const selectedNotification = document.querySelector('.notification-item.selected');
  if (selectedNotification && selectedNotification.style.display === 'none') {
    // Select the first visible notification instead
    const firstVisible = document.querySelector('.notification-item[style="display: flex;"]');
    
    // Clear existing selection
    document.querySelectorAll('.notification-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    if (firstVisible) {
      firstVisible.classList.add('selected');
      updateNotificationDetails(firstVisible);
    } else {
      // No visible notifications, show empty detail panel
      const noNotificationSelected = document.querySelector('.no-notification-selected');
      const notificationDetail = document.querySelector('.notification-detail');
      
      if (noNotificationSelected) {
        noNotificationSelected.style.display = 'flex';
      }
      
      if (notificationDetail) {
        notificationDetail.style.display = 'none';
      }
    }
  }
}

/**
 * Setup notifications sidebar functionality
 */
function setupNotificationsSidebar() {
  // Initialize category selection
  setupCategorySelection();
  
  // Set up filter and sort functionality
  setupFilterAndSort();
  
  // Apply performance optimizations for notifications
  optimizeNotificationsPerformance();
  
  // Add mobile category toggle button if it doesn't exist
  const listHeader = document.querySelector('.notifications-list-header');
  if (listHeader && window.innerWidth <= 768 && !document.getElementById('mobile-category-btn')) {
    const categoryBtn = document.createElement('button');
    categoryBtn.id = 'mobile-category-btn';
    categoryBtn.className = 'header-action-btn tooltip-trigger';
    categoryBtn.setAttribute('data-tooltip', 'Categories');
    categoryBtn.innerHTML = '<img src="Assets/category.svg" alt="Categories">';
    
    categoryBtn.addEventListener('click', () => {
      const sidebar = document.querySelector('.notifications-sidebar');
      if (sidebar) {
        sidebar.classList.toggle('active');
      }
    });
    
    listHeader.querySelector('.list-header-actions').prepend(categoryBtn);
  }
  
  // Add back button to detail panel for mobile
  const detailHeader = document.querySelector('.detail-header');
  if (detailHeader && window.innerWidth <= 992 && !document.getElementById('mobile-back-btn')) {
    const backBtn = document.createElement('button');
    backBtn.id = 'mobile-back-btn';
    backBtn.className = 'header-action-btn tooltip-trigger';
    backBtn.setAttribute('data-tooltip', 'Back to list');
    backBtn.innerHTML = '<img src="Assets/back.svg" alt="Back">';
    
    backBtn.addEventListener('click', () => {
      const detailPanel = document.querySelector('.notifications-detail-panel');
      if (detailPanel) {
        detailPanel.classList.remove('active');
      }
    });
    
    detailHeader.prepend(backBtn);
  }
}

/**
 * Setup filter and sort functionality for notifications
 */
function setupFilterAndSort() {
  const filterBtn = document.getElementById('notification-filter-btn');
  const filterDropdown = filterBtn?.closest('.filter-dropdown');
  const sortBtn = document.getElementById('notification-sort-btn');
  const applyFiltersBtn = document.getElementById('apply-filters');
  const resetFiltersBtn = document.getElementById('reset-filters');
  
  // Sort state
  let sortAscending = true;
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (filterDropdown && filterDropdown.classList.contains('active') && 
        !filterDropdown.contains(e.target)) {
      filterDropdown.classList.remove('active');
    }
  });
  
  // Toggle filter dropdown
  if (filterBtn && filterDropdown) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDropdown.classList.toggle('active');
    });
  }
  
  // Apply filters
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', () => {
      applyNotificationFilters();
      if (filterDropdown) {
        filterDropdown.classList.remove('active');
      }
    });
  }
  
  // Reset filters
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
      });
      
      // Select unread by default
      const unreadCheckbox = document.querySelector('.filter-option input[value="unread"]');
      if (unreadCheckbox) {
        unreadCheckbox.checked = true;
      }
    });
  }
  
  // Toggle sort order
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      sortAscending = !sortAscending;
      
      // Update sort button icon
      const sortImg = sortBtn.querySelector('img');
      if (sortImg) {
        sortImg.src = sortAscending ? 'Assets/sort.svg' : 'Assets/sort-reverse.svg';
        sortBtn.setAttribute('data-tooltip', sortAscending ? 'Sort by date' : 'Sort by date (reverse)');
      }
      
      // Apply sort
      sortNotifications(sortAscending);
    });
  }
}

/**
 * Apply filters to notifications based on selected checkboxes
 */
function applyNotificationFilters() {
  // Get selected filters
  const filters = [];
  document.querySelectorAll('.filter-option input[type="checkbox"]:checked').forEach(checkbox => {
    filters.push(checkbox.value);
  });
  
  // If no filters are selected, show all notifications
  if (filters.length === 0) {
    filterNotificationsByCategory('inbox');
    return;
  }
  
  const notificationItems = document.querySelectorAll('.notification-item');
  let visibleCount = 0;
  
  // Remove any existing empty state
  const existingEmptyState = document.querySelector('.notifications-list-content .empty-state');
  if (existingEmptyState) {
    existingEmptyState.remove();
  }
  
  // Show all date sections by default
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    section.style.display = 'block';
  });
  
  // Apply filters to notifications
  notificationItems.forEach(item => {
    let shouldShow = false;
    
    // Check each filter
    for (const filter of filters) {
      switch (filter) {
        case 'unread':
          if (item.classList.contains('unread')) {
            shouldShow = true;
          }
          break;
          
        case 'pinned':
          if (item.classList.contains('pinned')) {
            shouldShow = true;
          }
          break;
          
        case 'high':
          if (item.querySelector('.priority-indicator.high')) {
            shouldShow = true;
          }
          break;
          
        case 'medium':
          if (item.querySelector('.priority-indicator.medium')) {
            shouldShow = true;
          }
          break;
          
        case 'low':
          if (item.querySelector('.priority-indicator.low')) {
            shouldShow = true;
          }
          break;
      }
      
      // If any filter matches, we show the item
      if (shouldShow) break;
    }
    
    if (shouldShow) {
      item.style.display = 'flex';
      visibleCount++;
    } else {
      item.style.display = 'none';
    }
  });
  
  // Hide empty date sections
  document.querySelectorAll('.notifications-date-section').forEach(section => {
    const visibleItems = Array.from(section.querySelectorAll('.notification-item')).filter(
      item => item.style.display === 'flex'
    );
    if (visibleItems.length === 0) {
      section.style.display = 'none';
    }
  });
  
  // Show empty state if no notifications visible
  if (visibleCount === 0) {
    const emptyStateTemplate = document.getElementById('empty-state-template');
    if (emptyStateTemplate) {
      const emptyState = document.importNode(emptyStateTemplate.content, true);
      const listContent = document.querySelector('.notifications-list-content');
      
      // Update empty state text
      const title = emptyState.querySelector('.empty-state-title');
      const text = emptyState.querySelector('.empty-state-text');
      const icon = emptyState.querySelector('.empty-state-icon');
      
      if (title && text && icon) {
        icon.src = 'Assets/filter.svg';
        title.textContent = 'No matching notifications';
        text.textContent = 'No notifications match your selected filters';
      }
      
      if (listContent) {
        listContent.appendChild(emptyState);
      }
    }
  }
  
  // Update selected notification if the currently selected one is hidden
  const selectedNotification = document.querySelector('.notification-item.selected');
  if (selectedNotification && selectedNotification.style.display === 'none') {
    // Select the first visible notification instead
    const firstVisible = document.querySelector('.notification-item[style="display: flex;"]');
    
    // Clear existing selection
    document.querySelectorAll('.notification-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    if (firstVisible) {
      firstVisible.classList.add('selected');
      updateNotificationDetails(firstVisible);
    } else {
      // No visible notifications, show empty detail panel
      const noNotificationSelected = document.querySelector('.no-notification-selected');
      const notificationDetail = document.querySelector('.notification-detail');
      
      if (noNotificationSelected) {
        noNotificationSelected.style.display = 'flex';
      }
      
      if (notificationDetail) {
        notificationDetail.style.display = 'none';
      }
    }
  }
}

/**
 * Sort notifications by date
 * @param {boolean} ascending - Whether to sort in ascending order (oldest first)
 */
function sortNotifications(ascending) {
  // Get date sections
  const dateSections = document.querySelectorAll('.notifications-date-section');
  
  // Sort date sections
  const sortedSections = Array.from(dateSections).sort((a, b) => {
    // Map date section headers to numerical values for comparison
    const dateOrder = {
      'Today': 1,
      'Yesterday': 2,
      'This Week': 3,
      'Last Week': 4,
      'This Month': 5,
      'Older': 6
    };
    
    const headerA = a.querySelector('.date-header').textContent.trim();
    const headerB = b.querySelector('.date-header').textContent.trim();
    
    const orderA = dateOrder[headerA] || 999;
    const orderB = dateOrder[headerB] || 999;
    
    return ascending ? orderA - orderB : orderB - orderA;
  });
  
  // Rearrange sections in the DOM
  const listContent = document.querySelector('.notifications-list-content');
  if (listContent) {
    sortedSections.forEach(section => {
      listContent.appendChild(section);
      
      // Also sort notifications within each section
      const notifications = Array.from(section.querySelectorAll('.notification-item'));
      
      // For demo, we'll sort within sections based on data-id
      const sortedNotifications = notifications.sort((a, b) => {
        const idA = parseInt(a.getAttribute('data-id').replace('notif-', ''));
        const idB = parseInt(b.getAttribute('data-id').replace('notif-', ''));
        
        return ascending ? idA - idB : idB - idA;
      });
      
      const notificationContainer = section.querySelector('.notification-items');
      if (notificationContainer) {
        sortedNotifications.forEach(notification => {
          notificationContainer.appendChild(notification);
        });
      }
    });
  }
}

/**
 * Apply performance optimizations for the notifications panel
 */
function optimizeNotificationsPerformance() {
  // Use content-visibility for off-screen notification items
  const notificationItems = document.querySelectorAll('.notification-item');
  notificationItems.forEach(item => {
    item.style.contentVisibility = 'auto';
    item.style.containIntrinsicSize = '0 80px'; // Approximate height of notification items
  });
  
  // Lazy load notification details to avoid rendering everything at once
  const detailContent = document.querySelector('.detail-content');
  if (detailContent) {
    detailContent.style.contentVisibility = 'auto';
  }
  
  // Use hardware acceleration for animations
  const notificationsModal = document.getElementById('notifications-modal');
  if (notificationsModal) {
    notificationsModal.style.transform = 'translateZ(0)';
    notificationsModal.style.backfaceVisibility = 'hidden';
  }
  
  // Optimize touch events for mobile
  const touchSurfaces = [
    '.notifications-sidebar-content',
    '.notifications-list-content',
    '.detail-content'
  ];
  
  touchSurfaces.forEach(selector => {
    const element = document.querySelector(selector);
    if (element) {
      element.style.touchAction = 'pan-y';
      element.style.webkitOverflowScrolling = 'touch';
    }
  });
  
  // Reduce paint complexity
  const notificationContainer = document.querySelector('.notifications-modal-container');
  if (notificationContainer) {
    notificationContainer.style.willChange = 'transform';
  }
  
  // Add passive event listeners for better scroll performance
  document.querySelectorAll('.notifications-list-content, .notifications-sidebar-content, .detail-content')
    .forEach(element => {
      element.addEventListener('scroll', () => {}, { passive: true });
      element.addEventListener('touchstart', () => {}, { passive: true });
      element.addEventListener('touchmove', () => {}, { passive: true });
    });
  
  // Optimize filter dropdown menu
  const filterDropdown = document.querySelector('.filter-dropdown-menu');
  if (filterDropdown) {
    filterDropdown.style.willChange = 'opacity, transform';
    filterDropdown.style.transform = 'translateZ(0)';
  }
  
  // Throttle search input to improve performance
  const searchInput = document.querySelector('.notifications-list-header .list-search input');
  if (searchInput) {
    let searchTimeout = null;
    const originalInputHandler = searchInput.oninput;
    
    searchInput.addEventListener('input', (e) => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const searchTerm = e.target.value.toLowerCase().trim();
        searchNotifications(searchTerm);
      }, 150); // 150ms delay
    });
  }
}

/**
 * High-performance notification center - main initialization
 * Complete rewrite focused on performance optimization
 */
function initHighPerfNotificationCenter() {
  // Core elements
  const elements = {
    modal: document.getElementById('notifications-modal'),
    btn: document.getElementById('notifications-btn'),
    closeBtn: document.querySelector('.notifications-sidebar-footer .sidebar-action-btn:last-child'),
    sidebar: document.querySelector('.notifications-sidebar'),
    listPanel: document.querySelector('.notifications-list-panel'),
    detailPanel: document.querySelector('.notifications-detail-panel'),
    listContent: document.querySelector('.notifications-list-content'),
    markAllReadBtn: document.getElementById('mark-all-read'),
    filterBtn: document.getElementById('notification-filter-btn'),
    sortBtn: document.getElementById('notification-sort-btn'),
    searchInput: document.querySelector('.notifications-list-header .list-search input')
  };
  
  // State management (centralized to avoid repeated DOM queries)
  const state = {
    isOpen: false,
    selectedNotificationId: null,
    sortAscending: true,
    activeCategory: 'inbox',
    activeFilters: ['unread'],
    searchTerm: '',
    notificationData: new Map(), // Will store notification data by ID
    visibleNotifications: new Set(), // Currently visible notification IDs
  };
  
  // Initialize notification data store
  initNotificationDataStore();
  
  // Set up event delegation for better performance
  setupEventDelegation();
  
  // Set up core functionality
  setupOpenClose();
  setupSearch();
  setupFilters();
  setupSort();
  setupMarkAllRead();
  setupCategorySelection();
  
  // Apply initial optimizations
  applyPerformanceOptimizations();
  
  /**
   * Initialize notification data store for faster access
   */
  function initNotificationDataStore() {
    document.querySelectorAll('.notification-item').forEach(item => {
      const id = item.getAttribute('data-id');
      const isUnread = item.classList.contains('unread');
      const isPinned = item.classList.contains('pinned');
      const title = item.querySelector('.notification-title').textContent;
      const preview = item.querySelector('.notification-preview').textContent;
      const time = item.querySelector('.notification-time').textContent;
      const iconSrc = item.querySelector('.notification-icon img').src;
      const iconAlt = item.querySelector('.notification-icon img').alt;
      
      // Find priority level
      let priority = 'low';
      const priorityEl = item.querySelector('.priority-indicator');
      if (priorityEl) {
        if (priorityEl.classList.contains('high')) priority = 'high';
        else if (priorityEl.classList.contains('medium')) priority = 'medium';
        else priority = 'low';
        
        // Update priority indicator to chip style
        priorityEl.classList.add(priority);
      } else {
        // Create priority indicator if it doesn't exist
        const statusContainer = item.querySelector('.notification-status');
        if (statusContainer) {
          const priorityIndicator = document.createElement('div');
          priorityIndicator.className = `priority-indicator ${priority}`;
          statusContainer.appendChild(priorityIndicator);
        }
      }
      
      // Get section (date group)
      const section = item.closest('.notifications-date-section');
      const dateHeader = section ? section.querySelector('.date-header').textContent : 'Unknown';
      
      // Store notification data
      state.notificationData.set(id, {
        id,
        isUnread,
        isPinned,
        title,
        preview,
        time,
        iconSrc,
        iconAlt,
        priority,
        dateHeader,
        element: item, // Store reference to DOM element
        detailContent: getDetailContentForNotification(id)
      });
      
      // Add to visible notifications initially
      state.visibleNotifications.add(id);
    });
  }
  
  /**
   * Set up event delegation for better performance
   */
  function setupEventDelegation() {
    // Main event delegation for notifications list
    if (elements.listContent) {
      elements.listContent.addEventListener('click', (e) => {
        // Find closest notification item if any
        const notificationItem = e.target.closest('.notification-item');
        if (notificationItem) {
          const actionBtn = e.target.closest('.notif-action-btn');
          
          // Handle action button clicks
          if (actionBtn) {
            const notificationId = notificationItem.getAttribute('data-id');
            const tooltip = actionBtn.getAttribute('data-tooltip');
            
            if (tooltip === 'Mark as read' || tooltip === 'Mark as unread') {
              handleReadUnreadAction(notificationId, tooltip === 'Mark as read');
              e.stopPropagation();
            } else if (tooltip === 'Pin notification' || tooltip === 'Unpin notification') {
              handlePinAction(notificationId, tooltip === 'Pin notification');
              e.stopPropagation();
            }
          } 
          // Handle notification selection
          else {
            const notificationId = notificationItem.getAttribute('data-id');
            selectNotification(notificationId);
          }
        }
      }, { passive: true });
    }
  }
  
  /**
   * Set up opening and closing the notification center
   */
  function setupOpenClose() {
    // Open notification center
    if (elements.btn) {
      elements.btn.addEventListener('click', () => {
        openNotificationCenter();
      }, { passive: true });
    }
    
    // Close notification center
    if (elements.closeBtn) {
      elements.closeBtn.addEventListener('click', () => {
        closeNotificationCenter();
      }, { passive: true });
    }
    
    // Close when clicking outside
    if (elements.modal) {
      elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
          closeNotificationCenter();
        }
      }, { passive: true });
    }
    
    // Keyboard shortcut (Ctrl+N or Cmd+N)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && 
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        
        if (state.isOpen) {
          closeNotificationCenter();
        } else {
          openNotificationCenter();
        }
      }
      
      // Close with Escape
      if (state.isOpen && e.key === 'Escape') {
        closeNotificationCenter();
      }
    });
  }
  
  /**
   * Open the notification center
   */
  function openNotificationCenter() {
    // Close other modals first
    closeAllModals();
    
    // Show the notification modal
    if (elements.modal) {
      elements.modal.classList.add('active');
      state.isOpen = true;
      
      // Focus search input
      if (elements.searchInput) {
        setTimeout(() => {
          elements.searchInput.focus();
        }, 100);
      }
      
      // Select first notification if none selected
      if (!state.selectedNotificationId) {
        const firstNotification = document.querySelector('.notification-item');
        if (firstNotification) {
          const id = firstNotification.getAttribute('data-id');
          selectNotification(id);
        }
      }
      
      // Update unread counts
      updateUnreadCounts();
    }
  }
  
  /**
   * Close the notification center
   */
  function closeNotificationCenter() {
    if (elements.modal) {
      elements.modal.classList.remove('active');
      state.isOpen = false;
      
      // Hide mobile detail panel if active
      if (window.innerWidth <= 992) {
        const detailPanel = document.querySelector('.notifications-detail-panel.active');
        if (detailPanel) {
          detailPanel.classList.remove('active');
        }
      }
    }
  }
  
  /**
   * Get detailed content for a specific notification
   * @param {string} id - Notification ID
   * @returns {string} HTML content
   */
  function getDetailContentForNotification(id) {
    // Return appropriate content based on notification ID
    switch (id) {
      case 'notif-1': // System Maintenance Alert
        return `
          <p>Dear Student,</p>
          <p>The Millennium portal will be undergoing <strong>scheduled maintenance</strong> this weekend from:</p>
          <p><strong>Friday, October 27th at 8:00 PM</strong> until <strong>Saturday, October 28th at 6:00 AM</strong></p>
          <p>During this time, the system will be unavailable. Please ensure you save any work and complete any pending assignments before the maintenance begins.</p>
          <p>Key points to note:</p>
          <ul>
            <li>All deadlines that fall during the maintenance window have been automatically extended by 24 hours</li>
            <li>Any assignments submitted in the 2 hours before maintenance will be backed up automatically</li>
            <li>Your account data and work will not be affected by this maintenance</li>
          </ul>
          <p>We apologize for any inconvenience this may cause and appreciate your understanding as we work to improve system performance.</p>
          <p>If you have any urgent matters during this time, please contact your teacher directly.</p>
          <p>Thank you,<br>Millennium IT Support Team</p>
        `;
      
      case 'notif-2': // New Math Assignment
        return `
          <p>Your Mathematics teacher has posted a new assignment.</p>
          <p><strong>Assignment Details:</strong></p>
          <ul>
            <li><strong>Subject:</strong> Algebra II</li>
            <li><strong>Topic:</strong> Quadratic Equations</li>
            <li><strong>Due Date:</strong> Monday, October 30th</li>
            <li><strong>Submission Format:</strong> Online submission through the Assignments portal</li>
          </ul>
          <p><strong>Requirements:</strong></p>
          <p>Complete problems 15-30 in Chapter 4 of your textbook. Show all work and steps clearly.</p>
          <p><strong>Additional Resources:</strong></p>
          <ul>
            <li>Video tutorial on solving quadratics by factoring</li>
            <li>Practice worksheet (optional but recommended)</li>
            <li>Virtual office hours: Friday 3-4 PM</li>
          </ul>
          <p>Remember to check the rubric for grading criteria before submitting your work.</p>
        `;
      
      case 'notif-3': // School Assembly Rescheduled
        return `
          <p>Important Notice to All Students:</p>
          <p>The school assembly originally scheduled for Friday has been <strong>rescheduled</strong> to <strong>Thursday at 10:00 AM</strong> in the main hall due to facility scheduling conflicts.</p>
          <p><strong>Assembly Details:</strong></p>
          <ul>
            <li><strong>Date:</strong> Thursday, October 26th</li>
            <li><strong>Time:</strong> 10:00 AM - 11:15 AM</li>
            <li><strong>Location:</strong> Main Hall</li>
            <li><strong>Attendance:</strong> Mandatory for all students</li>
          </ul>
          <p><strong>Agenda:</strong></p>
          <ul>
            <li>Principal's Address</li>
            <li>Student Council Announcements</li>
            <li>Sports Team Recognition</li>
            <li>Upcoming Events Overview</li>
          </ul>
          <p>Classes that would normally occur during this time will be rescheduled. Your teachers will provide updated information about any affected class periods.</p>
          <p>Please arrive promptly and in proper school uniform.</p>
        `;
      
      case 'notif-4': // English Essay Graded
        return `
          <p>Your English Literature essay has been graded.</p>
          <p><strong>Assignment Details:</strong></p>
          <ul>
            <li><strong>Assignment:</strong> Critical Analysis Essay</li>
            <li><strong>Topic:</strong> Symbolism in "The Great Gatsby"</li>
            <li><strong>Grade:</strong> A- (91/100)</li>
          </ul>
          <p><strong>Teacher Comments:</strong></p>
          <p>"Excellent analysis of the symbolic elements in the novel. Your interpretation of the green light and its connection to Gatsby's character development was particularly insightful. Your writing demonstrates strong critical thinking and a solid grasp of literary techniques."</p>
          <p><strong>Areas of Strength:</strong></p>
          <ul>
            <li>Insightful thesis statement</li>
            <li>Well-structured paragraphs</li>
            <li>Effective use of textual evidence</li>
            <li>Clear and engaging writing style</li>
          </ul>
          <p><strong>Areas for Improvement:</strong></p>
          <ul>
            <li>Some minor grammatical errors in the conclusion</li>
            <li>Consider exploring counter-arguments to strengthen your position</li>
          </ul>
          <p>You can view the full grading rubric and detailed feedback in your assignments portal.</p>
        `;
      
      case 'notif-5': // Password Change Reminder
        return `
          <p>Dear Student,</p>
          <p>This is a reminder that your Millennium portal password will expire in <strong>15 days</strong>.</p>
          <p>For security reasons, all users are required to update their passwords every 180 days. Please take a moment to set a new password before it expires to avoid any disruption to your account access.</p>
          <p><strong>To update your password:</strong></p>
          <ol>
            <li>Go to Account Settings in the sidebar</li>
            <li>Select the "Security" tab</li>
            <li>Click "Change Password"</li>
            <li>Follow the prompts to create and confirm your new password</li>
          </ol>
          <p><strong>Password Requirements:</strong></p>
          <ul>
            <li>At least 8 characters long</li>
            <li>Include at least one uppercase letter</li>
            <li>Include at least one number</li>
            <li>Include at least one special character (e.g., !, @, #, $)</li>
            <li>Must not be the same as your previous 3 passwords</li>
          </ul>
          <p>If you need assistance, please contact the IT Support Desk.</p>
        `;
      
      case 'notif-6': // Final Exam Schedule Posted
        return `
          <p>The Fall semester final exam schedule is now available.</p>
          <p><strong>Exam Schedule:</strong></p>
          <ul>
            <li><strong>Mathematics:</strong> Tuesday, December 12th, 9:00 AM - 11:00 AM, Room M105</li>
            <li><strong>English:</strong> Thursday, December 14th, 9:00 AM - 11:00 AM, Room E301</li>
            <li><strong>Science:</strong> Friday, December 15th, 1:00 PM - 3:00 PM, Room S204</li>
            <li><strong>History:</strong> Monday, December 18th, 9:00 AM - 11:00 AM, Room H102</li>
            <li><strong>Foreign Language:</strong> Tuesday, December 19th, 1:00 PM - 3:00 PM, Room F203</li>
          </ul>
          <p><strong>Important Reminders:</strong></p>
          <ul>
            <li>Arrive at least 15 minutes before your exam time</li>
            <li>Bring your student ID</li>
            <li>Only approved calculators are permitted for math and science exams</li>
            <li>No electronic devices allowed during exams</li>
            <li>Review the full exam policy in the student handbook</li>
          </ul>
          <p>Study guides will be available from your teachers by November 15th.</p>
          <p>If you have any schedule conflicts, please contact the academic office immediately to discuss potential accommodations.</p>
        `;
      
      case 'notif-7': // Chemistry Lab Report Due
        return `
          <p>This is a reminder about your upcoming Chemistry lab report deadline.</p>
          <p><strong>Assignment Details:</strong></p>
          <ul>
            <li><strong>Subject:</strong> Chemistry</li>
            <li><strong>Assignment:</strong> Lab Report - Acid-Base Titration</li>
            <li><strong>Due Date:</strong> Friday, October 27th at 11:59 PM</li>
            <li><strong>Submission:</strong> Online via the Chemistry class portal</li>
          </ul>
          <p><strong>Report Requirements:</strong></p>
          <ol>
            <li>Title page</li>
            <li>Abstract (150-200 words)</li>
            <li>Introduction with hypothesis</li>
            <li>Materials and methods</li>
            <li>Results with data tables and graphs</li>
            <li>Discussion and error analysis</li>
            <li>Conclusion</li>
            <li>References (APA format)</li>
          </ol>
          <p>Your lab report should follow the scientific format discussed in class and include all calculations, properly labeled graphs, and error analysis.</p>
          <p>The lab manual and example reports can be found in the Resources section of your Chemistry class page.</p>
        `;
      
      case 'notif-8': // Library Book Due Soon
        return `
          <p>Library Notice:</p>
          <p>The following item is due soon:</p>
          <p><strong>Title:</strong> To Kill a Mockingbird<br>
          <strong>Author:</strong> Harper Lee<br>
          <strong>Call Number:</strong> F LEE<br>
          <strong>Due Date:</strong> Sunday, October 29th</p>
          <p>Please return this item to the library by the due date to avoid late fees. Current late fees are $0.25 per day for regular circulation items.</p>
          <p><strong>Renewal Options:</strong></p>
          <ul>
            <li>Renew online through your library account</li>
            <li>Call the library at extension 4321</li>
            <li>Visit the library circulation desk</li>
          </ul>
          <p>Items can be renewed up to 2 times if there are no holds. This item currently has no holds and is eligible for renewal.</p>
          <p>Library Hours:<br>
          Monday-Thursday: 7:30 AM - 5:00 PM<br>
          Friday: 7:30 AM - 4:00 PM<br>
          Sunday: 2:00 PM - 5:00 PM (Study Hall only)</p>
        `;
      
      case 'notif-10': // Science Project Deadline Extended
        return `
          <p>Good news for Science Fair participants!</p>
          <p>The Science Department has extended the submission deadline for science fair projects.</p>
          <p><strong>Updated Information:</strong></p>
          <ul>
            <li><strong>New Deadline:</strong> Wednesday, November 15th by 4:00 PM</li>
            <li><strong>Original Deadline:</strong> Friday, November 3rd</li>
            <li><strong>Submission Location:</strong> Science Department Office (Room S101) or online through the Science Fair portal</li>
          </ul>
          <p><strong>Reason for Extension:</strong></p>
          <p>This extension is being provided due to the delayed arrival of specialized equipment needed for several project categories and to accommodate the recent field trip schedule conflicts.</p>
          <p><strong>Additional Support:</strong></p>
          <ul>
            <li>Science Lab will have extended hours (3:00-5:00 PM) on Tuesdays and Thursdays until the deadline</li>
            <li>Teacher mentors will be available for additional consultation during these extended hours</li>
            <li>A supplementary workshop on "Data Visualization for Science Projects" will be held on November 7th at lunch in Room S204</li>
          </ul>
          <p>All other science fair requirements and judging criteria remain unchanged. Please see the Science Fair Guidelines document for complete details.</p>
        `;
      
      case 'notif-11': // Parent-Teacher Conference
        return `
          <p><strong>Parent-Teacher Conference Information</strong></p>
          <p>Our fall Parent-Teacher Conferences are scheduled for Friday, November 3rd from 3:00 PM to 7:00 PM.</p>
          <p>These conferences provide an important opportunity for parents and teachers to discuss student progress, strengths, areas for growth, and strategies for academic success.</p>
          <p><strong>Conference Details:</strong></p>
          <ul>
            <li><strong>Date:</strong> Friday, November 3rd</li>
            <li><strong>Time:</strong> 3:00 PM - 7:00 PM</li>
            <li><strong>Location:</strong> Individual teacher classrooms</li>
            <li><strong>Format:</strong> 10-minute individual conferences</li>
          </ul>
          <p><strong>Scheduling:</strong></p>
          <p>Parents can book conference slots online through the Parent Portal. The scheduling system will open on October 25th at 8:00 AM and close on November 2nd at 12:00 PM.</p>
          <p>Please note that time slots are limited and fill up quickly. We recommend booking as soon as the system opens.</p>
          <p><strong>Preparation:</strong></p>
          <p>To make the most of the brief conference time:</p>
          <ul>
            <li>Review your current grades and assignments before the conference</li>
            <li>Prepare specific questions for your teachers</li>
            <li>Consider attending with your parents if possible</li>
          </ul>
          <p>If your parents cannot attend in person, virtual conference options are available upon request.</p>
        `;
      
      default:
        return `<p>Select a notification to view its details.</p>`;
    }
  }
  
  /**
   * Select a notification and display its details
   * @param {string} id - Notification ID
   */
  function selectNotification(id) {
    // Get notification data
    const notificationData = state.notificationData.get(id);
    if (!notificationData) return;
    
    // Update state
    state.selectedNotificationId = id;
    
    // Update UI - remove selected class from all notifications
    document.querySelectorAll('.notification-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    // Add selected class to the selected notification
    const notificationElement = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (notificationElement) {
      notificationElement.classList.add('selected');
      
      // For mobile view, show the detail panel
      if (elements.detailPanel && window.innerWidth <= 992) {
        elements.detailPanel.classList.add('active');
      }
    }
    
    // Update detail panel
    updateDetailPanel(notificationData);
    
    // Mark as read if unread
    if (notificationData.isUnread) {
      handleReadUnreadAction(id, true);
    }
  }
  
  /**
   * Update the detail panel with notification data
   * @param {Object} notificationData - Notification data object
   */
  function updateDetailPanel(notificationData) {
    const detailTitle = document.querySelector('.detail-title');
    const detailTime = document.querySelector('.detail-time');
    const detailPriority = document.querySelector('.detail-priority');
    const detailContent = document.querySelector('.detail-content');
    
    if (!detailTitle || !detailTime || !detailPriority || !detailContent) return;
    
    // Update title
    detailTitle.textContent = notificationData.title;
    
    // Format time
    if (notificationData.time.includes('AM') || notificationData.time.includes('PM')) {
      detailTime.textContent = `Today, ${notificationData.time}`;
    } else {
      detailTime.textContent = notificationData.time;
    }
    
    // Update priority - use chip style
    detailPriority.className = 'priority-indicator';
    if (notificationData.priority === 'high') {
      detailPriority.classList.add('high');
    } else if (notificationData.priority === 'medium') {
      detailPriority.classList.add('medium');
    } else {
      detailPriority.classList.add('low');
    }
    
    // Update content with pre-generated HTML
    detailContent.innerHTML = notificationData.detailContent;
    
    // Show notification detail and hide empty state
    const noNotificationSelected = document.querySelector('.no-notification-selected');
    const notificationDetail = document.querySelector('.notification-detail');
    
    if (noNotificationSelected) {
      noNotificationSelected.style.display = 'none';
    }
    
    if (notificationDetail) {
      notificationDetail.style.display = 'flex';
    }
  }
  
  /**
   * Handle marking notification as read or unread
   * @param {string} id - Notification ID
   * @param {boolean} markAsRead - Whether to mark as read (true) or unread (false)
   */
  function handleReadUnreadAction(id, markAsRead) {
    // Get notification data
    const notificationData = state.notificationData.get(id);
    if (!notificationData) return;
    
    // Get notification element
    const notificationElement = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (!notificationElement) return;
    
    if (markAsRead) {
      // Mark as read
      if (notificationData.isUnread) {
        // Update data
        notificationData.isUnread = false;
        
        // Update DOM
        notificationElement.classList.remove('unread');
        
        // Remove unread indicator
        const unreadIndicator = notificationElement.querySelector('.unread-indicator');
        if (unreadIndicator) {
          unreadIndicator.remove();
        }
        
        // Update action button
        const readBtn = notificationElement.querySelector('.notif-action-btn[data-tooltip="Mark as read"]');
        if (readBtn) {
          readBtn.setAttribute('data-tooltip', 'Mark as unread');
          const img = readBtn.querySelector('img');
          if (img) {
            img.src = 'Assets/mark-unread.svg';
            img.alt = 'Mark as unread';
          }
        }
      }
    } else {
      // Mark as unread
      if (!notificationData.isUnread) {
        // Update data
        notificationData.isUnread = true;
        
        // Update DOM
        notificationElement.classList.add('unread');
        
        // Add unread indicator if not exists
        const statusContainer = notificationElement.querySelector('.notification-status');
        if (statusContainer && !notificationElement.querySelector('.unread-indicator')) {
          const unreadIndicator = document.createElement('div');
          unreadIndicator.className = 'unread-indicator';
          statusContainer.prepend(unreadIndicator);
        }
        
        // Update action button
        const unreadBtn = notificationElement.querySelector('.notif-action-btn[data-tooltip="Mark as unread"]');
        if (unreadBtn) {
          unreadBtn.setAttribute('data-tooltip', 'Mark as read');
          const img = unreadBtn.querySelector('img');
          if (img) {
            img.src = 'Assets/mark-read.svg';
            img.alt = 'Mark as read';
          }
        }
      }
    }
    
    // Update unread counts
    updateUnreadCounts();
  }
  
  /**
   * Handle pinning or unpinning a notification
   * @param {string} id - Notification ID
   * @param {boolean} pin - Whether to pin (true) or unpin (false)
   */
  function handlePinAction(id, pin) {
    // Get notification data
    const notificationData = state.notificationData.get(id);
    if (!notificationData) return;
    
    // Get notification element
    const notificationElement = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (!notificationElement) return;
    
    if (pin) {
      // Pin notification
      if (!notificationData.isPinned) {
        // Update data
        notificationData.isPinned = true;
        
        // Update DOM
        notificationElement.classList.add('pinned');
        
        // Add pinned indicator if not exists
        const statusContainer = notificationElement.querySelector('.notification-status');
        if (statusContainer && !notificationElement.querySelector('.pinned-indicator')) {
          const pinnedIndicator = document.createElement('div');
          pinnedIndicator.className = 'pinned-indicator';
          statusContainer.appendChild(pinnedIndicator);
        }
        
        // Update action button
        const pinBtn = notificationElement.querySelector('.notif-action-btn[data-tooltip="Pin notification"]');
        if (pinBtn) {
          pinBtn.setAttribute('data-tooltip', 'Unpin notification');
          const img = pinBtn.querySelector('img');
          if (img) {
            img.src = 'Assets/pinned.svg';
            img.alt = 'Unpin';
          }
        }
      }
    } else {
      // Unpin notification
      if (notificationData.isPinned) {
        // Update data
        notificationData.isPinned = false;
        
        // Update DOM
        notificationElement.classList.remove('pinned');
        
        // Remove pinned indicator
        const pinnedIndicator = notificationElement.querySelector('.pinned-indicator');
        if (pinnedIndicator) {
          pinnedIndicator.remove();
        }
        
        // Update action button
        const unpinBtn = notificationElement.querySelector('.notif-action-btn[data-tooltip="Unpin notification"]');
        if (unpinBtn) {
          unpinBtn.setAttribute('data-tooltip', 'Pin notification');
          const img = unpinBtn.querySelector('img');
          if (img) {
            img.src = 'Assets/pin.svg';
            img.alt = 'Pin';
          }
        }
      }
    }
    
    // Update category counts
    updateUnreadCounts();
    
    // Reapply filters if in pinned category
    if (state.activeCategory === 'pinned') {
      applyCurrentFilters();
    }
  }
  
  /**
   * Update unread notification counts in the sidebar
   */
  function updateUnreadCounts() {
    // Count unread notifications
    let totalUnread = 0;
    let pinnedUnread = 0;
    let alertsUnread = 0;
    
    // Use the state data instead of querying DOM for better performance
    state.notificationData.forEach(notification => {
      if (notification.isUnread) {
        totalUnread++;
        
        if (notification.isPinned) {
          pinnedUnread++;
        }
        
        if (notification.priority === 'high') {
          alertsUnread++;
        }
      }
    });
    
    // Update inbox count
    const inboxCount = document.querySelector('.category-item[data-category="inbox"] .unread-count');
    if (inboxCount) {
      inboxCount.textContent = totalUnread;
    }
    
    // Update pinned count
    const pinnedCount = document.querySelector('.category-item[data-category="pinned"] .unread-count');
    if (pinnedCount) {
      pinnedCount.textContent = pinnedUnread;
    }
    
    // Update alerts count
    const alertsCount = document.querySelector('.category-item[data-category="alerts"] .unread-count');
    if (alertsCount) {
      alertsCount.textContent = alertsUnread;
    }
    
    // Update notification indicator in header
    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) {
      if (totalUnread > 0) {
        notificationsBtn.classList.add('has-notification');
      } else {
        notificationsBtn.classList.remove('has-notification');
      }
    }
  }
  
  /**
   * Set up search functionality
   */
  function setupSearch() {
    if (!elements.searchInput) return;
    
    // Clear any previous search
    elements.searchInput.value = '';
    
    // Add input event listener with debounce for performance
    let searchTimeout = null;
    elements.searchInput.addEventListener('input', (e) => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      searchTimeout = setTimeout(() => {
        const searchTerm = e.target.value.toLowerCase().trim();
        state.searchTerm = searchTerm;
        searchNotifications(searchTerm);
      }, 150); // 150ms debounce delay
    });
    
    // Fix alignment issues
    elements.searchInput.style.paddingTop = '8px';
    elements.searchInput.style.paddingBottom = '8px';
  }
  
  /**
   * Search through notifications
   * @param {string} searchTerm - The search term
   */
  function searchNotifications(searchTerm) {
    // Clear visible notifications set
    state.visibleNotifications.clear();
    
    // Remove any existing empty state
    const existingEmptyState = document.querySelector('.notifications-list-content .empty-state');
    if (existingEmptyState) {
      existingEmptyState.remove();
    }
    
    // Show all date sections initially
    document.querySelectorAll('.notifications-date-section').forEach(section => {
      section.style.display = 'block';
    });
    
    if (!searchTerm) {
      // If search is empty, apply current category filter
      applyCurrentFilters();
      return;
    }
    
    // Track which date sections have visible items
    const sectionsWithVisibleItems = new Set();
    
    // Search through notifications
    state.notificationData.forEach((notification, id) => {
      const title = notification.title.toLowerCase();
      const preview = notification.preview.toLowerCase();
      const detailContent = notification.detailContent.toLowerCase();
      
      // Check if notification matches search
      const isMatch = title.includes(searchTerm) || 
                      preview.includes(searchTerm) || 
                      detailContent.includes(searchTerm);
      
      // Update notification visibility
      const element = notification.element;
      if (isMatch) {
        element.style.display = 'flex';
        state.visibleNotifications.add(id);
        
        // Track which section this belongs to
        const section = element.closest('.notifications-date-section');
        if (section) {
          sectionsWithVisibleItems.add(section);
        }
      } else {
        element.style.display = 'none';
      }
    });
    
    // Hide empty date sections
    document.querySelectorAll('.notifications-date-section').forEach(section => {
      if (!sectionsWithVisibleItems.has(section)) {
        section.style.display = 'none';
      }
    });
    
    // Show empty state if no notifications visible
    if (state.visibleNotifications.size === 0) {
      showEmptySearchState(searchTerm);
    }
    
    // Update selected notification if the currently selected one is hidden
    if (state.selectedNotificationId && 
        !state.visibleNotifications.has(state.selectedNotificationId)) {
      // Find first visible notification
      const firstVisibleId = Array.from(state.visibleNotifications)[0];
      
      if (firstVisibleId) {
        selectNotification(firstVisibleId);
      } else {
        // No visible notifications, show empty detail panel
        showEmptyDetailPanel();
      }
    }
  }
  
  /**
   * Show empty search state
   * @param {string} searchTerm - Search term that yielded no results
   */
  function showEmptySearchState(searchTerm) {
    const emptyStateTemplate = document.getElementById('empty-state-template');
    if (!emptyStateTemplate) return;
    
    const emptyState = document.importNode(emptyStateTemplate.content, true);
    const listContent = document.querySelector('.notifications-list-content');
    
    // Update empty state text
    const title = emptyState.querySelector('.empty-state-title');
    const text = emptyState.querySelector('.empty-state-text');
    const icon = emptyState.querySelector('.empty-state-icon');
    
    if (title && text && icon) {
      icon.src = 'Assets/search.svg';
      title.textContent = 'No matching notifications';
      text.textContent = `No notifications found matching "${searchTerm}"`;
    }
    
    if (listContent) {
      listContent.appendChild(emptyState);
    }
    
    // Show empty detail panel
    showEmptyDetailPanel();
  }
  
  /**
   * Set up filter functionality
   */
  function setupFilters() {
    const filterBtn = elements.filterBtn;
    const filterDropdown = filterBtn?.closest('.filter-dropdown');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (filterDropdown && filterDropdown.classList.contains('active') && 
          !filterDropdown.contains(e.target)) {
        filterDropdown.classList.remove('active');
      }
    });
    
    // Toggle filter dropdown
    if (filterBtn && filterDropdown) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterDropdown.classList.toggle('active');
      });
    }
    
    // Apply filters
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => {
        // Get selected filters
        const filters = [];
        document.querySelectorAll('.filter-option input[type="checkbox"]:checked').forEach(checkbox => {
          filters.push(checkbox.value);
        });
        
        // Update state
        state.activeFilters = filters;
        
        // Apply filters
        applyCurrentFilters();
        
        // Close dropdown
        if (filterDropdown) {
          filterDropdown.classList.remove('active');
        }
      });
    }
    
    // Reset filters
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
          checkbox.checked = false;
        });
        
        // Select unread by default
        const unreadCheckbox = document.querySelector('.filter-option input[value="unread"]');
        if (unreadCheckbox) {
          unreadCheckbox.checked = true;
        }
      });
    }
  }
  
  /**
   * Set up sort functionality
   */
  function setupSort() {
    if (!elements.sortBtn) return;
    
    elements.sortBtn.addEventListener('click', () => {
      // Toggle sort order
      state.sortAscending = !state.sortAscending;
      
      // Update sort button icon
      const sortImg = elements.sortBtn.querySelector('img');
      if (sortImg) {
        sortImg.src = state.sortAscending ? 'Assets/sort.svg' : 'Assets/sort-reverse.svg';
        elements.sortBtn.setAttribute('data-tooltip', state.sortAscending ? 'Sort by date' : 'Sort by date (reverse)');
      }
      
      // Apply sort
      sortNotifications();
    });
  }
  
  /**
   * Sort notifications by date
   */
  function sortNotifications() {
    // Get date sections
    const dateSections = document.querySelectorAll('.notifications-date-section');
    
    // Map date sections to numerical values for comparison
    const dateOrder = {
      'Today': 1,
      'Yesterday': 2,
      'This Week': 3,
      'Last Week': 4,
      'This Month': 5,
      'Older': 6
    };
    
    // Sort date sections
    const sortedSections = Array.from(dateSections).sort((a, b) => {
      const headerA = a.querySelector('.date-header').textContent.trim();
      const headerB = b.querySelector('.date-header').textContent.trim();
      
      const orderA = dateOrder[headerA] || 999;
      const orderB = dateOrder[headerB] || 999;
      
      return state.sortAscending ? orderA - orderB : orderB - orderA;
    });
    
    // Rearrange sections in the DOM using DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    const listContent = document.querySelector('.notifications-list-content');
    
    if (listContent) {
      sortedSections.forEach(section => {
        // Sort notifications within each section
        const notifications = Array.from(section.querySelectorAll('.notification-item'));
        const notificationContainer = section.querySelector('.notification-items');
        
        if (notificationContainer) {
          // Sort by ID (proxy for time within a section)
          const sortedNotifications = notifications.sort((a, b) => {
            const idA = parseInt(a.getAttribute('data-id').replace('notif-', ''));
            const idB = parseInt(b.getAttribute('data-id').replace('notif-', ''));
            
            return state.sortAscending ? idA - idB : idB - idA;
          });
          
          // Use DocumentFragment for better performance
          const notifFragment = document.createDocumentFragment();
          sortedNotifications.forEach(notification => {
            notifFragment.appendChild(notification);
          });
          
          // Clear and append
          notificationContainer.innerHTML = '';
          notificationContainer.appendChild(notifFragment);
        }
        
        fragment.appendChild(section);
      });
      
      // Clear and append all sections at once
      listContent.innerHTML = '';
      listContent.appendChild(fragment);
    }
  }
  
  /**
   * Set up mark all read functionality
   */
  function setupMarkAllRead() {
    if (!elements.markAllReadBtn) return;
    
    elements.markAllReadBtn.addEventListener('click', () => {
      // Get all unread notifications
      const unreadNotifications = [];
      
      state.notificationData.forEach((notification, id) => {
        if (notification.isUnread) {
          unreadNotifications.push(id);
        }
      });
      
      // Mark all as read
      unreadNotifications.forEach(id => {
        handleReadUnreadAction(id, true);
      });
    });
  }
  
  /**
   * Set up category selection
   */
  function setupCategorySelection() {
    const categoryItems = document.querySelectorAll('.category-item');
    
    categoryItems.forEach(item => {
      item.addEventListener('click', () => {
        // Update active state
        categoryItems.forEach(cat => cat.classList.remove('active'));
        item.classList.add('active');
        
        // Update state
        state.activeCategory = item.dataset.category;
        
        // Apply category filter
        filterByCategory(state.activeCategory);
      });
    });
  }
  
  /**
   * Apply current category and filters
   */
  function applyCurrentFilters() {
    // Apply category filter first
    filterByCategory(state.activeCategory);
    
    // Then apply additional filters if any
    if (state.activeFilters.length > 0) {
      applyAdditionalFilters();
    }
  }
  
  /**
   * Filter notifications by category
   * @param {string} category - Category to filter by
   */
  function filterByCategory(category) {
    // Clear visible notifications set
    state.visibleNotifications.clear();
    
    // Remove any existing empty state
    const existingEmptyState = document.querySelector('.notifications-list-content .empty-state');
    if (existingEmptyState) {
      existingEmptyState.remove();
    }
    
    // Show all date sections initially
    document.querySelectorAll('.notifications-date-section').forEach(section => {
      section.style.display = 'block';
    });
    
    // Track which date sections have visible items
    const sectionsWithVisibleItems = new Set();
    
    // Apply category filter
    state.notificationData.forEach((notification, id) => {
      let shouldShow = false;
      
      switch (category) {
        case 'inbox':
          // Show all notifications in inbox
          shouldShow = true;
          break;
          
        case 'pinned':
          // Show only pinned notifications
          shouldShow = notification.isPinned;
          break;
          
        case 'alerts':
          // Show only high priority notifications
          shouldShow = notification.priority === 'high';
          break;
          
        case 'unread':
          // Show only unread notifications
          shouldShow = notification.isUnread;
          break;
          
        default:
          // Filter by icon type for other categories
          shouldShow = notification.iconAlt.toLowerCase() === category;
      }
      
      // Update notification visibility
      const element = notification.element;
      if (shouldShow) {
        element.style.display = 'flex';
        state.visibleNotifications.add(id);
        
        // Track which section this belongs to
        const section = element.closest('.notifications-date-section');
        if (section) {
          sectionsWithVisibleItems.add(section);
        }
      } else {
        element.style.display = 'none';
      }
    });
    
    // Hide empty date sections
    document.querySelectorAll('.notifications-date-section').forEach(section => {
      if (!sectionsWithVisibleItems.has(section)) {
        section.style.display = 'none';
      }
    });
    
    // Show empty state if no notifications visible
    if (state.visibleNotifications.size === 0) {
      showEmptyCategoryState(category);
    }
    
    // Update selected notification if the currently selected one is hidden
    if (state.selectedNotificationId && 
        !state.visibleNotifications.has(state.selectedNotificationId)) {
      // Find first visible notification
      const firstVisibleId = Array.from(state.visibleNotifications)[0];
      
      if (firstVisibleId) {
        selectNotification(firstVisibleId);
      } else {
        // No visible notifications, show empty detail panel
        showEmptyDetailPanel();
      }
    }
  }
  
  /**
   * Apply additional filters on top of category filter
   */
  function applyAdditionalFilters() {
    // Get currently visible notifications from the category filter
    const visibleIds = new Set(state.visibleNotifications);
    
    // Clear visible notifications to rebuild
    state.visibleNotifications.clear();
    
    // Track which date sections have visible items
    const sectionsWithVisibleItems = new Set();
    
    // Apply additional filters to visible notifications
    visibleIds.forEach(id => {
      const notification = state.notificationData.get(id);
      const element = notification.element;
      
      let shouldShow = false;
      
      // Check each filter
      for (const filter of state.activeFilters) {
        switch (filter) {
          case 'unread':
            if (notification.isUnread) {
              shouldShow = true;
            }
            break;
            
          case 'pinned':
            if (notification.isPinned) {
              shouldShow = true;
            }
            break;
            
          case 'high':
            if (notification.priority === 'high') {
              shouldShow = true;
            }
            break;
            
          case 'medium':
            if (notification.priority === 'medium') {
              shouldShow = true;
            }
            break;
            
          case 'low':
            if (notification.priority === 'low') {
              shouldShow = true;
            }
            break;
        }
        
        // If any filter matches, we show the item
        if (shouldShow) break;
      }
      
      // Update notification visibility
      if (shouldShow) {
        element.style.display = 'flex';
        state.visibleNotifications.add(id);
        
        // Track which section this belongs to
        const section = element.closest('.notifications-date-section');
        if (section) {
          sectionsWithVisibleItems.add(section);
        }
      } else {
        element.style.display = 'none';
      }
    });
    
    // Hide empty date sections
    document.querySelectorAll('.notifications-date-section').forEach(section => {
      if (!sectionsWithVisibleItems.has(section)) {
        section.style.display = 'none';
      }
    });
    
    // Show empty state if no notifications visible
    if (state.visibleNotifications.size === 0) {
      showEmptyFilterState();
    }
    
    // Update selected notification if the currently selected one is hidden
    if (state.selectedNotificationId && 
        !state.visibleNotifications.has(state.selectedNotificationId)) {
      // Find first visible notification
      const firstVisibleId = Array.from(state.visibleNotifications)[0];
      
      if (firstVisibleId) {
        selectNotification(firstVisibleId);
      } else {
        // No visible notifications, show empty detail panel
        showEmptyDetailPanel();
      }
    }
  }
  
  /**
   * Show empty state for a category with no notifications
   * @param {string} category - Category name
   */
  function showEmptyCategoryState(category) {
    const emptyStateTemplate = document.getElementById('empty-state-template');
    if (!emptyStateTemplate) return;
    
    const emptyState = document.importNode(emptyStateTemplate.content, true);
    const listContent = document.querySelector('.notifications-list-content');
    
    // Update empty state text and icon based on category
    const title = emptyState.querySelector('.empty-state-title');
    const text = emptyState.querySelector('.empty-state-text');
    const icon = emptyState.querySelector('.empty-state-icon');
    
    if (title && text && icon) {
      // Use appropriate icon and text based on category
      switch (category) {
        case 'pinned':
          icon.src = 'Assets/pinned.svg';
          title.textContent = 'No pinned notifications';
          text.textContent = 'Pin important notifications to find them quickly.';
          break;
          
        case 'alerts':
          icon.src = 'Assets/alert.svg';
          title.textContent = 'No alerts';
          text.textContent = 'You don\'t have any high priority notifications.';
          break;
          
        case 'unread':
          icon.src = 'Assets/mark-unread.svg';
          title.textContent = 'No unread notifications';
          text.textContent = 'All notifications have been read.';
          break;
          
        default:
          // Use category-specific icon if available
          const categoryItem = document.querySelector(`.category-item[data-category="${category}"]`);
          if (categoryItem) {
            const categoryIcon = categoryItem.querySelector('.category-icon img');
            if (categoryIcon) {
              icon.src = categoryIcon.src;
            }
          }
          
          title.textContent = `No ${category} notifications`;
          text.textContent = `You don't have any ${category} notifications yet.`;
      }
    }
    
    if (listContent) {
      listContent.appendChild(emptyState);
    }
    
    // Show empty detail panel
    showEmptyDetailPanel();
  }
  
  /**
   * Show empty state when filters return no results
   */
  function showEmptyFilterState() {
    const emptyStateTemplate = document.getElementById('empty-state-template');
    if (!emptyStateTemplate) return;
    
    const emptyState = document.importNode(emptyStateTemplate.content, true);
    const listContent = document.querySelector('.notifications-list-content');
    
    // Update empty state text
    const title = emptyState.querySelector('.empty-state-title');
    const text = emptyState.querySelector('.empty-state-text');
    const icon = emptyState.querySelector('.empty-state-icon');
    
    if (title && text && icon) {
      icon.src = 'Assets/filter.svg';
      title.textContent = 'No matching notifications';
      text.textContent = 'No notifications match your selected filters';
    }
    
    if (listContent) {
      listContent.appendChild(emptyState);
    }
    
    // Show empty detail panel
    showEmptyDetailPanel();
  }
  
  /**
   * Apply performance optimizations for notifications
   */
  function applyPerformanceOptimizations() {
    // 1. Use content-visibility for off-screen notification items
    document.querySelectorAll('.notification-item').forEach(item => {
      item.style.contentVisibility = 'auto';
      item.style.containIntrinsicSize = '0 80px'; // Approximate height of notification items
    });
    
    // 2. Use contain property for better rendering performance
    document.querySelectorAll('.notification-item, .notifications-date-section').forEach(item => {
      item.style.contain = 'content';
    });
    
    // 3. Use hardware acceleration for animations
    const notificationsModal = document.getElementById('notifications-modal');
    if (notificationsModal) {
      notificationsModal.style.transform = 'translateZ(0)';
      notificationsModal.style.backfaceVisibility = 'hidden';
      notificationsModal.style.perspective = '1000px';
    }
    
    // 4. Optimize touch events for mobile
    const touchSurfaces = [
      '.notifications-sidebar-content',
      '.notifications-list-content',
      '.detail-content'
    ];
    
    touchSurfaces.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        element.style.touchAction = 'pan-y';
        element.style.webkitOverflowScrolling = 'touch';
      }
    });
    
    // 5. Reduce paint complexity with will-change
    const notificationContainer = document.querySelector('.notifications-modal-container');
    if (notificationContainer) {
      notificationContainer.style.willChange = 'transform';
    }
    
    // 6. Add passive event listeners for better scroll performance
    document.querySelectorAll('.notifications-list-content, .notifications-sidebar-content, .detail-content')
      .forEach(element => {
        element.addEventListener('scroll', () => {}, { passive: true });
        element.addEventListener('touchstart', () => {}, { passive: true });
        element.addEventListener('touchmove', () => {}, { passive: true });
      });
    
    // 7. Optimize filter dropdown menu
    const filterDropdown = document.querySelector('.filter-dropdown-menu');
    if (filterDropdown) {
      filterDropdown.style.willChange = 'opacity, transform';
      filterDropdown.style.transform = 'translateZ(0)';
    }
    
    // 8. Use requestAnimationFrame for smoother animations
    const animateElements = document.querySelectorAll('.notification-item, .detail-content');
    animateElements.forEach(el => {
      el.style.transition = 'none'; // Temporarily disable transitions
      
      // Re-enable transitions on next frame for smoother rendering
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = '';
        });
      });
    });
    
    // 9. Optimize detail panel rendering
    const detailContent = document.querySelector('.detail-content');
    if (detailContent) {
      detailContent.style.contentVisibility = 'auto';
      detailContent.style.contain = 'content';
    }
    
    // 10. Add intersection observer for lazy loading notification content
    if ('IntersectionObserver' in window) {
      const options = {
        root: document.querySelector('.notifications-list-content'),
        rootMargin: '100px',
        threshold: 0.1
      };
      
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const notificationItem = entry.target;
            
            // Add higher quality rendering for visible notifications
            notificationItem.style.contentVisibility = 'visible';
            notificationItem.classList.add('fully-rendered');
            
            // Stop observing this element
            observer.unobserve(notificationItem);
          }
        });
      }, options);
      
      // Observe all notification items
      document.querySelectorAll('.notification-item').forEach(item => {
        observer.observe(item);
      });
    }
    
    // 11. Optimize CSS animations
    document.body.classList.add('optimize-animations');
    
    // 12. Use passive event listeners for all notification interactions
    document.querySelectorAll('.notification-item, .notif-action-btn, .detail-action-btn')
      .forEach(element => {
        const existingClickListeners = element.onclick;
        
        // Remove existing listeners and add new passive ones
        element.onclick = null;
        element.addEventListener('click', (e) => {
          if (existingClickListeners) {
            existingClickListeners.call(element, e);
          }
        }, { passive: true });
      });
  }
}
