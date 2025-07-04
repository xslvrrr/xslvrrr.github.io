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
});

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
    
    // Escape key to close modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
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
    { name: 'Close modals', keys: ['Esc'] },
    { name: 'Toggle sidebar collapse', keys: [`${modKey}`, 'B'] },
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
      // For demo purposes, show a confirmation dialog
      alert('You have 3 new notifications');
      
      // Remove notification indicator
      this.classList.remove('has-notification');
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
