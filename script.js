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
  { position: 33, color: '#2b76b9' },
  { position: 66, color: '#2cacd1' },
  { position: 100, color: '#35eb93' }
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
  
  // Apply to gradient preview using a CSS variable
  document.documentElement.style.setProperty('--current-gradient', gradient);
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
      solidPicker.classList.remove('hidden');
      gradientEditor.classList.remove('active');
      currentTab = 'solid';
    } else {
      solidPicker.classList.add('hidden');
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
removeStopBtn.addEventListener('click', removeGradientStop);

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

// Define preset colors
const solidPresets = [
  { name: "Pure White", color: "#ffffff" },
  { name: "Midnight Black", color: "#000000" },
  { name: "Ruby Red", color: "#e61919" },
  { name: "Sapphire Blue", color: "#1947e6" },
  { name: "Emerald Green", color: "#19e635" },
  { name: "Amethyst Purple", color: "#8a19e6" },
  { name: "Ocean Breeze", color: "#19b3e6" },
  { name: "Sunset Orange", color: "#e67819" },
  { name: "Lemon Yellow", color: "#e6d219" },
  { name: "Bubblegum Pink", color: "#e619b3" }
];

// Define preset gradients with diverse colors
const gradientPresets = [
  { 
    name: "Cosmic Aurora", 
    stops: [
      { color: "#3d3393", position: 0 },
      { color: "#2b76b9", position: 30 },
      { color: "#2cacd1", position: 65 },
      { color: "#35eb93", position: 100 }
    ],
    angle: 90
  },
  { 
    name: "Sunset Blaze", 
    stops: [
      { color: "#f56217", position: 0 },
      { color: "#ec2f4b", position: 100 }
    ],
    angle: 45
  },
  { 
    name: "Electric Violet", 
    stops: [
      { color: "#4776E6", position: 0 },
      { color: "#8E54E9", position: 100 }
    ],
    angle: 135
  },
  { 
    name: "Emerald Ocean", 
    stops: [
      { color: "#11998e", position: 0 },
      { color: "#38ef7d", position: 100 }
    ],
    angle: 90
  },
  { 
    name: "Crimson Blush", 
    stops: [
      { color: "#642B73", position: 0 },
      { color: "#C6426E", position: 100 }
    ],
    angle: 70
  },
  { 
    name: "Golden Hour", 
    stops: [
      { color: "#ff9966", position: 0 },
      { color: "#ff5e62", position: 100 }
    ],
    angle: 120
  },
  { 
    name: "Northern Lights", 
    stops: [
      { color: "#00c3ff", position: 0 },
      { color: "#77e190", position: 50 },
      { color: "#ffff1c", position: 100 }
    ],
    angle: 315
  },
  { 
    name: "Mystic Dusk", 
    stops: [
      { color: "#281760", position: 0 },
      { color: "#65379b", position: 50 },
      { color: "#8d44ad", position: 100 }
    ],
    angle: 180
  }
];

// Create a preset item with the specified preview and label
function createPresetItem(name, previewStyle) {
  const presetItem = document.createElement('div');
  presetItem.className = 'preset-item';
  
  const presetPreview = document.createElement('div');
  presetPreview.className = 'preset-preview';
  
  // Apply the style (either background-color or background-image)
  if (typeof previewStyle === 'string') {
    presetPreview.style.backgroundColor = previewStyle;
  } else if (typeof previewStyle === 'object') {
    presetPreview.style.backgroundImage = generateGradientCSS(previewStyle.stops, previewStyle.angle);
  }
  
  const presetLabel = document.createElement('div');
  presetLabel.className = 'preset-label';
  presetLabel.textContent = name;
  
  presetItem.appendChild(presetPreview);
  presetItem.appendChild(presetLabel);
  
  return presetItem;
}

// Create a collapsible section for presets
function createCollapsiblePresets(title, presets, isGradient = false) {
  const container = document.createElement('div');
  container.className = 'presets-container';
  
  // Create header
  const header = document.createElement('div');
  header.className = 'presets-header';
  
  const titleEl = document.createElement('h4');
  titleEl.className = 'presets-title';
  titleEl.textContent = title;
  
  const toggle = document.createElement('span');
  toggle.className = 'presets-toggle';
  // Using icon instead of text
  
  header.appendChild(titleEl);
  header.appendChild(toggle);
  
  // Create grid
  const grid = document.createElement('div');
  grid.className = 'presets-grid';
  
  // Add presets to grid
  presets.forEach(preset => {
    let presetItem;
    
    if (isGradient) {
      presetItem = createPresetItem(preset.name, {
        stops: preset.stops,
        angle: preset.angle
      });
      
      // Event listener for gradient preset
      presetItem.addEventListener('click', () => {
        // Copy the stops data to avoid modifying the preset
        gradientStopsData = JSON.parse(JSON.stringify(preset.stops));
        
        // Update angle
        const angle = preset.angle || 90; // Default to 90 if not specified
        
        // Set the angle input value
        const angleInput = document.getElementById('angleInput');
        if (angleInput) {
          angleInput.value = angle;
        }
        
        // Make sure first stop is active
        activeStopIndex = 0;
        
        // Update UI
        updateGradientPreview();
        
        // Update color picker with first stop color
        if (gradientStopsData.length > 0) {
          const firstStop = gradientStopsData[0];
          const rgb = hexToRgb(firstStop.color);
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          
          currentHue = hsv.h;
          currentSaturation = hsv.s;
          currentValue = hsv.v;
          
          updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
        }
      });
    } else {
      presetItem = createPresetItem(preset.name, preset.color);
      
      // Event listener for solid preset
      presetItem.addEventListener('click', () => {
        const rgb = hexToRgb(preset.color);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        
        currentHue = hsv.h;
        currentSaturation = hsv.s;
        currentValue = hsv.v;
        
        updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
      });
    }
    
    grid.appendChild(presetItem);
  });
  
  // Toggle functionality
  header.addEventListener('click', () => {
    const isExpanded = header.classList.toggle('expanded');
    grid.classList.toggle('expanded', isExpanded);
  });
  
  // Assemble the container
  container.appendChild(header);
  container.appendChild(grid);
  
  // Expand by default
  header.classList.add('expanded');
  grid.classList.add('expanded');
  
  return container;
}

// Create presets for both solid colors and gradients
function createPresets() {
  // Get containers
  const solidPresetContainer = document.getElementById('solidPresets');
  const gradientPresetContainer = document.getElementById('gradientPresets');
  
  // Clear existing content
  if (solidPresetContainer) solidPresetContainer.innerHTML = '';
  if (gradientPresetContainer) gradientPresetContainer.innerHTML = '';
  
  // Create collapsible solid presets and append to container
  if (solidPresetContainer) {
    const solidPresetsSection = createCollapsiblePresets('Solid Color Presets', solidPresets);
    solidPresetContainer.appendChild(solidPresetsSection);
  }
  
  // Create collapsible gradient presets and append to container
  if (gradientPresetContainer) {
    const gradientPresetsSection = createCollapsiblePresets('Gradient Presets', gradientPresets, true);
    gradientPresetContainer.appendChild(gradientPresetsSection);
  }
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
document.addEventListener('DOMContentLoaded', function() {
  // Initial setup for color picker
  updateColorPicker();
  
  // Setup tab switching
  setupTabSwitching();
  
  // Setup settings button
  setupSettingsButton();
  
  // Create presets
  createPresets();
  
  // Setup event listeners
  setupEventListeners();
});

// Setup tab switching
function setupTabSwitching() {
  const tabOptions = document.querySelectorAll('.tab-option');
  const tabIndicator = document.querySelector('.tab-indicator');
  const solidPicker = document.querySelector('.solid-picker');
  const gradientEditor = document.querySelector('.gradient-editor');
  
  tabOptions.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabOptions.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Update tab indicator
      const tabType = tab.getAttribute('data-tab');
      tabIndicator.setAttribute('data-tab', tabType);
      
      // Show the appropriate content
      if (tabType === 'solid') {
        solidPicker.classList.remove('hidden');
        gradientEditor.classList.remove('active');
      } else {
        solidPicker.classList.add('hidden');
        gradientEditor.classList.add('active');
        // Update gradient preview when switching to gradient tab
        updateGradientPreview();
      }
    });
  });
}

