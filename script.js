// Settings button and popup functionality
const settingsBtn = document.querySelector('.settings-btn');
const settingsPopup = document.querySelector('.settings-popup');
const tabSwitcher = document.querySelector('.tab-switcher');
const solidPicker = document.querySelector('.solid-picker');
const gradientEditor = document.querySelector('.gradient-editor');
const hexInput = document.querySelector('#hex-input');
const rgbInput = document.querySelector('#rgb-input');

// Color picker elements
const colorArea = document.querySelector('.solid-picker .color-area');
const colorAreaInner = document.querySelector('.solid-picker .color-area-inner');
const colorAreaThumb = document.querySelector('.solid-picker .color-area-thumb');
const hueSlider = document.querySelector('.solid-picker .hue-slider');
const hueThumb = document.querySelector('.solid-picker .hue-slider-thumb');

const colorAreaGradient = document.querySelector('.gradient-editor .color-area');
const colorAreaInnerGradient = document.querySelector('.gradient-editor .color-area-inner');
const colorAreaThumbGradient = document.querySelector('.gradient-editor .color-area-thumb');
const hueSliderGradient = document.querySelector('.gradient-editor .hue-slider');
const hueSliderThumb = document.querySelector('.gradient-editor .hue-slider-thumb');

const gradientPreview = document.querySelector('.gradient-preview');
const gradientStops = document.querySelector('.gradient-stops');
const addStopBtn = document.getElementById('add-stop');
const removeStopBtn = document.getElementById('remove-stop');
const angleInput = document.querySelector('.gradient-angle');
const hexInputGradient = document.getElementById('hex-input-gradient');
const rgbInputGradient = document.getElementById('rgb-input-gradient');

// Color picker state
let currentHue = 200;
let currentSaturation = 80;
let currentValue = 70;
let currentTab = 'solid';

// Gradient state
let gradientStopsData = [
  { position: 0, color: '#3d3393' },
  { position: 100, color: '#2cacd1' }
];
let activeStopIndex = 0;

// State tracking variables
let isDragging = false;
let dragType = null; // 'color', 'hue', or 'stop'
let activeDragElement = null;

// =======================================
// Toggle settings popup
// =======================================

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsBtn.classList.toggle('active');
  settingsPopup.classList.toggle('active');
});

// Close popup when clicking outside
document.addEventListener('mousedown', (e) => {
  if (!settingsPopup.contains(e.target) && !settingsBtn.contains(e.target)) {
    settingsBtn.classList.remove('active');
    settingsPopup.classList.remove('active');
  }
});

// =======================================
// Color conversion utilities
// =======================================

