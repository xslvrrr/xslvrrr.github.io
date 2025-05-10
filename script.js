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

// Gradient Related Elements (will be handled later)
const gradientPreview = document.querySelector('.gradient-preview');
const gradientStopsPortal = document.getElementById('gradientStopsPortal');
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

// Gradient state (to be properly initialized later)
let gradientStopsData = [
  { position: 0, color: '#3d3393' },
  { position: 33, color: '#2b76b9' },
  { position: 66, color: '#2cacd1' },
  { position: 100, color: '#35eb93' }
];
let activeStopIndex = 0;
let gradientAngle = 90;


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

  // Update main page accent color
  const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
  const isDark = brightness < 120;
  document.documentElement.style.setProperty('--accent-color', hex);
  document.documentElement.style.setProperty('--accent-darker', rgbToHex(
    Math.max(0, Math.round(rgb.r * 0.8)),
    Math.max(0, Math.round(rgb.g * 0.8)),
    Math.max(0, Math.round(rgb.b * 0.8))
  ));
  // Only update accent-gradient if solid tab is active
  if (currentTab === 'solid') {
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`);
  }
  document.documentElement.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
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
  if (!isSolidDragging) return;
  // Prevent default browser drag behavior if needed
  // e.preventDefault(); 
  if (solidDragType === 'color') {
    handleSolidColorAreaInteraction(e);
  } else if (solidDragType === 'hue') {
    handleSolidHueSliderInteraction(e);
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
  header.className = 'presets-header expanded'; // Expanded by default
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
  grid.className = 'presets-grid expanded'; // Expanded by default

  solidColorPresets.forEach(preset => {
    grid.appendChild(createSolidPresetItem(preset.name, preset.color));
  });

  const toggleExpansion = () => {
    const isExpanded = header.classList.toggle('expanded');
    grid.classList.toggle('expanded', isExpanded);
    header.setAttribute('aria-expanded', isExpanded.toString());
  };

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
          // TODO: Initialize gradient picker when it's rebuilt
           console.log("Gradient tab active on popup open - needs re-init logic");
           // For now, ensure gradient editor is visible if it's the active tab
           if (gradientEditor) gradientEditor.classList.add('active');
           if (solidPicker) solidPicker.classList.add('hidden');
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
            // Force reflow for transition
            // solidPicker.offsetHeight;
            solidPicker.style.opacity = '1';
            solidPicker.style.pointerEvents = 'auto';
            // solidPicker.style.transform = 'translateY(0)';
        }
        if (gradientEditor) {
            gradientEditor.classList.remove('active');
            gradientEditor.style.opacity = '0';
            gradientEditor.style.pointerEvents = 'none';
            // gradientEditor.style.transform = 'translateY(10px)';
        }
        updateSolidColorPickerUI(); // Update solid picker UI and page colors
      } else { // Gradient tab
        if (gradientEditor) {
            gradientEditor.classList.add('active');
             // Force reflow for transition
            // gradientEditor.offsetHeight;
            gradientEditor.style.opacity = '1';
            gradientEditor.style.pointerEvents = 'auto';
            // gradientEditor.style.transform = 'translateY(0)';
        }
        if (solidPicker) {
            solidPicker.classList.add('hidden');
            solidPicker.style.opacity = '0';
            solidPicker.style.pointerEvents = 'none';
            // solidPicker.style.transform = 'translateY(10px)';
        }
        
        // TODO: Initialize/update gradient picker when it's rebuilt
        // This part will need to be updated when gradient logic is in place.
        const tempGradientCSS = `linear-gradient(${gradientAngle}deg, ${gradientStopsData.map(s => `${s.color} ${s.position}%`).join(', ')})`;
        document.documentElement.style.setProperty('--accent-gradient', tempGradientCSS);
        // Also, if you have a color picker for gradient stops, it should be updated here.
        console.log("Switched to Gradient tab - needs full update logic for its color picker and stops.");
      }
    }
  });
}

// =======================================
// Initialization
// =======================================
document.addEventListener('DOMContentLoaded', () => {
  if (solidPicker) { // Ensure solid picker exists
    updateSolidColorPickerUI();
  }
  if (solidPresetsContainer) { // Ensure preset container exists
    loadSolidPresets();
  }

  // Set initial tab state correctly (solid picker visible, gradient hidden)
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