// Setup settings button
function setupSettingsButton() {
  const settingsBtn = document.querySelector('.settings-btn');
  const settingsPopup = document.querySelector('.settings-popup');
  
  // Initial setup - hide popup
  if (settingsPopup) {
    settingsPopup.style.display = 'none';
  }
  
  // Toggle settings popup
  if (settingsBtn && settingsPopup) {
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (settingsPopup.style.display === 'none') {
        settingsPopup.style.display = 'block';
      } else {
        settingsPopup.style.display = 'none';
      }
    });
    
    // Close settings popup when clicking outside
    document.addEventListener('click', (e) => {
      if (settingsPopup.style.display === 'block' && 
          !settingsPopup.contains(e.target) && 
          e.target !== settingsBtn) {
        settingsPopup.style.display = 'none';
      }
    });
  }
}

// Setup all event listeners
function setupEventListeners() {
  setupColorAreaEvents();
  setupHueSliderEvents();
  setupColorInputEvents();
  setupGradientEvents();
}

// Setup color area events
function setupColorAreaEvents() {
  const colorArea = document.querySelectorAll('.color-area');
  
  colorArea.forEach(area => {
    area.addEventListener('pointerdown', startColorDrag);
  });
}

// Setup hue slider events
function setupHueSliderEvents() {
  const hueSliders = document.querySelectorAll('.hue-slider');
  
  hueSliders.forEach(slider => {
    slider.addEventListener('pointerdown', startHueDrag);
  });
}

