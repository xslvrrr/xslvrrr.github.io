// Settings button and popup functionality
const settingsBtn = document.querySelector('.settings-btn');
const settingsPopup = document.querySelector('.settings-popup');
const tabSwitcher = document.querySelector('.tab-switcher');
const solidPicker = document.querySelector('.solid-picker'); // Container for solid color picker
const gradientEditor = document.querySelector('.gradient-editor');

// Solid Color Picker Elements
const solidColorArea = document.querySelector('#solidPicker .color-area');
const solidColorAreaThumb = document.querySelector('#solidPicker .color-area-thumb');
const solidHueSlider = document.querySelector('#solidPicker .hue-slider');
const solidHueThumb = document.querySelector('#solidPicker .hue-slider-thumb');
const solidHexInput = document.querySelector('#solidPicker #hex-input');
const solidRgbInput = document.querySelector('#solidPicker #rgb-input');
const solidPresetsContainer = document.getElementById('solidPresets');

// Gradient Related Elements
const gradientPreview = document.querySelector('.gradient-preview');
const addStopBtn = document.getElementById('add-stop');
const removeStopBtn = document.getElementById('remove-stop');
const angleInput = document.querySelector('.gradient-angle');
const gradientHexInput = document.getElementById('hex-input-gradient');
const gradientRgbInput = document.getElementById('rgb-input-gradient');
const gradientColorArea = document.querySelector('#gradientEditor .color-area');
const gradientColorAreaThumb = document.querySelector('#gradientEditor .color-area-thumb');
const gradientHueSlider = document.querySelector('#gradientEditor .hue-slider');
const gradientHueThumb = document.querySelector('#gradientEditor .hue-slider-thumb');
const gradientPresetsContainer = document.getElementById('gradientPresets');

// --- STATE ---
let currentSolidHue = 200;
let currentSolidSaturation = 80;
let currentSolidValue = 70;
let currentTab = 'solid'; // Default to solid tab

let isSolidDragging = false;
let solidDragType = null; // 'color' or 'hue'

// Gradient state
let gradientStopsData = [
  { position: 0, color: '#3d3393' },
  { position: 33, color: '#2b76b9' },
  { position: 66, color: '#2cacd1' },
  { position: 100, color: '#35eb93' }
];
let activeStopIndex = 0;
let gradientAngle = 90;
let isGradientDragging = false;
let gradientDragType = null; // 'color', 'hue', 'stop'
let draggingStopElement = null;
let currentGradientHue = 200;
let currentGradientSaturation = 80;
let currentGradientValue = 70;

// =======================================
// Color conversion utilities (KEEPING THESE)
// =======================================

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
}

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

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h;
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
  const s = max === 0 ? 0 : delta / max;
  return {
    h: h,
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

function getPerceivedBrightness(r, g, b) {
  return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}

// =======================================
// NEW SOLID COLOR PICKER SYSTEM
// =======================================

function updateSolidColorPickerUI() {
  if (!solidColorArea || !solidHueSlider || !solidColorAreaThumb || !solidHueThumb || !solidHexInput || !solidRgbInput) {
    // console.warn("Solid color picker elements not found, skipping UI update.");
    return;
  }

  const rgb = hsvToRgb(currentSolidHue, currentSolidSaturation, currentSolidValue);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  // Update color area background (pure hue)
  // The color-area-inner div is responsible for the base hue background
  const colorAreaInner = solidColorArea.querySelector('.color-area-inner');
  if (colorAreaInner) {
     colorAreaInner.style.backgroundColor = `hsl(${currentSolidHue}, 100%, 50%)`;
  }


  // Update thumb positions
  const colorAreaRect = solidColorArea.getBoundingClientRect();
  const hueSliderRect = solidHueSlider.getBoundingClientRect();

  if (colorAreaRect.width > 0 && colorAreaRect.height > 0) {
    const saturationPos = (currentSolidSaturation / 100) * colorAreaRect.width;
    const valuePos = ((100 - currentSolidValue) / 100) * colorAreaRect.height;
    solidColorAreaThumb.style.left = `${saturationPos}px`;
    solidColorAreaThumb.style.top = `${valuePos}px`;
  }
  solidColorAreaThumb.style.backgroundColor = hex;

  if (hueSliderRect.width > 0) {
    const huePos = (currentSolidHue / 360) * hueSliderRect.width;
    solidHueThumb.style.left = `${huePos}px`;
  }
  solidHueThumb.style.backgroundColor = `hsl(${currentSolidHue}, 100%, 50%)`;

  // Update input fields
  solidHexInput.value = hex;
  solidRgbInput.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  // REMOVED: Update main page accent color - we no longer want the color picker to affect the page
  // Now the color will only affect the picker itself
}

function handleSolidColorAreaInteraction(e) {
  if (!solidColorArea) return;
  const rect = solidColorArea.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return; // Avoid division by zero if not visible

  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;

  currentSolidSaturation = Math.max(0, Math.min(100, (x / rect.width) * 100));
  currentSolidValue = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));
  updateSolidColorPickerUI();
}

