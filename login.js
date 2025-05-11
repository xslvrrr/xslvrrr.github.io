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
    // Show loading animation
    if (!document.querySelector('.loading-dots')) {
      completion.insertBefore(loadingDots, completion.querySelector('.question-buttons'));
    }
    
    // Create a form to submit
    const form = document.createElement('form');
    form.action = 'https://millennium.education/login.asp';
    form.method = 'post';
    form.target = '_blank'; // Will open in new tab but we'll intercept this
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
    
    // Use XMLHttpRequest instead of iframe
    const xhr = new XMLHttpRequest();
    
    // Function to check login
    function checkLogin() {
      const checkXhr = new XMLHttpRequest();
      
      // Instead of checking the actual portal page (which we can't due to CORS),
      // we'll check if we're still on the login page or got redirected
      checkXhr.open('GET', 'https://millennium.education/login.asp', true);
      checkXhr.withCredentials = true; // Send cookies
      
      checkXhr.onload = function() {
        // If we find the error message, login failed
        if (checkXhr.responseText.includes('Sorry, that Email/Username/Password/School is invalid')) {
          updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
        } 
        // If we don't find the login form, it likely means we're logged in
        else if (!checkXhr.responseText.includes('<form action="login.asp" method="post">')) {
          updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
        }
        // We're still on login page but no error message, could be another issue
        else {
          showUnexpectedResult('Login verification yielded unexpected results. Please try again.');
        }
      };
      
      checkXhr.onerror = function() {
        // Network error occurred, likely a CORS issue
        showUnexpectedResult('Could not verify login due to network restrictions.');
      };
      
      checkXhr.send();
    }
    
    // Instead of standard form submission, use fetch API with credentials
    fetch('https://millennium.education/login.asp', {
      method: 'POST',
      credentials: 'include',
      body: new FormData(form),
      mode: 'no-cors' // This allows the request but makes response unreadable
    })
    .then(() => {
      // We need a slight delay to allow the server to process our login attempt
      setTimeout(checkLogin, 1500);
    })
    .catch(error => {
      console.error('Login error:', error);
      // If fetch fails, try a different approach with form submission
      fallbackFormSubmission(form, data);
    });
    
    // Remove form after submission
    setTimeout(() => {
      if (document.body.contains(form)) {
        document.body.removeChild(form);
      }
    }, 1000);
  }
  
  /**
   * Fallback method for login verification when fetch fails
   * @param {HTMLFormElement} form - The form to submit
   * @param {Object} data - The login data
   */
  function fallbackFormSubmission(form, data) {
    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.name = 'loginFrame';
    iframe.style.cssText = 'display:none; width:0; height:0; position:absolute;';
    document.body.appendChild(iframe);
    
    // Set the form to target our iframe
    form.target = 'loginFrame';
    
    // Track when the iframe loads
    iframe.onload = function() {
      try {
        // This will likely fail due to CORS
        const currentUrl = iframe.contentWindow.location.href;
        const successUrlPattern = /millennium\.education\/portal\/\?\d{6}/;
        
        if (successUrlPattern.test(currentUrl)) {
          updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
          return;
        }
        
        // Try to check the document content
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc && doc.body) {
          if (doc.body.innerHTML.includes("Welcome to Millennium Student & Parent Portal")) {
            updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
            return;
          }
          
          if (doc.body.innerHTML.includes("Sorry, that Email/Username/Password/School is invalid")) {
            updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
            return;
          }
        }
      } catch (e) {
        // CORS error occurred, we need an alternative verification
        console.log('CORS restriction, using alternative verification');
        verifyLoginWithLoginPageProbe(data);
      }
    };
    
    // Submit the form
    form.submit();
    
    // Add a timeout to clean up and handle unresponsive situations
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      // If we haven't updated status yet, use our probe method
      if (document.querySelector('.loading-dots')) {
        verifyLoginWithLoginPageProbe(data);
      }
    }, 5000);
  }
  
  /**
   * Last resort verification by probing login page for presence of the form
   * - If we're redirected from login page, credentials were likely valid
   * - If we still see login form, credentials were likely invalid
   * @param {Object} data - Login data
   */
  function verifyLoginWithLoginPageProbe(data) {
    // Create a special probe request to check login state
    const probeXhr = new XMLHttpRequest();
    probeXhr.open('GET', 'https://millennium.education/login.asp', true);
    probeXhr.withCredentials = true; // Include cookies
    
    probeXhr.onload = function() {
      if (probeXhr.status === 200) {
        // If login page contains error message, login failed
        if (probeXhr.responseText.includes('Sorry, that Email/Username/Password/School is invalid')) {
          updateCompletionStatus(false, 'Login failed. Please check your credentials and try again.');
        }
        // If login page still shows the form, login likely failed
        else if (probeXhr.responseText.includes('<form action="login.asp" method="post">')) {
          updateCompletionStatus(false, 'Login verification failed. Please check your credentials and try again.');
        }
        // If neither of above, login might have succeeded
        else {
          updateCompletionStatus(true, 'Login appears successful! You can now use the redesigned interface.');
        }
      } else {
        // Unexpected status code
        showUnexpectedResult('Login verification returned an unexpected response.');
      }
    };
    
    probeXhr.onerror = function() {
      // At this point, we've tried multiple methods and can't verify
      showUnexpectedResult('Could not verify login status due to browser security restrictions.');
    };
    
    probeXhr.send();
  }
  
  /**
   * Shows an "unexpected result" notification for unclear login states
   * @param {string} message - Message to display
   */
  function showUnexpectedResult(message) {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.remove();
    });
    
    // Remove loading animation
    if (document.querySelector('.loading-dots')) {
      document.querySelector('.loading-dots').remove();
    }
    
    // Update completion title
    completionTitle.textContent = 'Login status unclear';
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification unexpected';
    
    // Create icon
    const icon = document.createElement('img');
    icon.src = 'Assets/question-mark.svg';
    icon.alt = 'Unexpected Result';
    icon.className = 'notification-icon';
    
    // Apply gray coloring to the SVG
    icon.style.filter = 'invert(50%) sepia(10%) saturate(250%) hue-rotate(180deg) brightness(90%) contrast(80%)';
    
    // Create message text
    const text = document.createElement('span');
    text.textContent = message;
    
    // Assemble notification
    notification.appendChild(icon);
    notification.appendChild(text);
    
    // Add custom gray styling
    notification.style.backgroundColor = 'rgba(75, 75, 75, 0.15)';
    notification.style.borderColor = 'rgba(75, 75, 75, 0.3)';
    notification.style.color = '#a6a6a6';
    
    // Add to completion section
    completion.insertBefore(notification, completion.querySelector('.question-buttons'));
    
    // Show subtitle
    completionSubtitle.style.display = 'block';
    completionSubtitle.textContent = 'Please try again or proceed to the main page.';
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
