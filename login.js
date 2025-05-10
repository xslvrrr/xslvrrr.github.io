document.addEventListener('DOMContentLoaded', function() {
  // Get all elements we need
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

  // Handle "Continue with login details" button
  detailsBtn.addEventListener('click', function() {
    loginOptions.style.display = 'none';
    question1.style.display = 'flex';
  });

  // NSW DoE button (currently does nothing substantial)
  doeBtn.addEventListener('click', function() {
    alert('NSW DoE login is not implemented yet.');
  });

  // Back to login options link
  backToOptions.addEventListener('click', function(e) {
    e.preventDefault();
    question1.style.display = 'none';
    loginOptions.style.display = 'flex';
  });

  // Submit buttons
  submit1.addEventListener('click', function() {
    question1.style.display = 'none';
    question2.style.display = 'flex';
  });

  submit2.addEventListener('click', function() {
    question2.style.display = 'none';
    question3.style.display = 'flex';
  });

  submit3.addEventListener('click', function() {
    question3.style.display = 'none';
    completion.style.display = 'flex';
  });

  // Back buttons
  back1.addEventListener('click', function() {
    question2.style.display = 'none';
    question1.style.display = 'flex';
  });

  back2.addEventListener('click', function() {
    question3.style.display = 'none';
    question2.style.display = 'flex';
  });

  // Add fade-in animation to all elements
  const container = document.querySelector('.login-container');
  setTimeout(() => {
    container.classList.add('fade-in');
  }, 100);
}); 
