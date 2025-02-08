// Settings button and popup functionality
const settingsBtn = document.querySelector('.settings-btn');
const settingsPopup = document.querySelector('.settings-popup');
const hexInput = document.querySelector('#hex-input');
const rgbInput = document.querySelector('#rgb-input');

// Color picker elements
const colorArea = document.querySelector('.color-area');
const colorAreaInner = document.querySelector('.color-area-inner');
const colorAreaThumb = document.querySelector('.color-area-thumb');
const hueSlider = document.querySelector('.hue-slider');
const hueThumb = document.querySelector('.hue-slider-thumb');

let currentHue = 168; // Initial hue for #00b894
let currentSaturation = 100;
let currentLightness = 36;
let isDraggingHue = false;
let isDraggingColor = false;

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
    const hex = Math.round(x).toString(16);
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

// HSL to RGB conversion
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: 255 * f(0),
    g: 255 * f(8),
    b: 255 * f(4)
  };
}

// Calculate perceived brightness (0-255)
function getPerceivedBrightness(r, g, b) {
  // Using relative luminance formula
  return Math.sqrt(
    0.299 * r * r +
    0.587 * g * g +
    0.114 * b * b
  );
}

// Update the color picker UI
function updateColorPicker(h, s, l) {
  // Update color area background
  colorAreaInner.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
  
  // Update thumbs position
  const saturationX = (s / 100) * colorArea.offsetWidth;
  const lightnessY = (1 - l / 100) * colorArea.offsetHeight;
  const hueX = (h / 360) * hueSlider.offsetWidth;
  
  colorAreaThumb.style.left = `${saturationX}px`;
  colorAreaThumb.style.top = `${lightnessY}px`;
  hueThumb.style.left = `${hueX}px`;
  
  // Update color thumb background
  colorAreaThumb.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
  
  // Convert to RGB and update inputs
  const rgb = hslToRgb(h, s, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  
  hexInput.value = hex;
  rgbInput.value = `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
  
  // Calculate brightness and update text colors
  const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
  const isDark = brightness < 140;
  
  // Update CSS variables
  const root = document.documentElement;
  root.style.setProperty('--accent-color', hex);
  root.style.setProperty('--accent-darker', rgbToHex(
    rgb.r * 0.7,
    rgb.g * 0.7,
    rgb.b * 0.7
  ));
  root.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
}

// Handle hue slider interactions
hueSlider.addEventListener('mousedown', (e) => {
  isDraggingHue = true;
  const rect = hueSlider.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  currentHue = x * 360;
  updateColorPicker(currentHue, currentSaturation, currentLightness);
});

// Handle color area interactions
colorArea.addEventListener('mousedown', (e) => {
  isDraggingColor = true;
  const rect = colorArea.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  currentSaturation = x * 100;
  currentLightness = (1 - y) * 100;
  updateColorPicker(currentHue, currentSaturation, currentLightness);
});

// Handle mouse movement
document.addEventListener('mousemove', (e) => {
  if (isDraggingHue) {
    const rect = hueSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentHue = x * 360;
    updateColorPicker(currentHue, currentSaturation, currentLightness);
  }
  if (isDraggingColor) {
    const rect = colorArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    currentSaturation = x * 100;
    currentLightness = (1 - y) * 100;
    updateColorPicker(currentHue, currentSaturation, currentLightness);
  }
});

// Handle mouse up
document.addEventListener('mouseup', () => {
  isDraggingHue = false;
  isDraggingColor = false;
});

// Handle hex input
hexInput.addEventListener('change', (e) => {
  const hex = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    const rgb = hexToRgb(hex);
    // Convert RGB to HSL
    const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
    const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
    const delta = max - min;
    
    currentLightness = (max + min) / 2 * 100;
    currentSaturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * currentLightness/100 - 1)) * 100;
    
    if (delta === 0) currentHue = 0;
    else if (max === rgb.r/255) currentHue = 60 * ((rgb.g/255 - rgb.b/255) / delta);
    else if (max === rgb.g/255) currentHue = 60 * (2 + (rgb.b/255 - rgb.r/255) / delta);
    else currentHue = 60 * (4 + (rgb.r/255 - rgb.g/255) / delta);
    
    if (currentHue < 0) currentHue += 360;
    
    updateColorPicker(currentHue, currentSaturation, currentLightness);
  }
});

// Handle RGB input
rgbInput.addEventListener('change', (e) => {
  const values = e.target.value.split(',').map(v => parseInt(v.trim()));
  if (values.length === 3 && values.every(v => !isNaN(v) && v >= 0 && v <= 255)) {
    const hex = rgbToHex(values[0], values[1], values[2]);
    hexInput.value = hex;
    hexInput.dispatchEvent(new Event('change'));
  }
});

// Initialize with default color
hexInput.value = '#00b894';
hexInput.dispatchEvent(new Event('change'));