function handleSolidHueSliderInteraction(e) {
  if (!solidHueSlider) return;
  const rect = solidHueSlider.getBoundingClientRect();
   if (rect.width === 0) return; // Avoid division by zero if not visible

  let x = e.clientX - rect.left;
  currentSolidHue = Math.max(0, Math.min(359.99, (x / rect.width) * 360)); // Max 359.99 to avoid jump to 0
  updateSolidColorPickerUI();
}

// Solid Color Picker Event Listeners
if (solidColorArea) {
  solidColorArea.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isSolidDragging = true;
    solidDragType = 'color';
    solidColorArea.setPointerCapture(e.pointerId);
    handleSolidColorAreaInteraction(e);
  });
}

if (solidHueSlider) {
  solidHueSlider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isSolidDragging = true;
    solidDragType = 'hue';
    solidHueSlider.setPointerCapture(e.pointerId);
    handleSolidHueSliderInteraction(e);
  });
}

document.addEventListener('pointermove', (e) => {
  if (!isGradientDragging && !isSolidDragging) return;
  
  if (isSolidDragging) {
    if (solidDragType === 'color') {
      handleSolidColorAreaInteraction(e);
    } else if (solidDragType === 'hue') {
      handleSolidHueSliderInteraction(e);
    }
  } else if (isGradientDragging) {
    if (gradientDragType === 'color') {
      handleGradientColorAreaInteraction(e);
    } else if (gradientDragType === 'hue') {
      handleGradientHueSliderInteraction(e);
    } else if (gradientDragType === 'stop') {
      moveGradientStop(e);
    }
  }
});

document.addEventListener('pointerup', (e) => {
  if (isSolidDragging) {
    if (solidColorArea && solidColorArea.hasPointerCapture(e.pointerId)) {
      solidColorArea.releasePointerCapture(e.pointerId);
    } else if (solidHueSlider && solidHueSlider.hasPointerCapture(e.pointerId)) {
      solidHueSlider.releasePointerCapture(e.pointerId);
    }
    isSolidDragging = false;
    solidDragType = null;
  }
  
  if (isGradientDragging) {
    if (gradientColorArea && gradientColorArea.hasPointerCapture(e.pointerId)) {
      gradientColorArea.releasePointerCapture(e.pointerId);
    } else if (gradientHueSlider && gradientHueSlider.hasPointerCapture(e.pointerId)) {
      gradientHueSlider.releasePointerCapture(e.pointerId);
    } else if (draggingStopElement && draggingStopElement.hasPointerCapture(e.pointerId)) {
      draggingStopElement.releasePointerCapture(e.pointerId);
    }
    isGradientDragging = false;
    gradientDragType = null;
    draggingStopElement = null;
  }
});

if (solidHexInput) {
  solidHexInput.addEventListener('change', (e) => {
    const hex = e.target.value.trim();
    const rgb = hexToRgb(hex);
    if (rgb) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      currentSolidHue = hsv.h;
      currentSolidSaturation = hsv.s;
      currentSolidValue = hsv.v;
      updateSolidColorPickerUI();
    } else { // Reset to current if invalid
      updateSolidColorPickerUI(); // This will repopulate the input with the valid current color
    }
  });
}

if (solidRgbInput) {
  solidRgbInput.addEventListener('change', (e) => {
    const parts = e.target.value.split(',');
    if (parts.length === 3) {
        const r = parseInt(parts[0].trim(), 10);
        const g = parseInt(parts[1].trim(), 10);
        const b = parseInt(parts[2].trim(), 10);
        if (![r,g,b].some(isNaN) && [r,g,b].every(v => v >=0 && v <= 255)) {
             const hsv = rgbToHsv(r, g, b);
            currentSolidHue = hsv.h;
            currentSolidSaturation = hsv.s;
            currentSolidValue = hsv.v;
            updateSolidColorPickerUI();
            return;
        }
    }
    // If input is invalid, reset to current color
    updateSolidColorPickerUI();
  });
}


