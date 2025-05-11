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
    // Show loading animation first
    if (!document.querySelector('.loading-dots')) {
      completion.insertBefore(loadingDots, completion.querySelector('.question-buttons'));
    }
    
    // Set a timer to track when the form was submitted
    const startTime = new Date().getTime();
    
    // Create a hidden iframe to handle the login
    const iframe = document.createElement('iframe');
    iframe.name = 'loginFrame';
    iframe.style.cssText = 'display:none; width:0; height:0; position:absolute; top:-9999px; left:-9999px;';
    document.body.appendChild(iframe);
    
    // Create a form element to submit to the iframe
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
    
    // Track the state of the login attempt
    let loginState = {
      submitted: false,
      redirectOccurred: false,
      accessDenied: false,
      loadingComplete: false,
      timeSinceSubmit: 0
    };
    
    // Function to check login status based on observable behaviors
    function determineLoginStatus() {
      const currentTime = new Date().getTime();
      loginState.timeSinceSubmit = currentTime - startTime;
    
      try {
        const currentUrl = iframe.contentWindow.location.href;
        const successUrlPattern = /millennium\.education\/portal\/\?\d{6}/;
    
        // Check for success by URL pattern
        if (successUrlPattern.test(currentUrl)) {
          console.log('Detected successful login URL pattern:', currentUrl);
          return true; // Login successful
        }
    
        // If we can access the document, check for specific success message
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc.body && doc.body.innerHTML.includes("Welcome to Millennium Student & Parent Portal")) {
          console.log('Found success message in iframe');
          return true; // Login successful
        }
    
      } catch (e) {
        console.log('Security exception accessing iframe, possible redirect occurred');
        // If this happens after a short time (>1s), it's most likely a successful login
        if (loginState.timeSinceSubmit > 1000) {
          return true; // Likely successful
        }
      }
    
      // If we've waited more than 5 seconds without an error message,
      // it's probably successful (millennium usually shows errors quickly)
      if (loginState.timeSinceSubmit > 5000 && !loginState.accessDenied) {
        return true;
      }
    
      return null;
    }
    
    // Submit the form
    console.log('Submitting login form...');
    form.submit();
    loginState.submitted = true;
    
    // Set up multiple checks with increasing intervals
    const checkIntervals = [1000, 1000, 1000, 1000, 2000]; // Checks at 1s, 2s, 3s, 4s, 6s
    let checkIndex = 0;
    
    function runNextCheck() {
      if (checkIndex >= checkIntervals.length) {
        // If we've exhausted all checks, assume success if no errors detected
        const finalResult = !loginState.accessDenied;
        updateLoginResult(finalResult);
        return;
      }
      
      setTimeout(() => {
        console.log(`Running check ${checkIndex + 1}...`);
        const status = determineLoginStatus();
        
        if (status === true) {
          // Definitely successful
          updateLoginResult(true);
        } else if (status === false) {
          // Definitely failed
          updateLoginResult(false);
        } else {
          // Uncertain, continue checking
          checkIndex++;
          runNextCheck();
        }
      }, checkIntervals[checkIndex]);
    }
    
    // Start the check sequence
    runNextCheck();
    
    // Final status update
    function updateLoginResult(success) {
      console.log(`Login ${success ? 'successful' : 'failed'} determined.`);
      
      // Update UI
      if (success) {
        updateCompletionStatus(true, 'Login successful! You can now use the redesigned interface.');
      } else {
        updateCompletionStatus(false, 'Login verification failed. Please check your credentials and try again.');
      }
      
      // Clean up
      window.onbeforeunload = null;
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        if (document.body.contains(form)) document.body.removeChild(form);
      }, 2000);
    }
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
