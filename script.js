// Custom Cursor Glow Effect
const cursorGlow = document.createElement('div');
cursorGlow.classList.add('cursor-glow');
document.body.appendChild(cursorGlow);

// Track Mouse Movement
document.addEventListener('mousemove', (e) => {
  cursorGlow.style.top = `${e.clientY}px`;
  cursorGlow.style.left = `${e.clientX}px`;
});

// Update Glow to Only Affect Green Elements
document.addEventListener('mousemove', () => {
  const hoveredElement = document.elementFromPoint(
    cursorGlow.style.left.replace('px', ''),
    cursorGlow.style.top.replace('px', '')
  );

  // Get computed styles for the hovered element
  if (hoveredElement) {
    const computedStyles = window.getComputedStyle(hoveredElement);
    const isGreen =
      computedStyles.color === 'rgb(0, 184, 148)' ||
      computedStyles.backgroundColor === 'rgb(0, 184, 148)';

    // If the element is green, show the glow
    cursorGlow.style.opacity = isGreen ? 1 : 0;
  } else {
    cursorGlow.style.opacity = 0;
  }
});