// =======================================
// NEW SOLID PRESET SYSTEM
// =======================================
const solidColorPresets = [
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

function createSolidPresetItem(name, color) {
  const presetItem = document.createElement('div');
  presetItem.className = 'preset-item';
  presetItem.setAttribute('role', 'button');
  presetItem.setAttribute('tabindex', '0');
  presetItem.setAttribute('aria-label', `Preset: ${name}`);

  const presetPreview = document.createElement('div');
  presetPreview.className = 'preset-preview';
  presetPreview.style.backgroundColor = color;

  const presetLabel = document.createElement('div');
  presetLabel.className = 'preset-label';
  presetLabel.textContent = name;

  presetItem.appendChild(presetPreview);
  presetItem.appendChild(presetLabel);

  const applyPreset = () => {
    const rgb = hexToRgb(color);
    if (rgb) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      currentSolidHue = hsv.h;
      currentSolidSaturation = hsv.s;
      currentSolidValue = hsv.v;
      updateSolidColorPickerUI();
    }
  };

  presetItem.addEventListener('click', applyPreset);
  presetItem.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // Prevent space from scrolling page
      applyPreset();
    }
  });
  return presetItem;
}

function loadSolidPresets() {
  if (!solidPresetsContainer) return;
  solidPresetsContainer.innerHTML = ''; // Clear existing

  const container = document.createElement('div');
  container.className = 'presets-container';

  const header = document.createElement('div');
  header.className = 'presets-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('tabindex', '0');

  const titleEl = document.createElement('h4');
  titleEl.className = 'presets-title';
  titleEl.textContent = 'Solid Color Presets'; // Title specific to solid presets

  const toggle = document.createElement('span');
  toggle.className = 'presets-toggle'; // Icon is usually handled by CSS

  header.appendChild(titleEl);
  header.appendChild(toggle);

  const grid = document.createElement('div');
  grid.className = 'presets-grid';

  solidColorPresets.forEach(preset => {
    grid.appendChild(createSolidPresetItem(preset.name, preset.color));
  });

  const toggleExpansion = () => {
    const isExpanded = header.classList.toggle('expanded');
    grid.classList.toggle('collapsed', !isExpanded);
    header.setAttribute('aria-expanded', isExpanded.toString());
  };

  // Initial state - expanded
  header.classList.add('expanded');

  header.addEventListener('click', toggleExpansion);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpansion();
    }
  });

  container.appendChild(header);
  container.appendChild(grid);
  solidPresetsContainer.appendChild(container);
}

// =======================================
// NEW GRADIENT SYSTEM
// =======================================

// Gradient presets
const gradientPresets = [
  { name: "Midnight Bloom", colors: ['#3d3393', '#2b76b9', '#2cacd1', '#35eb93'], angle: 90 },
  { name: "Sunset Vibes", colors: ['#ff7e5f', '#feb47b'], angle: 45 },
  { name: "Cosmic Fusion", colors: ['#330867', '#30cfd0'], angle: 120 },
  { name: "Northern Lights", colors: ['#4facfe', '#00f2fe'], angle: 225 },
  { name: "Cherry Blossom", colors: ['#f093fb', '#f5576c'], angle: 315 },
  { name: "Ocean Depths", colors: ['#0f0c29', '#302b63', '#24243e'], angle: 180 },
  { name: "Autumn Leaves", colors: ['#f46b45', '#eea849'], angle: 135 },
  { name: "Electric Violet", colors: ['#4776E6', '#8E54E9'], angle: 70 },
  { name: "Lush Meadow", colors: ['#56ab2f', '#a8e063'], angle: 200 },
  { name: "Fiery Passion", colors: ['#f12711', '#f5af19'], angle: 270 }
];

