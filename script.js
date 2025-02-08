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
  const saturationX = ((100 - s) / 100) * colorArea.offsetWidth;
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
  
  // Update the active color picker inputs
  if (solidPicker.classList.contains('hidden')) {
    hexInputGradient.value = hex;
    rgbInputGradient.value = `${rgb.r},${rgb.g},${rgb.b}`;
    updateGradientStopColor(h, s, v);
  } else {
    hexInput.value = hex;
    rgbInput.value = `${rgb.r},${rgb.g},${rgb.b}`;
    
    // Calculate brightness and update text colors
    const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
    const isDark = brightness < 180;
    
    // Update CSS variables for solid color
    const root = document.documentElement;
    root.style.setProperty('--accent-color', hex);
    root.style.setProperty('--accent-darker', rgbToHex(
      rgb.r * 0.7,
      rgb.g * 0.7,
      rgb.b * 0.7
    ));
    root.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
  }
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

// Gradient functionality
const tabSwitcher = document.querySelector('.tab-switcher');
const solidPicker = document.querySelector('.solid-picker');
const gradientEditor = document.querySelector('.gradient-editor');
const gradientPreview = document.querySelector('.gradient-preview');
const gradientStops = document.querySelector('.gradient-stops');
const addStopBtn = document.getElementById('add-stop');
const removeStopBtn = document.getElementById('remove-stop');
const angleInput = document.querySelector('.gradient-angle');
const hexInputGradient = document.getElementById('hex-input-gradient');
const rgbInputGradient = document.getElementById('rgb-input-gradient');

let gradientStopsData = [
  { position: 0, color: '#00b894' },
  { position: 100, color: '#01976d' }
];
let activeStopIndex = 0;
let isDraggingStop = false;

// Tab switching
tabSwitcher.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-option')) {
    const tab = e.target.dataset.tab;
    document.querySelectorAll('.tab-option').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    if (tab === 'solid') {
      solidPicker.classList.remove('hidden');
      gradientEditor.classList.remove('active');
    } else {
      solidPicker.classList.add('hidden');
      gradientEditor.classList.add('active');
      updateGradientPreview();
    }
  }
});

// Create gradient stop element
function createStopElement(position, color) {
  const stop = document.createElement('div');
  stop.className = 'gradient-stop';
  stop.style.left = `${position}%`;
  stop.style.backgroundColor = color;
  return stop;
}

// Update gradient preview
function updateGradientPreview() {
  const angle = angleInput.value;
  const gradient = `linear-gradient(${angle}deg, ${gradientStopsData
    .map(stop => `${stop.color} ${stop.position}%`)
    .join(', ')})`;
  
  gradientPreview.style.background = gradient;
  document.documentElement.style.setProperty('--accent-color', gradientStopsData[0].color);
  document.documentElement.style.setProperty('--accent-darker', gradientStopsData[gradientStopsData.length - 1].color);
  
  // Update color picker with active stop color
  const activeStop = gradientStopsData[activeStopIndex];
  const rgb = hexToRgb(activeStop.color);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  currentHue = hsv.h;
  currentSaturation = hsv.s;
  currentValue = hsv.v;
  updateColorPicker(currentHue, currentSaturation, currentValue);
  
  hexInputGradient.value = activeStop.color;
  rgbInputGradient.value = `${rgb.r},${rgb.g},${rgb.b}`;
}

// Render gradient stops
function renderGradientStops() {
  gradientStops.innerHTML = '';
  gradientStopsData.forEach((stop, index) => {
    const stopElement = createStopElement(stop.position, stop.color);
    if (index === activeStopIndex) {
      stopElement.classList.add('active');
    }
    gradientStops.appendChild(stopElement);
  });
  removeStopBtn.disabled = gradientStopsData.length <= 2;
}

// Handle gradient stop drag
gradientStops.addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('gradient-stop')) {
    isDraggingStop = true;
    const stops = Array.from(gradientStops.children);
    activeStopIndex = stops.indexOf(e.target);
    renderGradientStops();
  }
});

document.addEventListener('mousemove', (e) => {
  if (isDraggingStop) {
    const rect = gradientPreview.getBoundingClientRect();
    const position = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    gradientStopsData[activeStopIndex].position = position;
    renderGradientStops();
    updateGradientPreview();
  }
});

document.addEventListener('mouseup', () => {
  isDraggingStop = false;
});

// Add new gradient stop
addStopBtn.addEventListener('click', () => {
  const newPosition = 50;
  const newColor = '#ffffff';
  gradientStopsData.push({ position: newPosition, color: newColor });
  activeStopIndex = gradientStopsData.length - 1;
  renderGradientStops();
  updateGradientPreview();
});

// Remove active gradient stop
removeStopBtn.addEventListener('click', () => {
  if (gradientStopsData.length > 2) {
    gradientStopsData.splice(activeStopIndex, 1);
    activeStopIndex = Math.max(0, activeStopIndex - 1);
    renderGradientStops();
    updateGradientPreview();
  }
});

// Update gradient angle
angleInput.addEventListener('change', () => {
  updateGradientPreview();
});

// Update gradient stop color when color picker changes
function updateGradientStopColor(h, s, v) {
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  gradientStopsData[activeStopIndex].color = hex;
  renderGradientStops();
  updateGradientPreview();
}

// Handle gradient hex input
hexInputGradient.addEventListener('change', (e) => {
  const hex = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    gradientStopsData[activeStopIndex].color = hex;
    renderGradientStops();
    updateGradientPreview();
  }
});

// Handle gradient RGB input
rgbInputGradient.addEventListener('change', (e) => {
  const values = e.target.value.split(',').map(v => parseInt(v.trim()));
  if (values.length === 3 && values.every(v => !isNaN(v) && v >= 0 && v <= 255)) {
    const hex = rgbToHex(values[0], values[1], values[2]);
    gradientStopsData[activeStopIndex].color = hex;
    renderGradientStops();
    updateGradientPreview();
  }
});

// Initialize gradient editor
renderGradientStops();
updateGradientPreview();
