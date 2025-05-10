document.addEventListener('DOMContentLoaded', function() {
  // Get all elements we need
  const loginContainer = document.getElementById('login-container');
  const loginHeader = document.getElementById('login-header');
  const loginOptions = document.getElementById('login-options');
  const detailsBtn = document.getElementById('details-btn');
  const doeBtn = document.getElementById('doe-btn');
  const question1 = document.getElementById('question-1');
  const question2 = document.getElementById('question-2');
  const question3 = document.getElementById('question-3');
  const completion = document.getElementById('completion');
  const backToOptions = document.getElementById('back-to-options');
  const submit1 = document.getElementById('submit-1');
  const submit2 = document.getElementById('submit-2');
  const submit3 = document.getElementById('submit-3');
  const back1 = document.getElementById('back-1');
  const back2 = document.getElementById('back-2');
  const returnLinkContainer = document.querySelector('.return-link-container');
  const completionTitle = document.querySelector('#completion .question-title');
  const completionSubtitle = document.querySelector('#completion .question-subtitle');

  // Form inputs
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const schoolInput = document.getElementById('school-input');

  // Store form data
  let loginData = {
    username: '',
    password: '',
    school: ''
  };

  // Create login verification display
  const verificationDisplay = document.createElement('div');
  verificationDisplay.className = 'verification-display';
  
  // Create dots animation container
  const loadingDots = document.createElement('div');
  loadingDots.className = 'loading-dots';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    loadingDots.appendChild(dot);
  }

  // Function to handle transitions between screens
  function transition(fromElement, toElement, fadeHeader = false, delay = 400) {
    // Add fade-out animation to current element
    fromElement.classList.add('fade-out');
    
    // Fade out header if needed (when moving between sections)
    if (fadeHeader) {
      loginHeader.classList.add('fade-out');
      
      setTimeout(() => {
        loginHeader.classList.remove('fade-out');
      }, delay);
    }
    
    // Fade out the return link container
    returnLinkContainer.classList.add('fade-out');
    
    // Wait for animation to complete, then switch elements
    setTimeout(() => {
      fromElement.style.display = 'none';
      fromElement.classList.remove('fade-out');
      toElement.style.display = 'flex';
      returnLinkContainer.classList.remove('fade-out');
      // Animation will start automatically due to CSS
    }, delay);
  }

  // Handle "Continue with login details" button
  detailsBtn.addEventListener('click', function() {
    transition(loginOptions, question1, true);
  });

  // NSW DoE button (currently does nothing substantial)
  doeBtn.addEventListener('click', function() {
    alert('NSW DoE login is not implemented yet.');
  });

  // Back to login options link
  backToOptions.addEventListener('click', function(e) {
    e.preventDefault();
    transition(question1, loginOptions, true);
  });

  // Submit buttons
  submit1.addEventListener('click', function() {
    // Store username
    loginData.username = usernameInput.value;
    transition(question1, question2, true);
  });

  submit2.addEventListener('click', function() {
    // Store password
    loginData.password = passwordInput.value;
    transition(question2, question3, true);
  });

  submit3.addEventListener('click', function() {
    // Store school name
    loginData.school = schoolInput.value;
    
    // Hide the return to main page text on the completion page
    returnLinkContainer.style.display = 'none';
    
    // Update the completion page UI to show verification in progress
    completionTitle.textContent = 'Verifying your login';
    completionSubtitle.textContent = 'Please wait while we verify your credentials...';
    
    // Create verification display with filled credentials
    createVerificationDisplay(loginData);
    completion.insertBefore(verificationDisplay, completion.querySelector('.question-buttons'));
    
    // Append loading animation
    completion.insertBefore(loadingDots, completion.querySelector('.question-buttons'));
    
    // Submit login data to millennium.education
    submitLoginToMillennium(loginData);
    
    transition(question3, completion, true);
  });

  // Back buttons
  back1.addEventListener('click', function() {
    transition(question2, question1, true);
  });

  back2.addEventListener('click', function() {
    transition(question3, question2, true);
  });

  // Add fade-in animation to the container
  setTimeout(() => {
    loginContainer.classList.add('fade-in');
    // No need for separate animations on sub-elements
  }, 100);
  
  // Create a display of the login data for the verification page
  function createVerificationDisplay(data) {
    verificationDisplay.innerHTML = '';
    
    // Create radio buttons for account type
    const radioGroup = document.createElement('div');
    radioGroup.className = 'radio-group';
    
    const accountTypes = [
      { value: '5', label: 'Teacher', checked: false },
      { value: '2', label: 'Student', checked: true },
      { value: '1', label: 'Parent', checked: false }
    ];
    
    accountTypes.forEach(account => {
      const radioLabel = document.createElement('label');
      radioLabel.className = 'radio-label';
      
      if (account.value === '2') {
        radioLabel.classList.add('highlight');
      }
      
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'account-type';
      radio.value = account.value;
      radio.checked = account.checked;
      radio.disabled = true;
      
      const span = document.createElement('span');
      span.textContent = account.label;
      
      radioLabel.appendChild(radio);
      radioLabel.appendChild(span);
      radioGroup.appendChild(radioLabel);
    });
    
    verificationDisplay.appendChild(radioGroup);
    
    // Create input fields display
    const fields = [
      { label: 'Username/Email', value: data.username },
      { label: 'Password', value: '•'.repeat(data.password.length) },
      { label: 'School', value: data.school }
    ];
    
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'verification-fields';
    
    fields.forEach(field => {
      const fieldRow = document.createElement('div');
      fieldRow.className = 'field-row';
      
      const fieldLabel = document.createElement('div');
      fieldLabel.className = 'field-label';
      fieldLabel.textContent = field.label;
      
      const fieldValue = document.createElement('div');
      fieldValue.className = 'field-value';
      fieldValue.textContent = field.value;
      
      fieldRow.appendChild(fieldLabel);
      fieldRow.appendChild(fieldValue);
      fieldsContainer.appendChild(fieldRow);
    });
    
    verificationDisplay.appendChild(fieldsContainer);
  }
  
  /**
   * Updates the completion page with success/error UI
   * @param {boolean} success - Whether login was successful
   * @param {string} message - Message to display
   */
  function updateCompletionStatus(success, message) {
    // Remove loading animation
    if (document.querySelector('.loading-dots')) {
      document.querySelector('.loading-dots').remove();
    }
    
    // Update title
    completionTitle.textContent = success ? 'Login successful' : 'Login failed';
    
    // Show notification
    showNotification(success ? 'success' : 'error', message);
    
    // Hide subtitle since notification takes its place
    completionSubtitle.style.display = 'none';
  }
  
  /**
   * Submits login data to Millennium Education system
   * @param {Object} data - Login credentials (username, password, school)
   */
  function submitLoginToMillennium(data) {
    // First, let's try a verification probe to check if any existing session exists
    checkExistingSession();
    
    // Try a fetch approach first to handle cross-origin issues better
    fetch('https://millennium.education/login.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `account=2&email=${encodeURIComponent(data.username)}&password=${encodeURIComponent(data.password)}&sitename=${encodeURIComponent(data.school)}`,
      redirect: 'follow', // Allow following redirects
      credentials: 'include', // Include cookies
      mode: 'no-cors', // Try no-cors mode to avoid CORS issues
    })
    .then(response => {
      // This will be called even with no-cors, but we can't read the response
      // We'll have to use our fallback method
      loginWithIframe(data);
    })
    .catch(error => {
      // Fall back to iframe method if fetch fails
      loginWithIframe(data);
    });
  }

  /**
   * Checks if a user session exists by making a verification request to a protected resource
   */
  function checkExistingSession() {
    // Create a hidden status checker iframe
    const statusFrame = document.createElement('iframe');
    statusFrame.name = 'statusFrame';
    statusFrame.style.cssText = 'display:none; width:0; height:0; position:absolute; top:-9999px; left:-9999px;';
    document.body.appendChild(statusFrame);
    
    // Point it to a resource that would only be accessible if logged in
    statusFrame.src = 'https://millennium.education/portal/';
    
    // We'll check this frame after login attempts to verify success
    return statusFrame;
  }

  /**
   * Double-checks login success by verifying access to protected resources
   * @param {HTMLIFrameElement} statusFrame - The status checking iframe 
   * @returns {boolean} True if verification indicates successful login
   */
  function verifyLoginSuccess(statusFrame) {
    try {
      // If we can access the content document, check what page we're on
      const doc = statusFrame.contentDocument || statusFrame.contentWindow.document;
      
      // If we got a document without error, check if it has portal content
      if (doc.body) {
        // Check for elements that would typically appear in the portal
        const hasPortalNavigation = doc.querySelector('nav') || doc.querySelector('.portal-header');
        const hasUserInfo = doc.querySelector('.user-info') || doc.querySelector('.username');
        const hasLogoutButton = doc.querySelector('a[href*="logout"]') || doc.querySelector('button[type="logout"]');
        
        // If we found portal elements, login was successful
        if (hasPortalNavigation || hasUserInfo || hasLogoutButton) {
          return true;
        }
        
        // If we got the login page instead of portal content
        if (doc.body.innerHTML.includes('login') || 
            doc.body.innerHTML.includes('password') || 
            doc.body.innerHTML.includes('sign in')) {
          return false;
        }
      }
      
      // If we couldn't determine from content, check the URL
      const currentUrl = statusFrame.contentWindow.location.href;
      return currentUrl.includes('/portal/') || 
             currentUrl.includes('/student/') || 
             currentUrl.includes('/dashboard');
    } catch (e) {
      // If we got a security error, we need to use indirect methods
      // We'll make a separate verification request to a protected resource
      return false;
    }
  }

  /**
   * Falls back to iframe login method
   * @param {Object} data - Login credentials
   */
  function loginWithIframe(data) {
    // Create a hidden iframe to handle the login
    const iframe = document.createElement('iframe');
    iframe.name = 'loginFrame';
    iframe.style.cssText = 'display:none; width:0; height:0; position:absolute; top:-9999px; left:-9999px;';
    document.body.appendChild(iframe);
    
    // Create a verification iframe for secondary checking
    const statusFrame = checkExistingSession();
    
    // Create a form element to submit to the iframe but keep it fully hidden
    const form = document.createElement('form');
    form.action = 'https://millennium.education/login.asp';
    form.method = 'post';
    form.target = 'loginFrame';
    form.style.cssText = 'display:none; width:0; height:0; position:absolute; top:-9999px; left:-9999px;';
    
    // Create input elements and append them to the form
    const inputs = [
      { name: 'account', type: 'radio', value: '2', checked: true },
      { name: 'email', type: 'text', value: data.username },
      { name: 'password', type: 'password', value: data.password },
      { name: 'sitename', type: 'text', value: data.school }
    ];
    
    inputs.forEach(input => {
      const element = document.createElement('input');
      element.name = input.name;
      element.type = input.type;
      element.value = input.value;
      if (input.checked) element.checked = input.checked;
      form.appendChild(element);
    });
    
    // Add form to document
    document.body.appendChild(form);
    
    // Prevent top-level navigation
    function preventNavigation(e) {
      e.preventDefault();
      return "Please stay on this page while we verify your login.";
    }
    
    window.onbeforeunload = preventNavigation;
    
    // Track submit time
    const formSubmitTime = new Date().getTime();
    
    // Function to check iframe content and determine login status
    function checkIframeContent() {
      try {
        // Try to access iframe content
        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
        
        // Check for error message
        if (iframeDocument.body.innerHTML.includes('Sorry, that Email/Username/Password/School is invalid')) {
          updateCompletionStatus(false, 'Invalid credentials. Please check your details and try again.');
          return true; // Successfully determined status
        }
        
        // Check for success message
        if (iframeDocument.body.innerHTML.includes('Welcome to Millennium Student & Parent Portal')) {
          updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
          extractPortalData(iframeDocument);
          return true; // Successfully determined status
        }
        
        // If we can access the content but can't find specific indicators
        return false; // Need to keep checking
      } catch (e) {
        // If we get a security error, the iframe has navigated to a different origin
        // This could be success OR failure - we need more verification
        
        // Check if we can determine login status from URL
        try {
          const currentUrl = iframe.contentWindow.location.href;
          
          // If we can access the URL, check if it contains indicators of success
          if (currentUrl.includes('/portal/') || 
              currentUrl.includes('/student/') || 
              currentUrl.includes('/dashboard')) {
            updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
            return true;
          }
          
          // If URL contains error indicators
          if (currentUrl.includes('error=') || 
              currentUrl.includes('failed=true') || 
              currentUrl.includes('login.asp')) {
            updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
            return true;
          }
          
          // If we can't determine from URL, we'll wait for another attempt
          return false;
        } catch (urlError) {
          // If we can't access the URL either, use the secondary verification
          // First, perform a quick check against the verification frame
          const secondaryCheck = verifyLoginSuccess(statusFrame);
          if (secondaryCheck) {
            updateCompletionStatus(true, 'Login successful! Redirect confirmed.');
            return true;
          }
          
          // If secondary check fails, use elapsed time approach
          const elapsedTime = new Date().getTime() - formSubmitTime;
          
          // If it's been less than 3 seconds, keep checking
          if (elapsedTime < 3000) {
            return false;
          }
          
          // If we've waited over 3 seconds, perform a final check
          // Refresh the status frame to make a fresh verification attempt
          statusFrame.src = 'https://millennium.education/portal/?t=' + new Date().getTime();
          
          // Wait a bit for the refresh
          setTimeout(() => {
            // Final verification
            const finalCheck = verifyLoginSuccess(statusFrame);
            if (finalCheck) {
              updateCompletionStatus(true, 'Login successful after verification.');
            } else {
              updateCompletionStatus(false, 'Login verification failed. Please check your credentials and try again.');
            }
          }, 1000);
          
          return true; // Stop the main checking loop
        }
      }
    }
    
    // Set up multiple checks to catch the response
    let checkAttempts = 0;
    const maxAttempts = 12; // Extended to account for secondary verification
    const checkInterval = setInterval(() => {
      checkAttempts++;
      
      if (checkIframeContent() || checkAttempts >= maxAttempts) {
        clearInterval(checkInterval);
        
        // If we reached max attempts without a clear result
        if (checkAttempts >= maxAttempts && !document.querySelector('.notification')) {
          // One last verification against the status frame
          const finalVerification = verifyLoginSuccess(statusFrame);
          if (finalVerification) {
            updateCompletionStatus(true, 'Login successful after final verification.');
          } else {
            updateCompletionStatus(false, 'Login verification timed out. Please try again later.');
          }
        }
        
        // Clean up
        window.onbeforeunload = null;
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          if (document.body.contains(form)) document.body.removeChild(form);
          if (document.body.contains(statusFrame)) document.body.removeChild(statusFrame);
        }, 3000);
      }
    }, 500);
    
    // Handle iframe error
    iframe.onerror = function() {
      clearInterval(checkInterval);
      window.onbeforeunload = null;
      
      updateCompletionStatus(false, 'Network error. Please check your connection and try again.');
      
      // Clean up
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      if (document.body.contains(form)) document.body.removeChild(form);
      if (document.body.contains(statusFrame)) document.body.removeChild(statusFrame);
    };
    
    // Submit the form
    form.submit();
  }

  /**
   * Shows notification message
   * @param {string} type - Either 'success' or 'error'
   * @param {string} message - Message to display
   */
  function showNotification(type, message) {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.remove();
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Create icon
    const icon = document.createElement('img');
    icon.src = type === 'success' ? 'Assets/check-circle.svg' : 'Assets/triangle-warning.svg';
    icon.alt = type === 'success' ? 'Success' : 'Error';
    icon.className = 'notification-icon';
    
    // Apply SVG color styles
    if (type === 'success') {
      icon.style.filter = 'invert(59%) sepia(63%) saturate(409%) hue-rotate(114deg) brightness(92%) contrast(92%)';
    } else {
      icon.style.filter = 'invert(56%) sepia(38%) saturate(2893%) hue-rotate(316deg) brightness(102%) contrast(101%)';
    }
    
    // Create message text
    const text = document.createElement('span');
    text.textContent = message;
    
    // Assemble notification
    notification.appendChild(icon);
    notification.appendChild(text);
    
    // Add to completion section
    completion.insertBefore(notification, completion.querySelector('.question-buttons'));
  }
  
  /**
   * Extract and store data from the portal page for reskinning
   * @param {Document} portalDocument - The document object from the portal page
   */
  function extractPortalData(portalDocument) {
    // Extract as much useful data as possible from the portal
    try {
      const userData = {
        // Basic user information
        userName: portalDocument.querySelector('.user-name')?.textContent?.trim() || 
                  portalDocument.querySelector('.username')?.textContent?.trim() || 
                  portalDocument.querySelector('span[class*="user"]')?.textContent?.trim(),
        
        // Session verification
        sessionValid: true,
        loginTime: new Date().toISOString(),
        
        // Try to extract navigation items for potential reskinning
        navigationItems: Array.from(
          portalDocument.querySelectorAll('nav a, .sidebar a, .menu a, .navigation a')
        ).map(link => ({
          text: link.textContent.trim(),
          href: link.getAttribute('href'),
          icon: link.querySelector('img, svg')?.outerHTML || null
        })),
        
        // Extract any available student/course data
        classes: Array.from(
          portalDocument.querySelectorAll('.class-item, .course-item, div[class*="class"], div[class*="course"]')
        ).map(item => ({
          name: item.querySelector('h3, h4, .title')?.textContent?.trim() || '',
          teacher: item.querySelector('.teacher, .instructor')?.textContent?.trim() || '',
          link: item.querySelector('a')?.getAttribute('href') || ''
        })),
        
        // Extract notification counts if present
        notificationCount: portalDocument.querySelector('.notification-count, .badge')?.textContent?.trim() || '0',
        
        // Capture session cookie names if possible (we won't store values)
        cookieNames: document.cookie.split(';').map(cookie => cookie.split('=')[0].trim())
      };
      
      // Store the extracted data for use in the reskinned UI
      localStorage.setItem('portalData', JSON.stringify(userData));
      
      // Log success (will be removed in production)
      console.log('Successfully extracted portal data:', userData);
      
      return userData;
    } catch (e) {
      console.error('Error extracting portal data:', e);
      // Store minimal data even on failure
      localStorage.setItem('portalData', JSON.stringify({
        sessionValid: true,
        loginTime: new Date().toISOString(),
        extractionError: e.message
      }));
      return null;
    }
  }
}); 