function createGradientPresetItem(name, colors, angle) {
  const presetItem = document.createElement('div');
  presetItem.className = 'preset-item';
  presetItem.setAttribute('role', 'button');
  presetItem.setAttribute('tabindex', '0');
  presetItem.setAttribute('aria-label', `Gradient Preset: ${name}`);

  const presetPreview = document.createElement('div');
  presetPreview.className = 'preset-preview';
  
  // Generate CSS gradient from colors
  let gradientCSS = `linear-gradient(${angle}deg`;
  if (colors.length === 2) {
    gradientCSS += `, ${colors[0]} 0%, ${colors[1]} 100%`;
  } else {
    const step = 100 / (colors.length - 1);
    colors.forEach((color, index) => {
      gradientCSS += `, ${color} ${Math.round(index * step)}%`;
    });
  }
  gradientCSS += ')';
  
  presetPreview.style.background = gradientCSS;

  const presetLabel = document.createElement('div');
  presetLabel.className = 'preset-label';
  presetLabel.textContent = name;

  presetItem.appendChild(presetPreview);
  presetItem.appendChild(presetLabel);

  const applyPreset = () => {
    // Convert preset to gradient stops
    gradientStopsData = [];
    const step = 100 / (colors.length - 1);
    colors.forEach((color, index) => {
      gradientStopsData.push({
        position: Math.round(index * step),
        color: color
      });
    });
    
    // Set gradient angle
    gradientAngle = angle;
    if (angleInput) {
      angleInput.value = angle;
    }
    
    // Update active stop to first one
    activeStopIndex = 0;
    
    // Update UI
    renderGradientStops();
    updateGradientPreview();
    updateGradientColorPicker();
  };

  presetItem.addEventListener('click', applyPreset);
  presetItem.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      applyPreset();
    }
  });
  
  return presetItem;
}

function loadGradientPresets() {
  if (!gradientPresetsContainer) return;
  gradientPresetsContainer.innerHTML = ''; // Clear existing

  const container = document.createElement('div');
  container.className = 'presets-container';

  const header = document.createElement('div');
  header.className = 'presets-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('tabindex', '0');

  const titleEl = document.createElement('h4');
  titleEl.className = 'presets-title';
  titleEl.textContent = 'Gradient Presets';

  const toggle = document.createElement('span');
  toggle.className = 'presets-toggle';

  header.appendChild(titleEl);
  header.appendChild(toggle);

  const grid = document.createElement('div');
  grid.className = 'presets-grid';

  gradientPresets.forEach(preset => {
    grid.appendChild(createGradientPresetItem(preset.name, preset.colors, preset.angle));
  });

  const toggleExpansion = () => {
    const isExpanded = header.classList.toggle('expanded');
    grid.classList.toggle('collapsed', !isExpanded);
    header.setAttribute('aria-expanded', isExpanded.toString());
  };

  // Initial state - expanded
  header.classList.add('expanded');

  header.addEventListener('click', toggleExpansion);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpansion();
    }
  });

  container.appendChild(header);
  container.appendChild(grid);
  gradientPresetsContainer.appendChild(container);
}

// Gradient Stops Management
function renderGradientStops() {
  // Get preview and ensure it exists
  if (!gradientPreview) return;
  
  // Get or create the stops container directly inside the preview
  let gradientStopsContainer = gradientPreview.querySelector('.gradient-stops');
  if (!gradientStopsContainer) {
    gradientStopsContainer = document.createElement('div');
    gradientStopsContainer.className = 'gradient-stops';
    gradientPreview.appendChild(gradientStopsContainer);
    
    // Add a track for the stops
    const track = document.createElement('div');
    track.className = 'gradient-stops-track';
    gradientPreview.appendChild(track);
  }
  
  // Clear existing stops
  gradientStopsContainer.innerHTML = '';
  
  // Don't render if the gradient tab isn't active
  if (currentTab !== 'gradient' || !settingsPopup.classList.contains('active')) {
    return;
  }
  
  // Create and position each stop
  gradientStopsData.forEach((stop, index) => {
    const stopElement = document.createElement('div');
    stopElement.className = 'gradient-stop';
    stopElement.style.color = stop.color;
    stopElement.style.left = `${stop.position}%`;
    
    if (index === activeStopIndex) {
      stopElement.classList.add('active');
    }
    
    // Store index in dataset for easy access
    stopElement.dataset.index = index;
    
    // Add event listeners for drag operations
    stopElement.addEventListener('pointerdown', handleGradientStopPointerDown);
    
    gradientStopsContainer.appendChild(stopElement);
  });
  
  // Update remove button state
  if (removeStopBtn) {
    removeStopBtn.disabled = gradientStopsData.length <= 2;
  }
}

function handleGradientStopPointerDown(e) {
  if (e.button !== 0) return; // Only left mouse button
  
  isGradientDragging = true;
  gradientDragType = 'stop';
  draggingStopElement = e.target;
  
  // Set pointer capture to the stop element
  draggingStopElement.setPointerCapture(e.pointerId);
  
  // Get the current stop index
  const index = parseInt(draggingStopElement.dataset.index, 10);
  setActiveGradientStop(index);
  
  // Mark as active and move to front
  draggingStopElement.classList.add('active');
  
  // Prevent default to avoid issues
  e.preventDefault();
}

