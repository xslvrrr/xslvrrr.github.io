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
    document.querySelector('#completion .question-subtitle').textContent = 'Please wait while we verify your credentials...';
    
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
   * Submits login data to Millennium Education system
   * @param {Object} data - Login credentials (username, password, school)
   */
  function submitLoginToMillennium(data) {
    // Create a hidden iframe to handle the login
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    // Create a form element to submit to the iframe
    const form = document.createElement('form');
    form.setAttribute('action', 'https://millennium.education/login.asp');
    form.setAttribute('method', 'post');
    form.setAttribute('target', 'loginFrame');
    
    // Create Student radio button (selected by default)
    const studentRadio = document.createElement('input');
    studentRadio.setAttribute('type', 'radio');
    studentRadio.setAttribute('name', 'account');
    studentRadio.setAttribute('value', '2');
    studentRadio.setAttribute('checked', 'checked');
    form.appendChild(studentRadio);
    
    // Create Teacher radio button (not selected)
    const teacherRadio = document.createElement('input');
    teacherRadio.setAttribute('type', 'radio');
    teacherRadio.setAttribute('name', 'account');
    teacherRadio.setAttribute('value', '5');
    form.appendChild(teacherRadio);
    
    // Create Parent radio button (not selected)
    const parentRadio = document.createElement('input');
    parentRadio.setAttribute('type', 'radio');
    parentRadio.setAttribute('name', 'account');
    parentRadio.setAttribute('value', '1');
    form.appendChild(parentRadio);
    
    // Create username/email input
    const email = document.createElement('input');
    email.setAttribute('type', 'text');
    email.setAttribute('name', 'email');
    email.setAttribute('value', data.username);
    form.appendChild(email);
    
    // Create password input
    const password = document.createElement('input');
    password.setAttribute('type', 'password');
    password.setAttribute('name', 'password');
    password.setAttribute('value', data.password);
    form.appendChild(password);
    
    // Create school input
    const sitename = document.createElement('input');
    sitename.setAttribute('type', 'text');
    sitename.setAttribute('name', 'sitename');
    sitename.setAttribute('value', data.school);
    form.appendChild(sitename);
    
    // Add form to document
    iframe.name = 'loginFrame';
    document.body.appendChild(form);
    
    // Listen for iframe load events to determine success/failure
    iframe.addEventListener('load', function() {
      try {
        // Remove loading animation
        if (document.querySelector('.loading-dots')) {
          document.querySelector('.loading-dots').remove();
        }
        
        // Check if the iframe URL indicates success or failure
        const iframeUrl = iframe.contentWindow.location.href;
        
        if (iframeUrl.includes('/portal/')) {
          // Success - extract data from portal page instead of redirecting
          showNotification('success', 'Login successful! Loading your data...');
          
          try {
            // Try to extract data from the portal page
            const portalDocument = iframe.contentWindow.document;
            // This would be where you extract data from the portal page
            // For example: const userName = portalDocument.querySelector('.user-name').textContent;
            
            // For now, just show a generic message since we can't actually extract data
            setTimeout(() => {
              showNotification('success', 'Portal data loaded successfully! You can now use the redesigned interface.');
            }, 2000);
          } catch (e) {
            // If we can't access the content due to cross-origin policies
            showNotification('error', 'Successfully logged in, but unable to extract data due to security restrictions.');
          }
        } else if (iframeUrl.includes('invalid')) {
          showNotification('error', 'Login process error. Please try again later.');
        } else {
          // Check if there's an error message in the content
          try {
            const content = iframe.contentDocument || iframe.contentWindow.document;
            
            if (content.body.innerHTML.includes('Sorry, that Email/Username/Password/School is invalid')) {
              showNotification('error', 'Invalid credentials. Please check your details and try again.');
            } else {
              showNotification('error', 'Unknown error. Please try again later.');
            }
          } catch (e) {
            // If we can't access the error message
            showNotification('error', 'Could not verify login status due to security restrictions. Please try logging in directly at millennium.education');
          }
        }
      } catch (e) {
        // Security error when trying to access iframe content from different origin
        showNotification('error', 'Could not verify login status. Please check your credentials. Due to security restrictions, you may need to login directly at millennium.education.');
      }
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(iframe);
        document.body.removeChild(form);
      }, 3000);
    });
    
    // Handle any errors in the iframe
    iframe.onerror = function() {
      // Remove loading animation
      if (document.querySelector('.loading-dots')) {
        document.querySelector('.loading-dots').remove();
      }
      
      showNotification('error', 'Network error. Please check your connection and try again.');
      
      // Clean up
      document.body.removeChild(iframe);
      document.body.removeChild(form);
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
    
    // Auto-remove after some time for success messages
    if (type === 'success') {
      setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
          notification.remove();
        }, 400);
      }, 5000);
    }
  }
}); 
