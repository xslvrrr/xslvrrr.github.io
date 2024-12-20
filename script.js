let timeout;

window.addEventListener('scroll', () => {
  const originalLogo = document.querySelector('.original-logo');

  // Clear any existing timeout
  clearTimeout(timeout);

  // Fade out the original logo while scrolling
  originalLogo.style.opacity = '0';

  // Set a timeout to fade it back in when scrolling stops
  timeout = setTimeout(() => {
    originalLogo.style.opacity = '1';
  }, 300); // Adjust delay for smoother effect if needed
});
