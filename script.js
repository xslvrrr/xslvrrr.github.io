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
let initialStopOrder = [];

// =======================================
// Toggle settings popup
// =======================================

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsBtn.classList.toggle('active');
  settingsPopup.classList.toggle('active');
  
  // If opening the popup, ensure gradient stops are rendered correctly
  if (settingsPopup.classList.contains('active')) {
    if (currentTab === 'gradient') {
      renderGradientStops();
    }
    // Make sure the current tab is properly reflected in the UI
    updateTabDisplay();
  }
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
  
  // Get RGB from current hue (ignoring saturation and value) for hue thumb background
  const pureHueRgb = hsvToRgb(h, 100, 100);
  const pureHueColor = rgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);
  elements.hueThumb.style.backgroundColor = pureHueColor;
  
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
  stop.dataset.position = position;
  
  if (index === activeStopIndex) {
    stop.classList.add('active');
  }
  
  return stop;
}

// Completely rewritten gradient stops rendering
function renderGradientStops() {
  // Prevent rendering if not in gradient mode or elements don't exist
  if (!gradientStops || !gradientPreview) return;
  
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

// Completely rewritten gradient stop drag handling
function handleGradientStopDrag(e) {
  if (!isDragging || dragType !== 'stop' || !activeDragElement) return;
  
  const rect = gradientPreview.getBoundingClientRect();
  const newPosition = Math.max(0, Math.min(100, 
    ((e.clientX - rect.left) / rect.width) * 100
  ));
  
  const index = parseInt(activeDragElement.dataset.index, 10);
  if (isNaN(index) || index < 0 || index >= gradientStopsData.length) return;
  
  // Update only the dragged stop's position
  gradientStopsData[index].position = newPosition;
  
  // Update the active stop element position
  activeDragElement.style.left = `${newPosition}%`;
  activeDragElement.dataset.position = newPosition;
  
  // Check for stop order changes and handle passing over other stops
  const sortedStops = [...gradientStopsData]
    .map((stop, i) => ({ ...stop, originalIndex: i }))
    .sort((a, b) => a.position - b.position);
  
  // If the order has changed, update indices
  const newIndices = sortedStops.map(stop => stop.originalIndex);
  if (!arraysEqual(newIndices, initialStopOrder)) {
    // Rerender all stops to reflect new ordering
    updateGradientPreview();
    
    // Find where our active stop is in the new order
    const newActiveIndex = newIndices.indexOf(index);
    activeStopIndex = index; // Keep the same data index
    
    // Update drag element reference as the DOM has changed
    const newStops = gradientStops.querySelectorAll('.gradient-stop');
    activeDragElement = newStops[newActiveIndex];
    activeDragElement.classList.add('active');
    
    // Update initial order for next comparison
    initialStopOrder = [...newIndices];
  }
}

// Helper function to compare arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =======================================
// Improved Tab Switching
// =======================================

// New function to update tab display and content
function updateTabDisplay() {
  // Update tab buttons
  document.querySelectorAll('.tab-option').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === currentTab);
    tab.setAttribute('aria-selected', tab.dataset.tab === currentTab);
  });
  
  // Update tab indicator
  const indicator = document.querySelector('.tab-indicator');
  if (indicator) {
    indicator.setAttribute('data-tab', currentTab);
  }
  
  // Update content visibility
  if (currentTab === 'solid') {
    solidPicker.classList.remove('hidden');
    gradientEditor.classList.remove('active');
    
    // Apply current color immediately
    const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    document.documentElement.style.setProperty('--accent-color', hex);
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`);
  } else {
    solidPicker.classList.add('hidden');
    gradientEditor.classList.add('active');
    
    // Make sure gradient is properly initialized
    updateGradientPreview();
  }
}

// Tab switching
tabSwitcher.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-option')) {
    currentTab = e.target.dataset.tab;
    updateTabDisplay();
  }
});

// =======================================
// Improved Gradient Stops Interaction
// =======================================

// Setup gradient stops interaction
document.addEventListener('click', (e) => {
  const stopElement = e.target.closest('.gradient-stop');
  if (!stopElement) return;
  
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
}, { capture: true });

// Handle mousedown on gradient stops
gradientStops.addEventListener('mousedown', (e) => {
  const stopElement = e.target.closest('.gradient-stop');
  if (!stopElement) return;
  
  e.preventDefault(); // Prevent text selection
  
  isDragging = true;
  dragType = 'stop';
  activeDragElement = stopElement;
  
  const index = parseInt(stopElement.dataset.index, 10);
  
  // Store initial gradient stops order for comparison during drag
  initialStopOrder = gradientStopsData.map((_, i) => i);
  
  if (!isNaN(index) && index >= 0 && index < gradientStopsData.length) {
    activeStopIndex = index;
    
    // Update active state visually
    document.querySelectorAll('.gradient-stop').forEach(el => {
      el.classList.remove('active');
    });
    stopElement.classList.add('active');
  }
  
  // Add temporary event listeners
  document.addEventListener('mousemove', handleGradientStopDrag);
  document.addEventListener('mouseup', stopGradientStopDrag);
});

// Stop gradient stop dragging
function stopGradientStopDrag() {
  isDragging = false;
  dragType = null;
  activeDragElement = null;
  
  // Remove temporary event listeners
  document.removeEventListener('mousemove', handleGradientStopDrag);
  document.removeEventListener('mouseup', stopGradientStopDrag);
  
  // Final update of gradient
  updateGradientPreview();
}

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

// Create a collapsible section for presets with animation
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
  
  // Toggle functionality with smooth animation
  header.addEventListener('click', () => {
    togglePresetsExpansion(header, grid);
  });
  
  // Assemble the container
  container.appendChild(header);
  container.appendChild(grid);
  
  // Expand by default, but wait a moment to allow animation to work
  setTimeout(() => {
    header.classList.add('expanded');
    grid.classList.add('expanded');
  }, 50);
  
  return container;
}

// Enhanced presets expansion
function togglePresetsExpansion(header, grid) {
  const isExpanded = header.classList.toggle('expanded');
  grid.classList.toggle('expanded', isExpanded);
}

// =======================================
// Initialization
// =======================================

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
  // Initial setup for color picker
  updateColorPicker();
  
  // Create presets
  createPresets();
  
  // Ensure tab state is correct on load
  updateTabDisplay();
});

// Update color picker with current HSV values
function updateColorPicker() {
  // Create the tab indicator if it doesn't exist
  initTabIndicator();
  
  // Update the UI for both solid and gradient pickers
  updateColorPickerUI(currentHue, currentSaturation, currentValue, false);
  updateColorPickerUI(currentHue, currentSaturation, currentValue, true);
  
  // For gradient mode, update the gradient preview
  updateGradientPreview();
  
  // Set initial colors for solid color
  const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  document.documentElement.style.setProperty('--accent-color', hex);
  document.documentElement.style.setProperty('--accent-darker', rgbToHex(
    Math.max(0, Math.round(rgb.r * 0.8)),
    Math.max(0, Math.round(rgb.g * 0.8)),
    Math.max(0, Math.round(rgb.b * 0.8))
  ));
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

// Create tab indicator if not present
function initTabIndicator() {
  if (!document.querySelector('.tab-indicator')) {
    const indicator = document.createElement('div');
    indicator.className = 'tab-indicator';
    indicator.setAttribute('data-tab', 'solid');
    tabSwitcher.appendChild(indicator);
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
