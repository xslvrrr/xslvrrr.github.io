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
  
  // Setup account dropdown menu
  setupUserDropdown();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Setup search modal
  setupSearchModal();
  
  // Setup logout confirmation
  setupLogoutConfirmation();
  
  // Show welcome screen for first-time users
  checkFirstTimeUser();
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
  
  // Debug state to track loaded content (would be replaced with actual API calls)
  const loadedContent = new Set(['home']);
  
  navItems.forEach(item => {
    const link = item.querySelector('.nav-link');
    
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Get the target section from href
      const targetSection = this.getAttribute('href').substring(1);
      
      // Update active state
      navItems.forEach(navItem => navItem.classList.remove('active'));
      item.classList.add('active');
      
      // Update page title
      if (pageTitle) {
        pageTitle.textContent = this.querySelector('span:last-child').textContent;
      }
      
      // Simulate content loading (in a real app, this would load actual content)
      simulateContentLoading(targetSection, loadedContent);
    });
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
  
  if (!userProfile || !userDropdown) return;
  
  // Toggle dropdown on user profile click
  userProfile.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing the dropdown
    userDropdown.classList.toggle('active');
  });
  
  // Handle preferences option click
  if (preferencesOption) {
    preferencesOption.addEventListener('click', () => {
      userDropdown.classList.remove('active');
      alert('Preferences functionality would be implemented here.');
    });
  }
  
  // Handle logout option click
  if (logoutOption) {
    logoutOption.addEventListener('click', () => {
      userDropdown.classList.remove('active');
      showLogoutConfirmation();
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (userDropdown.classList.contains('active') && !userProfile.contains(e.target)) {
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
  
  // Demo search results
  const results = [
    { title: 'Home', description: 'Go to homepage', icon: 'home-icon.svg', action: () => navigateTo('home') },
    { title: 'Classes', description: 'View your classes', icon: 'classes-icon.svg', action: () => navigateTo('classes') },
    { title: 'Timetable', description: 'View your schedule', icon: 'timetable-icon.svg', action: () => navigateTo('timetable') },
    { title: 'Preferences', description: 'Change your settings', icon: 'preferences-icon.svg', action: () => alert('Preferences would open here') },
    { title: 'Log out', description: 'Sign out of your account', icon: 'cross.svg', action: () => showLogoutConfirmation() }
  ];
  
  results.forEach(result => {
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
}

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
 * Setup the search modal
 */
function setupSearchModal() {
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-modal-input');
  
  if (!searchModal || !searchInput) return;
  
  // Update the shortcut key based on OS
  updateShortcutKeyDisplay();
  
  // Close when clicking outside the modal content
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) {
      searchModal.classList.remove('active');
    }
  });
  
  // Handle input for search filtering
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
    const results = document.querySelectorAll('.search-result');
    
    results.forEach(result => {
      const title = result.querySelector('.search-result-title').textContent.toLowerCase();
      const description = result.querySelector('.search-result-description').textContent.toLowerCase();
      
      if (title.includes(query) || description.includes(query)) {
        result.style.display = 'flex';
      } else {
        result.style.display = 'none';
      }
    });
  });
  
  // Handle arrow key navigation and enter selection
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
      
      case 'Enter':
        e.preventDefault();
        if (currentIndex >= 0) {
          results[currentIndex].click();
        } else if (results.length > 0) {
          results[0].click();
        }
        break;
    }
  });
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
  const continueBtn = document.getElementById('welcome-continue-btn');
  const disableConfetti = document.getElementById('disable-confetti');
  const userOs = document.getElementById('user-os-name');
  const shortcutsList = document.getElementById('shortcuts-list');
  
  if (!welcomeModal || !continueBtn || !disableConfetti || !userOs || !shortcutsList) return;
  
  // Detect OS
  const osName = detectOS();
  userOs.textContent = osName;
  
  // Add shortcuts based on OS
  populateShortcuts(shortcutsList, osName);
  
  // Show the welcome screen
  welcomeModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Prevent scrolling
  
  // Handle continue button
  continueBtn.addEventListener('click', () => {
    // Mark as seen
    localStorage.setItem('millenniumWelcomeShown', 'true');
    
    // Remove modal with animation
    welcomeModal.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    welcomeModal.style.transform = 'scale(0.8)';
    welcomeModal.style.opacity = '0';
    
    // Re-enable scrolling
    document.body.style.overflow = '';
    
    setTimeout(() => {
      welcomeModal.classList.remove('active');
      welcomeModal.style.transform = '';
      welcomeModal.style.opacity = '';
      
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
 * Show confetti animation
 */
function showConfetti() {
  // Create confetti pieces
  const colors = ['#ff577f', '#ff884b', '#ffd384', '#fff9b0', '#7761ff', '#34b3f1', '#39c5bb', '#51cf66'];
  const confettiCount = 100;
  const confettiContainer = document.createElement('div');
  confettiContainer.id = 'confetti-container';
  document.body.appendChild(confettiContainer);
  
  // Create confetti pieces
  for (let i = 0; i < confettiCount; i++) {
    createConfettiPiece(confettiContainer, colors);
  }
  
  // Clean up after animation completes
  setTimeout(() => {
    if (confettiContainer.parentNode) {
      confettiContainer.parentNode.removeChild(confettiContainer);
    }
  }, 4000);
}

/**
 * Create a confetti piece
 * @param {HTMLElement} container - Container to add confetti to
 * @param {Array} colors - Array of colors
 */
function createConfettiPiece(container, colors) {
  const piece = document.createElement('div');
  piece.className = 'confetti-piece';
  
  // Random properties
  const size = Math.random() * 10 + 5;
  const color = colors[Math.floor(Math.random() * colors.length)];
  const left = Math.random() * 100 + 'vw';
  const duration = Math.random() * 3 + 2;
  const delay = Math.random() * 0.5;
  
  // Set styles
  piece.style.width = `${size}px`;
  piece.style.height = `${size}px`;
  piece.style.backgroundColor = color;
  piece.style.left = left;
  piece.style.animation = `confetti-fall ${duration}s linear ${delay}s forwards`;
  
  // Add to container
  container.appendChild(piece);
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