// Setup input events for HEX and RGB
function setupColorInputEvents() {
  const hexInputs = document.querySelectorAll('#hex-input, #hex-input-gradient');
  const rgbInputs = document.querySelectorAll('#rgb-input, #rgb-input-gradient');
  
  hexInputs.forEach(input => {
    input.addEventListener('input', handleHexInput);
    input.addEventListener('blur', validateHexInput);
  });
  
  rgbInputs.forEach(input => {
    input.addEventListener('input', handleRgbInput);
    input.addEventListener('blur', validateRgbInput);
  });
}

// Setup gradient-specific events
function setupGradientEvents() {
  // Angle input
  const angleInput = document.getElementById('angleInput');
  if (angleInput) {
    angleInput.addEventListener('input', handleAngleInput);
  }
  
  // Add stop button
  const addStopBtn = document.getElementById('add-stop');
  if (addStopBtn) {
    addStopBtn.addEventListener('click', addGradientStop);
  }
  
  // Remove stop button
  const removeStopBtn = document.getElementById('remove-stop');
  if (removeStopBtn) {
    removeStopBtn.addEventListener('click', removeGradientStop);
  }
}

// Generate CSS for gradient
function generateGradientCSS(stops, angle) {
  if (!stops || !stops.length) return 'transparent';
  
  // Sort stops by position
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);
  
  // Create the gradient string
  const gradientString = sortedStops
    .map(stop => `${stop.color} ${stop.position}%`)
    .join(', ');
  
  // Return the full CSS value
  return `linear-gradient(${angle}deg, ${gradientString})`;
}

// Update color picker with current HSV values
function updateColorPicker() {
  // Create the tab indicator if it doesn't exist
  initTabIndicator();
  
  // Update the UI for both solid and gradient pickers
  updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
  
  // For gradient mode, update the gradient preview
  updateGradientPreview();
  
  // Set initial colors
  const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  document.documentElement.style.setProperty('--accent-color', hex);
  
  console.log('Color picker initialized with HSV:', currentHue, currentSaturation, currentValue);
}

