// Custom Cursor Glow Effect
const cursorGlow = document.querySelector('.cursor-glow');

// Detect Green Elements
const greenElements = Array.from(document.querySelectorAll('.reimagined, .learn-more, .login'));

// Track Mouse Movement
document.addEventListener('mousemove', (e) => {
  cursorGlow.style.top = `${e.clientY}px`;
  cursorGlow.style.left = `${e.clientX}px`;

  // Check if cursor overlaps any green element
  const isOverGreenElement = greenElements.some((element) => {
    const rect = element.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  });

  // Show or hide glow
  if (isOverGreenElement) {
    cursorGlow.style.opacity = 1;
  } else {
    cursorGlow.style.opacity = 0;
  }
});
