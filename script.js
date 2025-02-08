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
let currentValue = 72;
let isDraggingHue = false;
let isDraggingColor = false;
let isMouseDownOnPicker = false;

// Toggle settings popup
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsBtn.classList.toggle('active');
  settingsPopup.classList.toggle('active');
});

// Close popup when clicking outside
document.addEventListener('mousedown', (e) => {
  if (settingsPopup.contains(e.target) || settingsBtn.contains(e.target)) {
    isMouseDownOnPicker = true;
  } else if (settingsPopup.classList.contains('active')) {
    isMouseDownOnPicker = false;
    settingsBtn.classList.remove('active');
    settingsPopup.classList.remove('active');
  }
});

document.addEventListener('mouseup', () => {
  isDraggingHue = false;
  isDraggingColor = false;
  isMouseDownOnPicker = false;
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

// HSV to RGB conversion
function hsvToRgb(h, s, v) {
  s /= 100;
  v /= 100;
  
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  
  let r, g, b;
  
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// RGB to HSV conversion
function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h, s;
  const v = max;
  
  if (delta === 0) {
    h = 0;
  } else if (max === r) {
    h = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else {
    h = 60 * ((r - g) / delta + 4);
  }
  
  if (h < 0) h += 360;
  s = max === 0 ? 0 : delta / max;
  
  return {
    h: h,
    s: s * 100,
    v: v * 100
  };
}

// Calculate perceived brightness (0-255)
function getPerceivedBrightness(r, g, b) {
  return Math.sqrt(
    0.299 * r * r +
    0.587 * g * g +
    0.114 * b * b
  );
}

// Update the color picker UI
function updateColorPicker(h, s, v) {
  // Update color area background
  colorAreaInner.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
  
  // Update thumbs position
  const saturationX = (s / 100) * colorArea.offsetWidth;
  const valueY = ((100 - v) / 100) * colorArea.offsetHeight;
  const hueX = (h / 360) * hueSlider.offsetWidth;
  
  colorAreaThumb.style.left = `${saturationX}px`;
  colorAreaThumb.style.top = `${valueY}px`;
  hueThumb.style.left = `${hueX}px`;
  
  // Convert to RGB and update inputs
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  
  // Update color thumb background
  colorAreaThumb.style.backgroundColor = hex;
  
  hexInput.value = hex;
  rgbInput.value = `${rgb.r},${rgb.g},${rgb.b}`;
  
  // Calculate brightness and update text colors
  const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
  const isDark = brightness < 180;
  
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
  updateColorPicker(currentHue, currentSaturation, currentValue);
});

// Handle color area interactions
colorArea.addEventListener('mousedown', (e) => {
  isDraggingColor = true;
  const rect = colorArea.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  currentSaturation = (1 - x) * 100;
  currentValue = 100 - (y * 100);
  updateColorPicker(currentHue, currentSaturation, currentValue);
});

// Handle mouse movement
document.addEventListener('mousemove', (e) => {
  if (isDraggingHue) {
    const rect = hueSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentHue = x * 360;
    updateColorPicker(currentHue, currentSaturation, currentValue);
  }
  if (isDraggingColor) {
    const rect = colorArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    currentSaturation = (1 - x) * 100;
    currentValue = 100 - (y * 100);
    updateColorPicker(currentHue, currentSaturation, currentValue);
  }
});

// Handle hex input
hexInput.addEventListener('change', (e) => {
  const hex = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    updateColorPicker(currentHue, currentSaturation, currentValue);
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