function setActiveGradientStop(index) {
  if (index < 0 || index >= gradientStopsData.length) return;
  
  activeStopIndex = index;
  
  // Update active class on all stop elements
  const stopElements = gradientPreview.querySelectorAll('.gradient-stop');
  stopElements.forEach((el, i) => {
    el.classList.toggle('active', i === activeStopIndex);
  });
  
  // Update color picker with active stop color
  updateGradientColorPicker();
}

function moveGradientStop(e) {
  if (!isGradientDragging || gradientDragType !== 'stop' || !draggingStopElement) return;
  
  // Get preview rect for calculations
  const previewRect = gradientPreview.getBoundingClientRect();
  
  // Calculate position percentage
  let x = e.clientX - previewRect.left;
  let posPercent = (x / previewRect.width) * 100;
  posPercent = Math.max(0, Math.min(100, posPercent));
  
  // Get the current stop index
  const index = parseInt(draggingStopElement.dataset.index, 10);
  
  // Update the stop position in the data
  gradientStopsData[index].position = posPercent;
  
  // Update the stop element position
  draggingStopElement.style.left = `${posPercent}%`;
  
  // Sort stops by position
  const sortedStops = [...gradientStopsData].sort((a, b) => a.position - b.position);
  
  // Find the new index of our stop after sorting
  const newIndex = sortedStops.findIndex(stop => 
    Math.abs(stop.position - posPercent) < 0.01 && stop.color === gradientStopsData[index].color
  );
  
  // If the order has changed, update the data and rerender
  if (JSON.stringify(sortedStops) !== JSON.stringify(gradientStopsData)) {
    gradientStopsData = sortedStops;
    
    // Update active index to reflect the new position in the array
    activeStopIndex = newIndex;
    
    // Rerender all stops to update their indices
    renderGradientStops();
  }
  
  // Update the gradient preview
  updateGradientPreview();
}

function handleGradientColorAreaInteraction(e) {
  if (!gradientColorArea) return;
  const rect = gradientColorArea.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return; // Avoid division by zero if not visible

  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;

  currentGradientSaturation = Math.max(0, Math.min(100, (x / rect.width) * 100));
  currentGradientValue = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));
  
  updateActiveGradientStop();
}

function handleGradientHueSliderInteraction(e) {
  if (!gradientHueSlider) return;
  const rect = gradientHueSlider.getBoundingClientRect();
  if (rect.width === 0) return; // Avoid division by zero if not visible

  let x = e.clientX - rect.left;
  currentGradientHue = Math.max(0, Math.min(359.99, (x / rect.width) * 360)); // Max 359.99 to avoid jump to 0
  
  updateActiveGradientStop();
}

function updateActiveGradientStop() {
  if (activeStopIndex < 0 || activeStopIndex >= gradientStopsData.length) return;
  
  // Convert current HSV to RGB and HEX
  const rgb = hsvToRgb(currentGradientHue, currentGradientSaturation, currentGradientValue);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  
  // Update the active stop color
  gradientStopsData[activeStopIndex].color = hex;
  
  // Update UI
  updateGradientColorPicker();
  renderGradientStops();
  updateGradientPreview();
}

