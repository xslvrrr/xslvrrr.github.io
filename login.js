document.addEventListener('DOMContentLoaded', function() {
  // Get all elements we need
  const loginContainer = document.getElementById('login-container');
  const loginHeader = document.getElementById('login-header');
  const loginOptions = document.getElementById('login-options');
  const detailsBtn = document.getElementById('details-btn');
  const doeBtn = document.getElementById('doe-btn');
  const debugBtn = document.getElementById('debug-btn');
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

  // Debug mode settings
  const debugMode = true; // Set to true to enable debug login
  const debugCredentials = {
    username: 'debug',
    password: 'debug123',
    school: 'Test School'
  };

  // Check for debug query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isDebugLogin = urlParams.get('debug') === 'true';

  // Auto login for debug with query param
  if (debugMode && isDebugLogin) {
    setTimeout(() => {
      loginContainer.classList.add('fade-in');
      localStorage.setItem('millenniumDebugSession', JSON.stringify({
        loggedIn: true,
        isDebug: true,
        username: debugCredentials.username,
        school: debugCredentials.school,
        timestamp: new Date().toISOString()
      }));
      window.location.href = 'dashboard.html';
    }, 100);
    return;
  }

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

  // Handle debug login button click
  if (debugBtn) {
    debugBtn.addEventListener('click', function() {
      // Create debug session
      localStorage.setItem('millenniumDebugSession', JSON.stringify({
        loggedIn: true,
        isDebug: true,
        username: debugCredentials.username,
        school: debugCredentials.school,
        timestamp: new Date().toISOString()
      }));
      
      // Show transition message
      completionTitle.textContent = 'Debug Login Successful';
      completionSubtitle.textContent = 'Redirecting to dashboard...';
      
      // Hide return link during transition
      returnLinkContainer.style.display = 'none';
      
      // Transition to completion and then redirect
      transition(loginOptions, completion, true);
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
    });
  }

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
    
    // Check for debug login
    if (debugMode && loginData.username === debugCredentials.username) {
      // Pre-fill password for debug mode
      passwordInput.value = debugCredentials.password;
    }
    
    transition(question1, question2, true);
  });

  submit2.addEventListener('click', function() {
    // Store password
    loginData.password = passwordInput.value;
    
    // Check for debug login
    if (debugMode && loginData.username === debugCredentials.username && 
        loginData.password === debugCredentials.password) {
      // Pre-fill school for debug mode
      schoolInput.value = debugCredentials.school;
    }
    
    transition(question2, question3, true);
  });

  submit3.addEventListener('click', function() {
    // Store school name
    loginData.school = schoolInput.value;
    
    // Check for debug login
    if (debugMode && loginData.username === debugCredentials.username && 
        loginData.password === debugCredentials.password) {
      // Bypass actual login verification
      localStorage.setItem('millenniumDebugSession', JSON.stringify({
        loggedIn: true,
        isDebug: true,
        username: loginData.username,
        school: loginData.school,
        timestamp: new Date().toISOString()
      }));
      
      // Redirect to dashboard after short delay
      completionTitle.textContent = 'Debug Login Successful';
      completionSubtitle.textContent = 'Redirecting to dashboard...';
      transition(question3, completion, true);
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);
      
      return;
    }
    
    // Hide the return to main page text on the completion page
    returnLinkContainer.style.display = 'none';
    
    // Update the completion page UI to show verification in progress
    completionTitle.textContent = 'Verifying your login';
    completionSubtitle.textContent = 'Please wait while we verify your credentials...';
    
    // Create verification display with filled credentials
    createVerificationDisplay(loginData);
    completion.insertBefore(verificationDisplay, completion.querySelector('.question-buttons'));
    
    // Submit login data to millennium.education
    submitLoginToMillennium(loginData);
    
    // Transition to completion screen
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
    // Validate input data first
    if (!data.username || !data.password || !data.school) {
      showUnexpectedResult('All login fields must be filled in. Please try again.');
      return;
    }

    // Show loading animation
    if (!document.querySelector('.loading-dots')) {
      completion.insertBefore(loadingDots, completion.querySelector('.question-buttons'));
    }
    
    // Create a hidden iframe to handle the login
    const iframe = document.createElement('iframe');
    iframe.name = 'loginFrame';
    iframe.style.cssText = 'display:none; width:0; height:0; position:absolute;';
    document.body.appendChild(iframe);
    
    // Create a form to submit
    const form = document.createElement('form');
    form.action = 'https://millennium.education/login.asp';
    form.method = 'post';
    form.target = 'loginFrame';
    form.style.display = 'none';
    
    // Add form fields
    const inputs = [
      { name: 'account', type: 'radio', value: '2', checked: true }, // Student account
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
    
    document.body.appendChild(form);
    
    // Track login verification state
    let loginState = {
      started: false,
      finished: false,
      result: null,
      initialLoadTime: null,
      secondLoadTime: null
    };
    
    // Use a simpler detection approach - track iframe navigations
    let loadCount = 0;
    let firstUrl = null;
    
    iframe.onload = function() {
      loadCount++;
      
      // First load is the form being submitted
      if (loadCount === 1) {
        loginState.started = true;
        loginState.initialLoadTime = new Date().getTime();
        
        try {
          // Try to capture the URL, might fail due to CORS
          firstUrl = iframe.contentWindow.location.href;
        } catch (e) {
          // CORS error is expected
          console.log('CORS restriction on first load');
        }
        
        // Set a timeout to check for navigation (redirect = success, no redirect = failure)
        setTimeout(function() {
          // If we still haven't determined the result after 3 seconds,
          // check if we had a second load event (redirect)
          if (!loginState.finished) {
            if (loadCount > 1) {
              // We had a redirect, likely successful
              updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
            } else {
              // No redirect within 3 seconds, likely a failure
              updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
            }
            loginState.finished = true;
          }
        }, 3000);
      } 
      // Second load would be the redirect after successful login
      else if (loadCount === 2) {
        loginState.secondLoadTime = new Date().getTime();
        const timeDiff = loginState.secondLoadTime - loginState.initialLoadTime;
        
        // If we redirected quickly, it's a successful login
        if (timeDiff < 2000) {
          updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
        } else {
          // Try to check the URL pattern for confirmation
          try {
            const currentUrl = iframe.contentWindow.location.href;
            const successUrlPattern = /millennium\.education\/portal\/\?\d{6}/;
            
            if (successUrlPattern.test(currentUrl)) {
              updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
            } else {
              // It could be a redirect to an error page
              updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
            }
          } catch (e) {
            // Can't access URL due to CORS, but redirect happened
            // Millennium redirects to portal page on success, so this is likely success
            updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
          }
        }
        loginState.finished = true;
      }
    };
    
    // Error handler for iframe
    iframe.onerror = function() {
      if (!loginState.finished) {
        showUnexpectedResult('An error occurred during login verification.');
        loginState.finished = true;
      }
    };
    
    // Submit the form and start verification
    form.submit();
    
    // Backup timeout - if nothing happens at all, show error
    setTimeout(function() {
      if (!loginState.finished) {
        // If we got here, something unusual happened - perhaps the form didn't submit properly
        const emptyFields = !data.username || !data.password || !data.school;
        if (emptyFields) {
          updateCompletionStatus(false, 'Login failed. All fields must be filled in.');
        } else {
          showUnexpectedResult('Login verification timed out. The server may be unavailable.');
        }
        loginState.finished = true;
      }
      
      // Clean up
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      if (document.body.contains(form)) document.body.removeChild(form);
    }, 8000);
  }
  
  /**
   * Shows notification message
   * @param {string} type - Either 'success', 'error' or 'unexpected'
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
    
    if (type === 'success') {
      icon.src = 'Assets/check-circle.svg';
      icon.alt = 'Success';
      icon.style.filter = 'invert(59%) sepia(63%) saturate(409%) hue-rotate(114deg) brightness(92%) contrast(92%)';
    } else if (type === 'error') {
      icon.src = 'Assets/triangle-warning.svg';
      icon.alt = 'Error';
      icon.style.filter = 'invert(56%) sepia(38%) saturate(2893%) hue-rotate(316deg) brightness(102%) contrast(101%)';
    } else {
      icon.src = 'Assets/question-mark.svg';
      icon.alt = 'Unexpected Result';
      icon.style.filter = 'invert(50%) sepia(10%) saturate(250%) hue-rotate(180deg) brightness(90%) contrast(80%)';
    }
    
    icon.className = 'notification-icon';
    
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
   * Shows an "unexpected result" notification for unclear login states
   * @param {string} message - Message to display
   */
  function showUnexpectedResult(message) {
    // Remove loading animation
    if (document.querySelector('.loading-dots')) {
      document.querySelector('.loading-dots').remove();
    }
    
    // Update completion title
    completionTitle.textContent = 'Login status unclear';
    
    // Show notification
    showNotification('unexpected', message);
    
    // Show subtitle
    completionSubtitle.style.display = 'block';
    completionSubtitle.textContent = 'Please try again or proceed to the main page.';
  }

  /**
   * Extract and store data from the portal page for reskinning
   * @param {Document} portalDocument - The document object from the portal page
   */
  function extractPortalData(portalDocument) {
    // Basic login session metadata (mostly useful for checking login state)
    try {
      const sessionData = {
        loggedIn: true,
        timestamp: new Date().toISOString(),
        sessionId: Math.random().toString(36).substring(2, 15)
      };
      
      // Store session in localStorage
      localStorage.setItem('millenniumSession', JSON.stringify(sessionData));
      
      // This function is simplified - we're just recording that login happened
      console.log('Login data saved to session storage');
      
      return true;
    } catch (e) {
      console.error('Could not save session data:', e);
      return false;
    }
  }
}); 
