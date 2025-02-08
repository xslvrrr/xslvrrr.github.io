// Settings button and popup functionality
const settingsBtn = document.querySelector('.settings-btn');
const settingsPopup = document.querySelector('.settings-popup');
const colorPicker = document.querySelector('#accent-color');
const hexInput = document.querySelector('#hex-input');
const rgbInput = document.querySelector('#rgb-input');

// Toggle settings popup
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsBtn.classList.toggle('active');
  settingsPopup.classList.toggle('active');
});

// Close popup when clicking outside
document.addEventListener('click', (e) => {
  if (!settingsPopup.contains(e.target) && settingsPopup.classList.contains('active')) {
    settingsBtn.classList.remove('active');
    settingsPopup.classList.remove('active');
  }
});

// Convert RGB to HEX
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Convert HEX to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Update color inputs and CSS variables
function updateColor(hex) {
  const root = document.documentElement;
  const rgb = hexToRgb(hex);
  
  // Update CSS variables
  root.style.setProperty('--accent-color', hex);
  root.style.setProperty('--accent-darker', adjustColor(hex, -20));
  
  // Update input fields
  colorPicker.value = hex;
  hexInput.value = hex;
  rgbInput.value = `${rgb.r},${rgb.g},${rgb.b}`;
}

// Adjust color brightness
function adjustColor(hex, percent) {
  const rgb = hexToRgb(hex);
  const adjust = (value) => {
    return Math.max(0, Math.min(255, Math.round(value * (1 + percent/100))));
  };
  
  return rgbToHex(
    adjust(rgb.r),
    adjust(rgb.g),
    adjust(rgb.b)
  );
}

// Color picker event listeners
colorPicker.addEventListener('input', (e) => {
  updateColor(e.target.value);
});

hexInput.addEventListener('change', (e) => {
  const hex = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    updateColor(hex);
  }
});

rgbInput.addEventListener('change', (e) => {
  const values = e.target.value.split(',').map(v => parseInt(v.trim()));
  if (values.length === 3 && values.every(v => !isNaN(v) && v >= 0 && v <= 255)) {
    const hex = rgbToHex(values[0], values[1], values[2]);
    updateColor(hex);
  }
});

// Initialize with default color
updateColor('#00b894');