// Start dragging the color area thumb
function startColorDrag(e) {
  if (e.button !== 0) return; // Only left mouse button
  
  isDragging = true;
  dragType = 'color';
  
  // Determine if this is in the gradient editor
  const isGradient = e.currentTarget.closest('.gradient-editor') !== null;
  
  // Update color immediately
  handleColorAreaInteraction(e, isGradient);
  
  // Capture pointer to handle dragging outside the element
  e.currentTarget.setPointerCapture(e.pointerId);
  
  // Add event listeners for move and up events
  e.currentTarget.addEventListener('pointermove', (moveEvent) => {
    if (isDragging && dragType === 'color') {
      handleColorAreaInteraction(moveEvent, isGradient);
    }
  });
  
  e.currentTarget.addEventListener('pointerup', () => {
    isDragging = false;
    dragType = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, { once: true });
}

// Start dragging the hue slider thumb
function startHueDrag(e) {
  if (e.button !== 0) return; // Only left mouse button
  
  isDragging = true;
  dragType = 'hue';
  
  // Determine if this is in the gradient editor
  const isGradient = e.currentTarget.closest('.gradient-editor') !== null;
  
  // Update hue immediately
  handleHueSliderInteraction(e, isGradient);
  
  // Capture pointer to handle dragging outside the element
  e.currentTarget.setPointerCapture(e.pointerId);
  
  // Add event listeners for move and up events
  e.currentTarget.addEventListener('pointermove', (moveEvent) => {
    if (isDragging && dragType === 'hue') {
      handleHueSliderInteraction(moveEvent, isGradient);
    }
  });
  
  e.currentTarget.addEventListener('pointerup', () => {
    isDragging = false;
    dragType = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, { once: true });
}

// Handle hex input change
function handleHexInput(e) {
  try {
    const hex = e.target.value.trim();
    if (/^#?([0-9A-F]{3}){1,2}$/i.test(hex)) {
      const formattedHex = hex.startsWith('#') ? hex : `#${hex}`;
      const rgb = hexToRgb(formattedHex);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        currentHue = hsv.h;
        currentSaturation = hsv.s;
        currentValue = hsv.v;
        
        // Determine if in gradient mode
        const isGradient = e.target.id === 'hex-input-gradient';
        updateColorPickerUI(currentHue, currentSaturation, currentValue, isGradient);
      }
    }
  } catch (error) {
    console.error('Error handling hex input:', error);
  }
}

// Validate hex input on blur
function validateHexInput(e) {
  try {
    const hex = e.target.value.trim();
    if (!/^#?([0-9A-F]{3}){1,2}$/i.test(hex)) {
      // Reset to current color
      const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
      e.target.value = rgbToHex(rgb.r, rgb.g, rgb.b);
    } else if (!hex.startsWith('#')) {
      e.target.value = `#${hex}`;
    }
  } catch (error) {
    console.error('Error validating hex input:', error);
  }
}

// Handle RGB input change
function handleRgbInput(e) {
  try {
    const rgbValues = e.target.value.split(',').map(v => parseInt(v.trim(), 10));
    if (rgbValues.length === 3 && !rgbValues.some(isNaN)) {
      const [r, g, b] = rgbValues;
      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        const hsv = rgbToHsv(r, g, b);
        currentHue = hsv.h;
        currentSaturation = hsv.s;
        currentValue = hsv.v;
        
        // Determine if in gradient mode
        const isGradient = e.target.id === 'rgb-input-gradient';
        updateColorPickerUI(currentHue, currentSaturation, currentValue, isGradient);
      }
    }
  } catch (error) {
    console.error('Error handling RGB input:', error);
  }
}

// Validate RGB input on blur
function validateRgbInput(e) {
  try {
    const rgbValues = e.target.value.split(',').map(v => parseInt(v.trim(), 10));
    if (rgbValues.length !== 3 || rgbValues.some(isNaN) || 
        rgbValues.some(v => v < 0 || v > 255)) {
      // Reset to current color
      const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
      e.target.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    }
  } catch (error) {
    console.error('Error validating RGB input:', error);
  }
}

