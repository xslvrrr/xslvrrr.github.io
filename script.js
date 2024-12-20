document.addEventListener('DOMContentLoaded', () => {
  const logoOriginal = document.querySelector('.logo-original');
  const logoOverlay = document.querySelector('.logo-overlay');
  let lastScrollTop = 0;
  let scrollTimeout;

  window.addEventListener('scroll', () => {
    // Clear the previous timeout
    clearTimeout(scrollTimeout);

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // Show overlay logo while scrolling
    logoOriginal.style.opacity = '0';
    logoOverlay.style.opacity = '1';

    // Set timeout to revert logos after scrolling stops
    scrollTimeout = setTimeout(() => {
      logoOriginal.style.opacity = '1';
      logoOverlay.style.opacity = '0';
    }, 150); // Adjust this delay as needed

    lastScrollTop = scrollTop;
  });
});