function updateGradientColorPicker() {
  if (!gradientColorArea || !gradientHueSlider || !gradientColorAreaThumb || !gradientHueThumb || 
      !gradientHexInput || !gradientRgbInput || activeStopIndex < 0 || activeStopIndex >= gradientStopsData.length) {
    return;
  }
  
  // Get active stop color
  const stopColor = gradientStopsData[activeStopIndex].color;
  const rgb = hexToRgb(stopColor);
  
  if (!rgb) return;
  
  // Convert to HSV
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  currentGradientHue = hsv.h;
  currentGradientSaturation = hsv.s;
  currentGradientValue = hsv.v;
  
  // Update color area background (pure hue)
  const colorAreaInner = gradientColorArea.querySelector('.color-area-inner');
  if (colorAreaInner) {
    colorAreaInner.style.backgroundColor = `hsl(${currentGradientHue}, 100%, 50%)`;
  }
  
  // Update thumb positions
  const colorAreaRect = gradientColorArea.getBoundingClientRect();
  const hueSliderRect = gradientHueSlider.getBoundingClientRect();
  
  if (colorAreaRect.width > 0 && colorAreaRect.height > 0) {
    const saturationPos = (currentGradientSaturation / 100) * colorAreaRect.width;
    const valuePos = ((100 - currentGradientValue) / 100) * colorAreaRect.height;
    gradientColorAreaThumb.style.left = `${saturationPos}px`;
    gradientColorAreaThumb.style.top = `${valuePos}px`;
  }
  gradientColorAreaThumb.style.backgroundColor = stopColor;
  
  if (hueSliderRect.width > 0) {
    const huePos = (currentGradientHue / 360) * hueSliderRect.width;
    gradientHueThumb.style.left = `${huePos}px`;
  }
  gradientHueThumb.style.backgroundColor = `hsl(${currentGradientHue}, 100%, 50%)`;
  
  // Update input fields
  gradientHexInput.value = stopColor;
  gradientRgbInput.value = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function updateGradientPreview() {
  if (!gradientPreview) return;
  
  // Create CSS gradient string
  let cssGradient = `linear-gradient(${gradientAngle}deg`;
  
  // Add each stop
  gradientStopsData.forEach(stop => {
    cssGradient += `, ${stop.color} ${stop.position}%`;
  });
  
  cssGradient += ')';
  
  // Update CSS variables - but only for the gradient preview
  document.documentElement.style.setProperty('--current-gradient', cssGradient);
  
  // Set the gradient directly on the preview element
  const beforeElement = gradientPreview.querySelector('::before');
  if (beforeElement) {
    beforeElement.style.background = cssGradient;
  } else {
    // If we can't access the ::before element directly, update the style inline
    gradientPreview.style.setProperty('--preview-gradient', cssGradient);
  }
  
  // REMOVED: We no longer want to update the accent gradient for the page
  // The gradient will only affect the picker itself
}

// Function to update text color based on gradient brightness
function updateGradientTextColor() {
  // For simplicity, we'll just use the colors of the first and last stops
  if (gradientStopsData.length < 2) return;
  
  const firstColor = hexToRgb(gradientStopsData[0].color);
  const lastColor = hexToRgb(gradientStopsData[gradientStopsData.length - 1].color);
  
  if (!firstColor || !lastColor) return;
  
  // Calculate average brightness
  const firstBrightness = getPerceivedBrightness(firstColor.r, firstColor.g, firstColor.b);
  const lastBrightness = getPerceivedBrightness(lastColor.r, lastColor.g, lastColor.b);
  const avgBrightness = (firstBrightness + lastBrightness) / 2;
  
  // Set text color based on brightness
  const isDark = avgBrightness < 140; // Higher threshold for gradients
  document.documentElement.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
}

// Clean up gradient stops when modal is hidden or scrolled
function hideGradientStops() {
  if (gradientStopsContainer) {
    gradientStopsContainer.innerHTML = '';
  }
}

// Event listener for scrolling
window.addEventListener('scroll', () => {
  if (currentTab === 'gradient' && settingsPopup.classList.contains('active')) {
    renderGradientStops();
  } else {
    hideGradientStops();
  }
});

// Update event handler for when settings popup is closed
document.addEventListener('mousedown', (e) => {
  if (settingsPopup && settingsPopup.classList.contains('active') &&
      !settingsPopup.contains(e.target) &&
      !settingsBtn.contains(e.target)) {
    settingsPopup.classList.remove('active');
    if (settingsBtn) settingsBtn.classList.remove('active');
    hideGradientStops();
  }
});

// =======================================
// Settings Popup & Tab Switching (ADAPTED)
// =======================================

if (settingsBtn && settingsPopup) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from immediately closing due to document listener
      const isActive = settingsPopup.classList.toggle('active');
      settingsBtn.classList.toggle('active', isActive);

      if (isActive) {
        if (currentTab === 'solid') {
          updateSolidColorPickerUI(); // Ensure it's up-to-date when opening
        } else if (currentTab === 'gradient') {
          // Initialize gradient picker when opened
          renderGradientStops();
          updateGradientPreview();
          updateGradientColorPicker();
        }
      } else {
        // Clean up stops when closing
        if (gradientPreview) {
          const stopsContainer = gradientPreview.querySelector('.gradient-stops');
          if (stopsContainer) stopsContainer.innerHTML = '';
        }
      }
    });
}

document.addEventListener('mousedown', (e) => {
  if (settingsPopup && settingsPopup.classList.contains('active') &&
      !settingsPopup.contains(e.target) &&
      !settingsBtn.contains(e.target)) {
    settingsPopup.classList.remove('active');
    if (settingsBtn) settingsBtn.classList.remove('active');
    
    // Clean up stops when closing
    if (gradientPreview) {
      const stopsContainer = gradientPreview.querySelector('.gradient-stops');
      if (stopsContainer) stopsContainer.innerHTML = '';
    }
  }
});