// Handle angle input change
function handleAngleInput(e) {
  try {
    let angle = parseInt(e.target.value, 10);
    
    // Normalize angle to 0-360 range
    if (!isNaN(angle)) {
      angle = ((angle % 360) + 360) % 360;
      
      // Update variable for gradient preview
      if (typeof gradientAngle !== 'undefined') {
        gradientAngle = angle;
      }
      
      // Update preview
      updateGradientPreview();
    }
  } catch (error) {
    console.error('Error handling angle input:', error);
  }
}

// Add a new gradient stop
function addGradientStop() {
  if (gradientStopsData.length >= 5) {
    console.log('Maximum number of stops reached (5)');
    return;
  }
  
  try {
    // Find the largest gap between stops
    let maxGap = 0;
    let insertPosition = 50;
    let insertIndex = 1;
    
    // Sort stops by position
    const sortedStops = [...gradientStopsData].sort((a, b) => a.position - b.position);
    
    // Find the largest gap
    for (let i = 0; i < sortedStops.length - 1; i++) {
      const gap = sortedStops[i + 1].position - sortedStops[i].position;
      if (gap > maxGap) {
        maxGap = gap;
        insertPosition = sortedStops[i].position + gap / 2;
        insertIndex = i + 1;
      }
    }
    
    // Create a new stop with interpolated color
    const prevStop = sortedStops[insertIndex - 1];
    const nextStop = sortedStops[insertIndex];
    
    // Calculate the color ratio based on position
    const ratio = (insertPosition - prevStop.position) / (nextStop.position - prevStop.position);
    
    // Interpolate RGB values
    const prevRgb = hexToRgb(prevStop.color);
    const nextRgb = hexToRgb(nextStop.color);
    
    const r = Math.round(prevRgb.r + ratio * (nextRgb.r - prevRgb.r));
    const g = Math.round(prevRgb.g + ratio * (nextRgb.g - prevRgb.g));
    const b = Math.round(prevRgb.b + ratio * (nextRgb.b - prevRgb.b));
    
    const interpolatedColor = rgbToHex(r, g, b);
    
    // Create the new stop
    const newStop = {
      position: insertPosition,
      color: interpolatedColor
    };
    
    // Add to the stops array
    gradientStopsData.splice(insertIndex, 0, newStop);
    
    // Set as active stop
    activeStopIndex = insertIndex;
    
    // Update UI
    updateGradientPreview();
    
    // Update color picker with the new stop's color
    const rgb = hexToRgb(newStop.color);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    
    updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
    
    console.log('Added new stop at position', insertPosition);
  } catch (error) {
    console.error('Error adding gradient stop:', error);
  }
}

// Remove gradient stop
let isRemovingStop = false;
function removeGradientStop() {
  if (isRemovingStop) return; // Prevent double removal
  if (gradientStopsData.length <= 2) {
    console.log('Cannot remove stop, minimum 2 stops required');
    return;
  }
  
  if (activeStopIndex === null || activeStopIndex < 0 || activeStopIndex >= gradientStopsData.length) {
    console.log('No valid stop selected for removal');
    return;
  }
  
  try {
    isRemovingStop = true;
    
    // Remove the active stop
    gradientStopsData.splice(activeStopIndex, 1);
    
    // Update active index
    activeStopIndex = Math.min(activeStopIndex, gradientStopsData.length - 1);
    
    // Update UI
    updateGradientPreview();
    
    // Update color picker with new active stop
    if (activeStopIndex >= 0) {
      const activeStop = gradientStopsData[activeStopIndex];
      const rgb = hexToRgb(activeStop.color);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      
      updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
    }
    
    // Allow removal again after a short delay
    setTimeout(() => {
      isRemovingStop = false;
    }, 300);
    
    console.log('Removed gradient stop');
  } catch (error) {
    isRemovingStop = false;
    console.error('Error removing gradient stop:', error);
  }
}
