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
  
  // Initialize performance optimizations
  initPerformanceOptimizations();
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
  [
    'home-icon.svg',
    'account-icon.svg',
    'notices-icon.svg',
    'calendar-icon.svg',
    'classes-icon.svg',
    'timetable-icon.svg',
    'reports-icon.svg',
    'attendance-icon.svg'
  ].forEach(icon => prefetch(`Assets/${icon}`));
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