if (tabSwitcher) {
  tabSwitcher.addEventListener('click', (e) => {
    const tabOption = e.target.closest('.tab-option');
    if (tabOption && !tabOption.classList.contains('active')) { // Only switch if not already active
      const targetTab = tabOption.dataset.tab;

      document.querySelectorAll('.tab-option').forEach(tab => {
        const isActive = tab.dataset.tab === targetTab;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive.toString());
      });

      const indicator = tabSwitcher.querySelector('.tab-indicator');
      if (indicator) {
        indicator.setAttribute('data-tab', targetTab);
      }

      currentTab = targetTab;

      if (targetTab === 'solid') {
        if (solidPicker) {
            solidPicker.classList.remove('hidden');
            solidPicker.style.opacity = '1';
            solidPicker.style.pointerEvents = 'auto';
        }
        if (gradientEditor) {
            gradientEditor.classList.remove('active');
            gradientEditor.style.opacity = '0';
            gradientEditor.style.pointerEvents = 'none';
        }
        updateSolidColorPickerUI(); // Update solid picker UI and page colors
      } else { // Gradient tab
        if (gradientEditor) {
            gradientEditor.classList.add('active');
            gradientEditor.style.opacity = '1';
            gradientEditor.style.pointerEvents = 'auto';
        }
        if (solidPicker) {
            solidPicker.classList.add('hidden');
            solidPicker.style.opacity = '0';
            solidPicker.style.pointerEvents = 'none';
        }
        
        // Update gradient UI
        renderGradientStops();
        updateGradientPreview();
        updateGradientColorPicker();
      }
    }
  });
}

// =======================================
// Initialization
// =======================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize solid picker
  if (solidPicker) {
    updateSolidColorPickerUI();
  }
  if (solidPresetsContainer) {
    loadSolidPresets();
  }
  
  // Initialize gradient picker
  if (gradientPresetsContainer) {
    loadGradientPresets();
  }
  
  // Set initial tab state correctly
  if (solidPicker) {
    solidPicker.classList.remove('hidden');
    solidPicker.style.opacity = '1';
    solidPicker.style.pointerEvents = 'auto';
  }
  if (gradientEditor) {
    gradientEditor.classList.remove('active');
    gradientEditor.style.opacity = '0';
    gradientEditor.style.pointerEvents = 'none';
  }
  
  const activeTabOption = tabSwitcher ? tabSwitcher.querySelector(`.tab-option[data-tab="${currentTab}"]`) : null;
  const indicator = tabSwitcher ? tabSwitcher.querySelector('.tab-indicator') : null;

  document.querySelectorAll('.tab-option').forEach(tab => {
    const isActuallyActive = tab.dataset.tab === currentTab;
    tab.classList.toggle('active', isActuallyActive);
    tab.setAttribute('aria-selected', isActuallyActive.toString());
  });

  if (indicator) {
    indicator.setAttribute('data-tab', currentTab);
  }
  
  console.log('Color Picker Initialized. Current tab:', currentTab);
});

// Gradient Color Picker Event Listeners
if (gradientColorArea) {
  gradientColorArea.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isGradientDragging = true;
    gradientDragType = 'color';
    gradientColorArea.setPointerCapture(e.pointerId);
    handleGradientColorAreaInteraction(e);
  });
}

if (gradientHueSlider) {
  gradientHueSlider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isGradientDragging = true;
    gradientDragType = 'hue';
    gradientHueSlider.setPointerCapture(e.pointerId);
    handleGradientHueSliderInteraction(e);
  });
}