// Convert RGB to HEX
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Convert HEX to RGB
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return { r, g, b };
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
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  
  s = max === 0 ? 0 : delta / max;
  
  return {
    h: h,
    s: Math.round(s * 100),
    v: Math.round(v * 100)
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

// =======================================
// Color Picker UI Updates
// =======================================

// Update the color picker UI based on HSV values
function updateColorPickerUI(h, s, v, isGradient) {
  const elements = isGradient ? {
    colorArea: colorAreaGradient,
    colorAreaInner: colorAreaInnerGradient,
    colorAreaThumb: colorAreaThumbGradient,
    hueSlider: hueSliderGradient,
    hueThumb: hueSliderThumb,
    hexInput: hexInputGradient,
    rgbInput: rgbInputGradient
  } : {
    colorArea: colorArea,
    colorAreaInner: colorAreaInner,
    colorAreaThumb: colorAreaThumb,
    hueSlider: hueSlider,
    hueThumb: hueThumb,
    hexInput: hexInput,
    rgbInput: rgbInput
  };
  
  // Ensure all elements exist
  if (!elements.colorAreaInner || !elements.colorAreaThumb || !elements.hueThumb) {
    console.error('Missing required DOM elements for color picker');
    return;
  }
  
  // Update color area background
  elements.colorAreaInner.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
  
  // Get dimensions
  const colorAreaRect = elements.colorArea.getBoundingClientRect();
  const hueSliderRect = elements.hueSlider.getBoundingClientRect();
  
  // Update thumb positions
  const saturationPos = (s / 100) * colorAreaRect.width;
  const valuePos = ((100 - v) / 100) * colorAreaRect.height;
  const huePos = (h / 360) * hueSliderRect.width;
  
  elements.colorAreaThumb.style.left = `${saturationPos}px`;
  elements.colorAreaThumb.style.top = `${valuePos}px`;
  elements.hueThumb.style.left = `${huePos}px`;
  
  // Get RGB and HEX values
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  
  // Update color thumb background and inputs
  elements.colorAreaThumb.style.backgroundColor = hex;
  elements.hexInput.value = hex;
  elements.rgbInput.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  
  // If in gradient mode, update the current stop
  if (isGradient && activeStopIndex !== null && activeStopIndex >= 0) {
    gradientStopsData[activeStopIndex].color = hex;
    updateGradientPreview();
  } else if (!isGradient) {
    // Update document CSS variables for solid color
    const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
    const isDark = brightness < 120;
    
    document.documentElement.style.setProperty('--accent-color', hex);
    document.documentElement.style.setProperty('--accent-darker', rgbToHex(
      Math.max(0, Math.round(rgb.r * 0.8)),
      Math.max(0, Math.round(rgb.g * 0.8)),
      Math.max(0, Math.round(rgb.b * 0.8))
    ));
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`);
    document.documentElement.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
  }
}

// =======================================
// Event Handlers for Color Area & Hue Slider
// =======================================

// Update color from a click/drag event on the color area
function handleColorAreaInteraction(e, isGradient) {
  const rect = (isGradient ? colorAreaGradient : colorArea).getBoundingClientRect();
  
  // Calculate saturation and value from pointer position
  let saturation = Math.max(0, Math.min(100, 
    ((e.clientX - rect.left) / rect.width) * 100
  ));
  
  let value = Math.max(0, Math.min(100,
    100 - ((e.clientY - rect.top) / rect.height) * 100
  ));
  
  // Update current values
  currentSaturation = saturation;
  currentValue = value;
  
  // Update UI
  updateColorPickerUI(currentHue, currentSaturation, currentValue, isGradient);
}

// Update hue from a click/drag event on the hue slider
function handleHueSliderInteraction(e, isGradient) {
  const rect = (isGradient ? hueSliderGradient : hueSlider).getBoundingClientRect();
  
  // Calculate hue from pointer position
  let hue = Math.max(0, Math.min(359, 
    ((e.clientX - rect.left) / rect.width) * 360
  ));
  
  // Update current value
  currentHue = hue;
  
  // Update UI
  updateColorPickerUI(currentHue, currentSaturation, currentValue, isGradient);
}

// =======================================
// Gradient Functions
// =======================================

// Create and render the gradient preview
function updateGradientPreview() {
  // Sort stops by position
  gradientStopsData.sort((a, b) => a.position - b.position);
  
  // Create gradient string
  const gradientString = gradientStopsData
    .map(stop => `${stop.color} ${stop.position}%`)
    .join(', ');
  
  const angle = angleInput ? parseInt(angleInput.value, 10) || 90 : 90;
  const gradient = `linear-gradient(${angle}deg, ${gradientString})`;
  
  // Apply to gradient preview
  if (gradientPreview) {
    gradientPreview.style.background = gradient;
  }
  
  // Update CSS variable
  document.documentElement.style.setProperty('--accent-gradient', gradient);
  
  // Update gradient stops UI
  renderGradientStops();
}

// Create a gradient stop element
function createStopElement(position, color, index) {
  const stop = document.createElement('div');
  stop.className = 'gradient-stop';
  stop.style.left = `${position}%`;
  stop.style.backgroundColor = color;
  stop.dataset.index = index;
  
  if (index === activeStopIndex) {
    stop.classList.add('active');
  }
  
  return stop;
}

// Render all gradient stops
function renderGradientStops() {
  // Clear existing stops
  gradientStops.innerHTML = '';
  
  // Create new stops
  gradientStopsData.forEach((stop, index) => {
    const stopElement = createStopElement(stop.position, stop.color, index);
    gradientStops.appendChild(stopElement);
  });
  
  // Update remove button state
  if (removeStopBtn) {
    removeStopBtn.disabled = gradientStopsData.length <= 2;
  }
}

// Handle gradient stop drag
function handleGradientStopDrag(e) {
  if (!isDragging || dragType !== 'stop' || !activeDragElement) return;
  
  const rect = gradientPreview.getBoundingClientRect();
  const newPosition = Math.max(0, Math.min(100, 
    ((e.clientX - rect.left) / rect.width) * 100
  ));
  
  const index = parseInt(activeDragElement.dataset.index, 10);
  if (isNaN(index) || index < 0 || index >= gradientStopsData.length) return;
  
  // Update the position
  gradientStopsData[index].position = newPosition;
  
  // Update the active index (might have changed due to reordering)
  activeStopIndex = index;
  
  // Update UI without full re-render for performance
  activeDragElement.style.left = `${newPosition}%`;
  
  // Update the gradient preview
  updateGradientPreview();
}

// =======================================
// Event Listeners
// =======================================

// Tab switching
tabSwitcher.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-option')) {
    const targetTab = e.target.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-option').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === targetTab);
      tab.setAttribute('aria-selected', tab.dataset.tab === targetTab);
    });
    
    // Update tab panels
    if (targetTab === 'solid') {
      solidPicker.style.display = 'block';
      gradientEditor.style.display = 'none';
      gradientEditor.classList.remove('active');
      currentTab = 'solid';
    } else {
      solidPicker.style.display = 'none';
      gradientEditor.style.display = 'block';
      gradientEditor.classList.add('active');
      currentTab = 'gradient';
      
      // Make sure gradient is properly initialized
      updateGradientPreview();
    }
    
    // Update tab indicator
    const indicator = document.querySelector('.tab-indicator');
    if (indicator) {
      indicator.setAttribute('data-tab', targetTab);
    }
  }
});

// Color area events (solid)
colorArea.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragType = 'color';
  handleColorAreaInteraction(e, false);
});

// Color area events (gradient)
colorAreaGradient.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragType = 'color';
  handleColorAreaInteraction(e, true);
});

// Hue slider events (solid)
hueSlider.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragType = 'hue';
  handleHueSliderInteraction(e, false);
});

// Hue slider events (gradient)
hueSliderGradient.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragType = 'hue';
  handleHueSliderInteraction(e, true);
});

// Handle mousemove for all dragging interactions
document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  if (dragType === 'color') {
    handleColorAreaInteraction(e, currentTab === 'gradient');
  } else if (dragType === 'hue') {
    handleHueSliderInteraction(e, currentTab === 'gradient');
  } else if (dragType === 'stop') {
    handleGradientStopDrag(e);
  }
});

// Handle mouseup to end all dragging
document.addEventListener('mouseup', () => {
  isDragging = false;
  dragType = null;
  activeDragElement = null;
});

// Handle hex input changes (solid)
hexInput.addEventListener('change', (e) => {
  const hex = e.target.value.trim();
  const rgb = hexToRgb(hex);
  
  if (rgb) {
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
  }
});

// Handle rgb input changes (solid)
rgbInput.addEventListener('change', (e) => {
  const rgbValues = e.target.value.split(',').map(v => parseInt(v.trim(), 10));
  
  if (rgbValues.length === 3 && !rgbValues.some(isNaN)) {
    const [r, g, b] = rgbValues;
    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      const hsv = rgbToHsv(r, g, b);
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
    }
  }
});

// Handle hex input changes (gradient)
hexInputGradient.addEventListener('change', (e) => {
  const hex = e.target.value.trim();
  const rgb = hexToRgb(hex);
  
  if (rgb && activeStopIndex >= 0) {
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
  }
});

// Handle rgb input changes (gradient)
rgbInputGradient.addEventListener('change', (e) => {
  const rgbValues = e.target.value.split(',').map(v => parseInt(v.trim(), 10));
  
  if (rgbValues.length === 3 && !rgbValues.some(isNaN) && activeStopIndex >= 0) {
    const [r, g, b] = rgbValues;
    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      const hsv = rgbToHsv(r, g, b);
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
    }
  }
});

// Angle input for gradient
if (angleInput) {
  angleInput.addEventListener('input', () => {
    updateGradientPreview();
  });
}

// Add gradient stop
addStopBtn.addEventListener('click', () => {
  if (gradientStopsData.length >= 5) return; // Limit to 5 stops
  
  // Find largest gap
  let maxGap = 0;
  let gapPosition = 50;
  let gapIndex = 0;
  
  for (let i = 0; i < gradientStopsData.length - 1; i++) {
    const gap = gradientStopsData[i + 1].position - gradientStopsData[i].position;
    if (gap > maxGap) {
      maxGap = gap;
      gapPosition = gradientStopsData[i].position + gap / 2;
      gapIndex = i + 1;
    }
  }
  
  // Create a new stop
  const newStop = {
    position: gapPosition,
    color: '#ffffff' // Default white, will be interpolated
  };
  
  // Interpolate color between adjacent stops
  if (gapIndex > 0 && gapIndex < gradientStopsData.length) {
    const prevStop = gradientStopsData[gapIndex - 1];
    const nextStop = gradientStopsData[gapIndex];
    
    // Calculate ratio
    const ratio = (gapPosition - prevStop.position) / (nextStop.position - prevStop.position);
    
    // Interpolate RGB values
    const prevRgb = hexToRgb(prevStop.color);
    const nextRgb = hexToRgb(nextStop.color);
    
    const r = Math.round(prevRgb.r + ratio * (nextRgb.r - prevRgb.r));
    const g = Math.round(prevRgb.g + ratio * (nextRgb.g - prevRgb.g));
    const b = Math.round(prevRgb.b + ratio * (nextRgb.b - prevRgb.b));
    
    newStop.color = rgbToHex(r, g, b);
  }
  
  // Add new stop
  gradientStopsData.splice(gapIndex, 0, newStop);
  
  // Update active stop to the new one
  activeStopIndex = gapIndex;
  
  // Update UI
  updateGradientPreview();
  
  // Update color picker UI with the new stop's color
  const rgb = hexToRgb(newStop.color);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  currentHue = hsv.h;
  currentSaturation = hsv.s;
  currentValue = hsv.v;
  updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
});

// Remove gradient stop
removeStopBtn.addEventListener('click', () => {
  if (gradientStopsData.length <= 2) return; // Need at least 2 stops
  
  // Remove active stop
  gradientStopsData.splice(activeStopIndex, 1);
  
  // Update active stop index
  activeStopIndex = Math.min(activeStopIndex, gradientStopsData.length - 1);
  
  // Update UI
  updateGradientPreview();
  
  // Update color picker UI with the new active stop's color
  const activeStop = gradientStopsData[activeStopIndex];
  const rgb = hexToRgb(activeStop.color);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  currentHue = hsv.h;
  currentSaturation = hsv.s;
  currentValue = hsv.v;
  updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
});

// Gradient stops interaction
gradientStops.addEventListener('mousedown', (e) => {
  const stopElement = e.target.closest('.gradient-stop');
  if (!stopElement) return;
  
  isDragging = true;
  dragType = 'stop';
  activeDragElement = stopElement;
  
  const index = parseInt(stopElement.dataset.index, 10);
  if (!isNaN(index) && index >= 0 && index < gradientStopsData.length) {
    activeStopIndex = index;
    
    // Update active state visually
    document.querySelectorAll('.gradient-stop').forEach(el => {
      el.classList.remove('active');
    });
    stopElement.classList.add('active');
    
    // Update color picker with this stop's color
    const activeStop = gradientStopsData[activeStopIndex];
    const rgb = hexToRgb(activeStop.color);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
  }
});

// =======================================
// Presets
// =======================================

// Solid color presets
const solidPresets = [
  { name: "Ocean Breeze", color: "#38b6ff" },
  { name: "Emerald Isle", color: "#00c07f" },
  { name: "Sunset Orange", color: "#ff7043" },
  { name: "Royal Purple", color: "#9c56c4" },
  { name: "Ruby Red", color: "#e53935" },
  { name: "Sunflower", color: "#ffca28" },
  { name: "Mint Fresh", color: "#26a69a" },
  { name: "Coral Pink", color: "#ff5e94" }
];

// Gradient presets
const gradientPresets = [
  {
    name: "Cosmic Aurora",
    stops: [
      { position: 0, color: "#3d3393" },
      { position: 33, color: "#2b76b9" },
      { position: 66, color: "#2cacd1" },
      { position: 100, color: "#35eb93" }
    ],
    angle: 135
  },
  {
    name: "Sunset Blaze",
    stops: [
      { position: 0, color: "#ff416c" },
      { position: 50, color: "#ff6b6b" },
      { position: 100, color: "#fda085" }
    ],
    angle: 160
  },
  {
    name: "Northern Lights",
    stops: [
      { position: 0, color: "#43cea2" },
      { position: 50, color: "#1894a8" },
      { position: 100, color: "#3858b3" }
    ],
    angle: 215
  },
  {
    name: "Berry Smoothie",
    stops: [
      { position: 0, color: "#e570e7" },
      { position: 50, color: "#ac3ba3" },
      { position: 100, color: "#6b2255" }
    ],
    angle: 45
  }
];

// Create preset item
function createPresetItem(name, color) {
  const item = document.createElement('div');
  item.className = 'preset-item';
  item.title = name;
  
  const preview = document.createElement('div');
  preview.className = 'preset-preview';
  preview.style.background = color;
  
  const label = document.createElement('div');
  label.className = 'preset-label';
  label.textContent = name;
  
  item.appendChild(preview);
  item.appendChild(label);
  
  return item;
}

// Create presets
function createPresets() {
  // Get containers
  const solidPresetGrid = document.querySelector('.solid-picker .presets-grid');
  const gradientPresetGrid = document.querySelector('.gradient-editor .presets-grid');
  
  if (!solidPresetGrid || !gradientPresetGrid) {
    console.error('Preset containers not found');
    return;
  }
  
  // Clear existing presets
  solidPresetGrid.innerHTML = '';
  gradientPresetGrid.innerHTML = '';
  
  // Add solid presets
  solidPresets.forEach(preset => {
    const item = createPresetItem(preset.name, preset.color);
    
    item.addEventListener('click', () => {
      const rgb = hexToRgb(preset.color);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      
      updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
    });
    
    solidPresetGrid.appendChild(item);
  });
  
  // Add gradient presets
  gradientPresets.forEach(preset => {
    const gradientString = preset.stops.map(stop => `${stop.color} ${stop.position}%`).join(', ');
    const gradientBg = `linear-gradient(${preset.angle}deg, ${gradientString})`;
    
    const item = createPresetItem(preset.name, gradientBg);
    
    item.addEventListener('click', () => {
      // Copy the stops array
      gradientStopsData = JSON.parse(JSON.stringify(preset.stops));
      
      // Update angle
      if (angleInput) {
        angleInput.value = preset.angle;
      }
      
      // Set first stop as active
      activeStopIndex = 0;
      
      // Update UI
      updateGradientPreview();
      
      // Update color picker with first stop
      const firstStop = preset.stops[0];
      const rgb = hexToRgb(firstStop.color);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      
      updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
    });
    
    gradientPresetGrid.appendChild(item);
  });
}

// =======================================
// Initialization
// =======================================

// Create tab indicator if not present
function initTabIndicator() {
  if (!document.querySelector('.tab-indicator')) {
    const indicator = document.createElement('div');
    indicator.className = 'tab-indicator';
    indicator.setAttribute('data-tab', 'solid');
    tabSwitcher.appendChild(indicator);
  }
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing color picker...');
  
  // Initialize tab indicator
  initTabIndicator();
  
  // Set initial colors
  updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
  
  // Initialize gradient
  updateGradientPreview();
  
  // Create presets
  createPresets();
  
  console.log('Color picker initialized successfully');
});