// Add gradient stop
if (addStopBtn) {
  addStopBtn.addEventListener('click', () => {
    // Find a position between two existing stops or at the midpoint
    let newPosition = 50; // Default middle
    
    if (gradientStopsData.length >= 2) {
      // Find largest gap
      let maxGap = 0;
      let gapPosition = 0;
      
      for (let i = 0; i < gradientStopsData.length - 1; i++) {
        const gap = gradientStopsData[i+1].position - gradientStopsData[i].position;
        if (gap > maxGap) {
          maxGap = gap;
          gapPosition = gradientStopsData[i].position + gap/2;
        }
      }
      
      newPosition = gapPosition;
    }
    
    // Create a blended color for the new stop
    let newColor = '#ffffff'; // Default
    
    if (gradientStopsData.length >= 2) {
      // Find stops on either side of new position
      let lowerStop = null;
      let upperStop = null;
      
      for (const stop of gradientStopsData) {
        if (stop.position < newPosition) {
          if (!lowerStop || stop.position > lowerStop.position) {
            lowerStop = stop;
          }
        } else if (stop.position > newPosition) {
          if (!upperStop || stop.position < upperStop.position) {
            upperStop = stop;
          }
        }
      }
      
      if (lowerStop && upperStop) {
        // Blend colors
        const lowerRgb = hexToRgb(lowerStop.color);
        const upperRgb = hexToRgb(upperStop.color);
        const totalDist = upperStop.position - lowerStop.position;
        const ratio = (newPosition - lowerStop.position) / totalDist;
        
        const blendedRgb = {
          r: Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * ratio),
          g: Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * ratio),
          b: Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * ratio)
        };
        
        newColor = rgbToHex(blendedRgb.r, blendedRgb.g, blendedRgb.b);
      } else if (lowerStop) {
        newColor = lowerStop.color;
      } else if (upperStop) {
        newColor = upperStop.color;
      }
    }
    
    // Add new stop
    gradientStopsData.push({
      position: newPosition,
      color: newColor
    });
    
    // Sort by position
    gradientStopsData.sort((a, b) => a.position - b.position);
    
    // Set as active
    activeStopIndex = gradientStopsData.findIndex(stop => 
      Math.abs(stop.position - newPosition) < 0.01 && stop.color === newColor
    );
    
    // Update UI
    renderGradientStops();
    updateGradientPreview();
    updateGradientColorPicker();
  });
}

// Remove gradient stop
if (removeStopBtn) {
  removeStopBtn.addEventListener('click', () => {
    if (gradientStopsData.length <= 2 || activeStopIndex < 0) return;
    
    // Remove the active stop
    gradientStopsData.splice(activeStopIndex, 1);
    
    // Update active index
    activeStopIndex = Math.min(activeStopIndex, gradientStopsData.length - 1);
    
    // Update UI
    renderGradientStops();
    updateGradientPreview();
    updateGradientColorPicker();
  });
}

if (gradientHexInput) {
  gradientHexInput.addEventListener('change', (e) => {
    const hex = e.target.value.trim();
    const rgb = hexToRgb(hex);
    if (rgb && activeStopIndex >= 0 && activeStopIndex < gradientStopsData.length) {
      gradientStopsData[activeStopIndex].color = hex;
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      currentGradientHue = hsv.h;
      currentGradientSaturation = hsv.s;
      currentGradientValue = hsv.v;
      updateGradientColorPicker();
      renderGradientStops();
      updateGradientPreview();
    } else {
      updateGradientColorPicker(); // Reset to current if invalid
    }
  });
}

if (gradientRgbInput) {
  gradientRgbInput.addEventListener('change', (e) => {
    const parts = e.target.value.split(',');
    if (parts.length === 3 && activeStopIndex >= 0 && activeStopIndex < gradientStopsData.length) {
      const r = parseInt(parts[0].trim(), 10);
      const g = parseInt(parts[1].trim(), 10);
      const b = parseInt(parts[2].trim(), 10);
      if (![r,g,b].some(isNaN) && [r,g,b].every(v => v >=0 && v <= 255)) {
        const hex = rgbToHex(r, g, b);
        gradientStopsData[activeStopIndex].color = hex;
        const hsv = rgbToHsv(r, g, b);
        currentGradientHue = hsv.h;
        currentGradientSaturation = hsv.s;
        currentGradientValue = hsv.v;
        updateGradientColorPicker();
        renderGradientStops();
        updateGradientPreview();
        return;
      }
    }
    // If input is invalid, reset to current color
    updateGradientColorPicker();
  });
}

// Sync gradient stops position when window resizes
window.addEventListener('resize', () => {
  if (currentTab === 'gradient' && settingsPopup.classList.contains('active')) {
    renderGradientStops();
  }
});

// Update gradient stops when modal is shown
const updateGradientStopsPosition = () => {
  if (currentTab === 'gradient' && settingsPopup.classList.contains('active')) {
    renderGradientStops();
  }
};

// Handle scroll and resize events
window.addEventListener('scroll', () => {
  if (currentTab === 'gradient' && settingsPopup.classList.contains('active')) {
    renderGradientStops();
  }
});

window.addEventListener('resize', () => {
  if (currentTab === 'gradient' && settingsPopup.classList.contains('active')) {
    renderGradientStops();
  }
});

// Animation handling for homepage elements
document.addEventListener('DOMContentLoaded', function() {
  // Remove old code that's no longer needed
  const animateElements = document.querySelectorAll('.animate-subtitle, .animate-button');
  
  // Make sure all animated elements have their animations properly triggered
  setTimeout(() => {
    animateElements.forEach(el => {
      el.style.opacity = "";
    });
  }, 100);
});
