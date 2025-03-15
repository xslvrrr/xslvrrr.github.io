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
const hueThumbGradient = document.querySelector('.gradient-editor .hue-slider-thumb');

const gradientPreview = document.querySelector('.gradient-preview');
const gradientStops = document.querySelector('.gradient-stops');
const addStopBtn = document.getElementById('add-stop');
const removeStopBtn = document.getElementById('remove-stop');
const angleInput = document.querySelector('.gradient-angle');
const hexInputGradient = document.getElementById('hex-input-gradient');
const rgbInputGradient = document.getElementById('rgb-input-gradient');

let currentHue = 168; // Initial hue for #00b894
let currentSaturation = 100;
let currentValue = 72;
let isDraggingHue = false;
let isDraggingColor = false;
let isMouseDownOnPicker = false;

let gradientStopsData = [
  { position: 0, color: '#00b894' },
  { position: 100, color: '#01976d' }
];
let activeStopIndex = 0;
let isDraggingStop = false;

// Handle gradient stop drag with better event tracking
let currentDragTarget = null;

// Track current tab to handle state preservation
let currentTab = 'solid';

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

// Update the color picker UI with improved error handling
function updateColorPicker(h, s, v, isGradient = false) {
  try {
    const elements = isGradient ? {
      colorArea: colorAreaGradient,
      colorAreaInner: colorAreaInnerGradient,
      colorAreaThumb: colorAreaThumbGradient,
      hueSlider: hueSliderGradient,
      hueThumb: hueThumbGradient,
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

    // Check if elements exist
    if (!elements.colorAreaInner || !elements.colorAreaThumb || !elements.hueThumb) {
      console.error("Missing required DOM elements for color picker");
      return;
    }

    // Update color area background
    elements.colorAreaInner.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
    
    // Get dimensions with fallbacks
    const colorAreaWidth = elements.colorArea.offsetWidth || 200;
    const colorAreaHeight = elements.colorArea.offsetHeight || 200;
    const hueSliderWidth = elements.hueSlider.offsetWidth || 200;
    
    // Update thumbs position
    const saturationX = ((100 - s) / 100) * colorAreaWidth;
    const valueY = ((100 - v) / 100) * colorAreaHeight;
    const hueX = (h / 360) * hueSliderWidth;
    
    elements.colorAreaThumb.style.left = `${saturationX}px`;
    elements.colorAreaThumb.style.top = `${valueY}px`;
    elements.hueThumb.style.left = `${hueX}px`;
    
    // Convert to RGB and update inputs
    const rgb = hsvToRgb(h, s, v);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    
    // Update color thumb background
    elements.colorAreaThumb.style.backgroundColor = hex;
    
    // Update inputs
    elements.hexInput.value = hex;
    elements.rgbInput.value = `${rgb.r},${rgb.g},${rgb.b}`;

    if (isGradient) {
      updateGradientStopColor(h, s, v);
    } else {
      // Calculate brightness and update text colors
      const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
      const isDark = brightness < 180;
      
      // Update CSS variables for solid color
      document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`);
      document.documentElement.style.setProperty('--accent-color', hex);
      document.documentElement.style.setProperty('--accent-darker', rgbToHex(
        rgb.r * 0.7,
        rgb.g * 0.7,
        rgb.b * 0.7
      ));
      document.documentElement.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
    }
  } catch (e) {
    console.error("Error updating color picker:", e);
  }
}

// Performance optimization - use pointer events for smoother dragging
function setupColorAreaEvents(colorArea, isGradient) {
  let isDragging = false;

  colorArea.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    isDraggingColor = true;
    colorArea.setPointerCapture(e.pointerId);
    updateColorFromEvent(e, colorArea, isGradient);
  });

  colorArea.addEventListener('pointermove', (e) => {
    if (isDragging) {
      updateColorFromEvent(e, colorArea, isGradient);
    }
  });

  colorArea.addEventListener('pointerup', (e) => {
    if (isDragging) {
      isDragging = false;
      isDraggingColor = false;
      colorArea.releasePointerCapture(e.pointerId);
    }
  });

  colorArea.addEventListener('pointercancel', (e) => {
    isDragging = false;
    isDraggingColor = false;
    colorArea.releasePointerCapture(e.pointerId);
  });
}

// Handle hue slider interactions using pointer events
function setupHueSliderEvents(hueSlider, isGradient) {
  let isDragging = false;

  hueSlider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    isDraggingHue = true;
    hueSlider.setPointerCapture(e.pointerId);
    updateHueFromEvent(e, hueSlider, isGradient);
  });

  hueSlider.addEventListener('pointermove', (e) => {
    if (isDragging) {
      updateHueFromEvent(e, hueSlider, isGradient);
    }
  });

  hueSlider.addEventListener('pointerup', (e) => {
    if (isDragging) {
      isDragging = false;
      isDraggingHue = false;
      hueSlider.releasePointerCapture(e.pointerId);
    }
  });

  hueSlider.addEventListener('pointercancel', (e) => {
    isDragging = false;
    isDraggingHue = false;
    hueSlider.releasePointerCapture(e.pointerId);
  });
}

// Optimize color updates with rAF and debouncing
let colorUpdateRAF = null;
function updateColorFromEvent(e, colorArea, isGradient) {
  if (colorUpdateRAF) return;
  
  colorUpdateRAF = requestAnimationFrame(() => {
    const rect = colorArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    currentSaturation = (1 - x) * 100;
    currentValue = 100 - (y * 100);
    
    // Preserve hue when at extreme values
    if (currentValue < 3 || (currentSaturation < 3 && currentValue > 97)) {
      // Keep current hue at extremes
    } else {
      // Normal processing
    }
    
    updateColorPicker(currentHue, currentSaturation, currentValue, isGradient);
    colorUpdateRAF = null;
  });
}

// Optimize hue updates with rAF and debouncing
let hueUpdateRAF = null;
function updateHueFromEvent(e, hueSlider, isGradient) {
  if (hueUpdateRAF) return;
  
  hueUpdateRAF = requestAnimationFrame(() => {
    const rect = hueSlider.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentHue = x * 360;
    updateColorPicker(currentHue, currentSaturation, currentValue, isGradient);
    hueUpdateRAF = null;
  });
}

// Setup events for both color pickers
setupColorAreaEvents(colorArea, false);
setupColorAreaEvents(colorAreaGradient, true);
setupHueSliderEvents(hueSlider, false);
setupHueSliderEvents(hueSliderGradient, true);

// Handle hex input for solid picker
hexInput.addEventListener('change', (e) => {
  const hex = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    currentHue = hsv.h;
    currentSaturation = hsv.s;
    currentValue = hsv.v;
    updateColorPicker(currentHue, currentSaturation, currentValue, false);
  }
});

// Handle RGB input for solid picker
rgbInput.addEventListener('change', (e) => {
  const values = e.target.value.split(',').map(v => parseInt(v.trim()));
  if (values.length === 3 && values.every(v => !isNaN(v) && v >= 0 && v <= 255)) {
    const hex = rgbToHex(values[0], values[1], values[2]);
    hexInput.value = hex;
    hexInput.dispatchEvent(new Event('change'));
  }
});

// Tab switching with better state management
tabSwitcher.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-option')) {
    const tab = e.target.dataset.tab;
    
    // Don't re-initialize if already on this tab
    if (currentTab === tab) return;
    
    // Update tab classes
    document.querySelectorAll('.tab-option').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    // Update indicator position immediately
    requestAnimationFrame(() => {
      updateTabIndicator();
    });
    
    // Save current tab
    currentTab = tab;
    
    if (tab === 'solid') {
      // First remove active from gradient, then remove hidden from solid
      gradientEditor.classList.remove('active');
      
      // Use requestAnimationFrame for proper transition
      requestAnimationFrame(() => {
        solidPicker.classList.remove('hidden');
        
        // Keep current solid color state
        const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const brightness = getPerceivedBrightness(rgb.r, rgb.g, rgb.b);
        const isDark = brightness < 180;
        
        document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`);
        document.documentElement.style.setProperty('--accent-color', hex);
        document.documentElement.style.setProperty('--accent-darker', rgbToHex(
          rgb.r * 0.7,
          rgb.g * 0.7,
          rgb.b * 0.7
        ));
        document.documentElement.style.setProperty('--accent-text', isDark ? '#ffffff' : '#000000');
        
        // Force update color picker UI
        updateColorPicker(currentHue, currentSaturation, currentValue, false);
      });
      
    } else if (tab === 'gradient') {
      // First hide solid picker
      solidPicker.classList.add('hidden');
      
      // Use setTimeout to ensure DOM updates first
      setTimeout(() => {
        // Show gradient editor
        gradientEditor.classList.add('active');
        
        // Ensure gradient stops are properly initialized
        initializeGradientEditor();
        
        // Force reflow and update UI
        gradientEditor.offsetHeight;
        
        // Update angle input interactivity
        if (angleInput) angleInput.disabled = false;
        
        // Update gradient preview with a slight delay to ensure components are mounted
        setTimeout(() => {
          updateGradientPreview();
          renderGradientStops();
        }, 50);
      }, 50);
    }
  }
});

// Handle gradient stop drag using pointer events
gradientStops.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('gradient-stop')) {
    e.stopPropagation();
    currentDragTarget = e.target;
    isDraggingStop = true;
    currentDragTarget.setPointerCapture(e.pointerId);
    
    const stops = Array.from(gradientStops.children);
    activeStopIndex = stops.indexOf(e.target);
    
    // Update active state and z-index
    stops.forEach((stop, index) => {
      if (index === activeStopIndex) {
        stop.classList.add('active');
        stop.style.zIndex = 1000;
      } else {
        stop.classList.remove('active');
        stop.style.zIndex = index;
      }
    });
    
    updateGradientPreview();
  }
});

// Handle gradient stop drag with pointer events
let stopDragRAF = null;
function handleGradientStopDrag(e) {
  if (isDraggingStop && currentDragTarget) {
    if (stopDragRAF) return;
    
    stopDragRAF = requestAnimationFrame(() => {
      const rect = gradientPreview.getBoundingClientRect();
      const position = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      
      // Update the data
      gradientStopsData[activeStopIndex].position = position;
      
      // Sort stops by position and update active index
      const oldStop = gradientStopsData[activeStopIndex];
      gradientStopsData.sort((a, b) => a.position - b.position);
      activeStopIndex = gradientStopsData.findIndex(stop => stop === oldStop);
      
      // Update DOM elements
      Array.from(gradientStops.children).forEach((stopEl, index) => {
        stopEl.style.left = `${gradientStopsData[index].position}%`;
        stopEl.style.zIndex = index === activeStopIndex ? 1000 : index;
        if (index === activeStopIndex) {
          stopEl.classList.add('active');
        } else {
          stopEl.classList.remove('active');
        }
      });
      
      // Update the preview
      updateGradientPreview();
      stopDragRAF = null;
    });
  }
}

// Use pointer events for gradient stops
gradientStops.addEventListener('pointermove', handleGradientStopDrag);

gradientStops.addEventListener('pointerup', (e) => {
  if (isDraggingStop && currentDragTarget) {
    isDraggingStop = false;
    currentDragTarget.releasePointerCapture(e.pointerId);
    currentDragTarget = null;
    renderGradientStops();
  }
});

gradientStops.addEventListener('pointercancel', (e) => {
  if (isDraggingStop && currentDragTarget) {
    isDraggingStop = false;
    currentDragTarget.releasePointerCapture(e.pointerId);
    currentDragTarget = null;
    renderGradientStops();
  }
});

// Remove old mouse event listeners
document.removeEventListener('mousemove', handleGradientStopDrag);
document.removeEventListener('mouseup', handleGradientStopDragEnd);

// Create gradient stop element with enhanced visibility
function createStopElement(position, color) {
  const stop = document.createElement('div');
  stop.className = 'gradient-stop';
  stop.style.left = `${position}%`;
  stop.style.backgroundColor = color;
  stop.style.color = color;
  stop.style.display = 'block';
  stop.style.visibility = 'visible';
  return stop;
}

// Update gradient preview with improved error handling
function updateGradientPreview() {
  try {
    // Sort by position
    gradientStopsData.sort((a, b) => a.position - b.position);
    
    // Create gradient using bezier-curve easing for smoother transitions
    let gradientString;
    
    if (gradientStopsData.length <= 2) {
      // Simple two-color gradient
      gradientString = gradientStopsData
        .map(stop => `${stop.color} ${stop.position}%`)
        .join(', ');
    } else {
      // Use simpler multi-stop gradient for better performance
      gradientString = gradientStopsData
        .map(stop => `${stop.color} ${stop.position}%`)
        .join(', ');
    }
    
    const angle = angleInput ? parseInt(angleInput.value) || 90 : 90;
    const gradient = `linear-gradient(${angle}deg, ${gradientString})`;
    
    // Apply gradient
    if (gradientPreview) {
      gradientPreview.style.background = gradient;
    }
    
    // Update global CSS variable
    document.documentElement.style.setProperty('--accent-gradient', gradient);
    
    // Ensure gradient stops are visible
    renderGradientStops();
    
    // Update color picker with active stop color
    const activeStop = gradientStopsData[activeStopIndex];
    if (activeStop) {
      const rgb = hexToRgb(activeStop.color);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        currentHue = hsv.h;
        currentSaturation = hsv.s;
        currentValue = hsv.v;
        
        // Update color picker UI without recursive calls
        if (hexInputGradient) hexInputGradient.value = activeStop.color;
        if (rgbInputGradient) rgbInputGradient.value = `${rgb.r},${rgb.g},${rgb.b}`;
        
        // Update gradient color area and hue slider without updating gradient again
        if (colorAreaInnerGradient) colorAreaInnerGradient.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
        
        if (colorAreaThumbGradient && colorAreaGradient && hueThumbGradient && hueSliderGradient) {
          // Dimensions with fallbacks
          const colorAreaWidth = colorAreaGradient.offsetWidth || 200;
          const colorAreaHeight = colorAreaGradient.offsetHeight || 200;
          const hueSliderWidth = hueSliderGradient.offsetWidth || 200;
          
          // Update positions
          const saturationX = ((100 - hsv.s) / 100) * colorAreaWidth;
          const valueY = ((100 - hsv.v) / 100) * colorAreaHeight;
          const hueX = (hsv.h / 360) * hueSliderWidth;
          
          colorAreaThumbGradient.style.left = `${saturationX}px`;
          colorAreaThumbGradient.style.top = `${valueY}px`;
          colorAreaThumbGradient.style.backgroundColor = activeStop.color;
          hueThumbGradient.style.left = `${hueX}px`;
        }
      }
    }
    
    // Calculate text color based on the average of gradient stops
    updateTextColorFromGradient();
  } catch (e) {
    console.error("Error updating gradient preview:", e);
  }
}

// Update text color based on gradient
function updateTextColorFromGradient() {
  // Calculate average brightness of gradient
  let totalBrightness = 0;
  let weightedTotal = 0;
  
  for (let i = 0; i < gradientStopsData.length - 1; i++) {
    const current = gradientStopsData[i];
    const next = gradientStopsData[i + 1];
    const segmentWidth = next.position - current.position;
    
    const currentRgb = hexToRgb(current.color);
    const nextRgb = hexToRgb(next.color);
    
    const currentBrightness = getPerceivedBrightness(currentRgb.r, currentRgb.g, currentRgb.b);
    const nextBrightness = getPerceivedBrightness(nextRgb.r, nextRgb.g, nextRgb.b);
    
    // Average brightness of this segment weighted by its width
    const segmentBrightness = (currentBrightness + nextBrightness) / 2;
    totalBrightness += segmentBrightness * segmentWidth;
    weightedTotal += segmentWidth;
  }
  
  const avgBrightness = totalBrightness / weightedTotal;
  document.documentElement.style.setProperty('--accent-text', avgBrightness < 180 ? '#ffffff' : '#000000');
}

// Render gradient stops
function renderGradientStops() {
  gradientStops.innerHTML = '';
  // Sort stops by position
  gradientStopsData.sort((a, b) => a.position - b.position);
  
  gradientStopsData.forEach((stop, index) => {
    const stopElement = createStopElement(stop.position, stop.color);
    if (index === activeStopIndex) {
      stopElement.classList.add('active');
    }
    // Set z-index based on whether it's active (highest) or position (higher = more priority)
    stopElement.style.zIndex = index === activeStopIndex ? 1000 : index;
    gradientStops.appendChild(stopElement);
  });
  removeStopBtn.disabled = gradientStopsData.length <= 2;
}

// Add new gradient stop with improved error handling
addStopBtn.addEventListener('click', () => {
  console.log("Add stop button clicked");
  
  try {
    const stops = gradientStopsData.sort((a, b) => a.position - b.position);
    let newPosition;
    
    if (stops.length < 2) {
      newPosition = 50;
    } else {
      // Find largest gap between stops
      let maxGap = 0;
      let gapPosition = 50;
      
      for (let i = 0; i < stops.length - 1; i++) {
        const gap = stops[i + 1].position - stops[i].position;
        if (gap > maxGap) {
          maxGap = gap;
          gapPosition = stops[i].position + gap / 2;
        }
      }
      newPosition = gapPosition;
    }
    
    // Interpolate color between adjacent stops
    const prevStop = stops.find(s => s.position <= newPosition);
    const nextStop = stops.find(s => s.position > newPosition);
    let newColor;
    
    if (!prevStop) {
      newColor = nextStop.color;
    } else if (!nextStop) {
      newColor = prevStop.color;
    } else {
      const ratio = (newPosition - prevStop.position) / (nextStop.position - prevStop.position);
      const prevRgb = hexToRgb(prevStop.color);
      const nextRgb = hexToRgb(nextStop.color);
      newColor = rgbToHex(
        Math.round(prevRgb.r + (nextRgb.r - prevRgb.r) * ratio),
        Math.round(prevRgb.g + (nextRgb.g - prevRgb.g) * ratio),
        Math.round(prevRgb.b + (nextRgb.b - prevRgb.b) * ratio)
      );
    }
    
    // Add the new stop
    gradientStopsData.push({ position: newPosition, color: newColor });
    activeStopIndex = gradientStopsData.length - 1;
    
    // Force update UI
    renderGradientStops();
    updateGradientPreview();
    
    console.log("Added new stop:", gradientStopsData);
  } catch (e) {
    console.error("Error adding gradient stop:", e);
  }
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

// Update gradient angle with debounce
let angleUpdateTimeout;
angleInput.addEventListener('input', () => {
  clearTimeout(angleUpdateTimeout);
  angleUpdateTimeout = setTimeout(updateGradientPreview, 100);
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

// Initialize gradient editor with improved reliability
function initializeGradientEditor() {
  // Clear existing stops
  if (gradientStops) {
    gradientStops.innerHTML = '';
  } else {
    console.error("gradientStops element not found!");
    return;
  }
  
  console.log("Initializing gradient editor with stops:", gradientStopsData);
  
  // Create stops and append directly
  gradientStopsData.forEach((stop, index) => {
    const stopElement = createStopElement(stop.position, stop.color);
    if (index === activeStopIndex) {
      stopElement.classList.add('active');
    }
    stopElement.style.zIndex = index === activeStopIndex ? 1000 : index;
    stopElement.style.display = 'block'; // Force display
    stopElement.style.visibility = 'visible'; // Force visibility
    gradientStops.appendChild(stopElement);
  });
  
  // Force style recalculation to ensure visibility
  if (gradientStops.offsetHeight === 0) {
    console.warn("gradientStops has zero height, trying to fix...");
    gradientStops.style.height = '24px';
    gradientStops.style.display = 'block';
  }
  
  // Enable the angle input if it exists
  if (angleInput) {
    angleInput.disabled = false;
  } else {
    console.warn("angleInput element not found");
  }
  
  // Update button state if it exists
  if (removeStopBtn) {
    removeStopBtn.disabled = gradientStopsData.length <= 2;
  } else {
    console.warn("removeStopBtn element not found");
  }
  
  // Update gradient preview if not already done
  try {
    updateGradientPreview();
  } catch (e) {
    console.error("Error updating gradient preview:", e);
  }
}

// Add presets for solid and gradient colors
const solidPresets = [
  { name: "Teal", color: "#00b894" },
  { name: "Purple", color: "#6c5ce7" },
  { name: "Rose", color: "#fd79a8" },
  { name: "Orange", color: "#e17055" },
  { name: "Blue", color: "#0984e3" },
  { name: "Green", color: "#00b894" },
  { name: "Yellow", color: "#fdcb6e" },
  { name: "Red", color: "#d63031" }
];

const gradientPresets = [
  { 
    name: "Sunset", 
    stops: [
      { position: 0, color: "#f5576c" },
      { position: 50, color: "#f093fb" },
      { position: 100, color: "#f5576c" }
    ],
    angle: 120
  },
  { 
    name: "Ocean", 
    stops: [
      { position: 0, color: "#4facfe" },
      { position: 50, color: "#00f2fe" },
      { position: 100, color: "#015de1" }
    ],
    angle: 135
  },
  { 
    name: "Forest", 
    stops: [
      { position: 0, color: "#00b894" },
      { position: 33, color: "#6ac47c" },
      { position: 66, color: "#78e08f" },
      { position: 100, color: "#b8e994" }
    ],
    angle: 90
  },
  { 
    name: "Dusk", 
    stops: [
      { position: 0, color: "#243949" },
      { position: 50, color: "#517fa4" },
      { position: 100, color: "#8badd2" }
    ],
    angle: 180
  },
  { 
    name: "Northern Lights", 
    stops: [
      { position: 0, color: "#0ff0b3" },
      { position: 33, color: "#20e3b2" },
      { position: 66, color: "#0cebeb" },
      { position: 100, color: "#31A3D1" }
    ],
    angle: 215
  },
  { 
    name: "Vibrant", 
    stops: [
      { position: 0, color: "#FF0080" },
      { position: 20, color: "#FF8C00" },
      { position: 40, color: "#FFEE00" },
      { position: 60, color: "#00FF80" },
      { position: 80, color: "#00FFFF" },
      { position: 100, color: "#9D00FF" }
    ],
    angle: 45
  }
];

// Create presets elements and add to the picker
function createPresets() {
  // Check if presets already exist to avoid duplicates
  const existingSolidPresets = solidPicker.querySelector('.presets-container');
  const existingGradientPresets = gradientEditor.querySelector('.presets-container');
  
  if (existingSolidPresets && existingGradientPresets) {
    console.log("Presets already exist, skipping creation");
    return;
  }
  
  console.log("Creating color presets");
  
  // Remove any existing presets to avoid duplicates
  if (existingSolidPresets) {
    existingSolidPresets.remove();
  }
  
  if (existingGradientPresets) {
    existingGradientPresets.remove();
  }
  
  // Create solid presets container
  const solidPresetsContainer = document.createElement('div');
  solidPresetsContainer.className = 'presets-container';
  
  const solidPresetsTitle = document.createElement('h3');
  solidPresetsTitle.textContent = 'Presets';
  solidPresetsTitle.className = 'presets-title';
  
  const solidPresetsGrid = document.createElement('div');
  solidPresetsGrid.className = 'presets-grid';
  
  // Create solid presets
  solidPresets.forEach(preset => {
    const presetElement = document.createElement('div');
    presetElement.className = 'preset-item';
    
    const presetPreview = document.createElement('div');
    presetPreview.className = 'preset-preview';
    presetPreview.style.backgroundColor = preset.color;
    
    const presetLabel = document.createElement('div');
    presetLabel.className = 'preset-label';
    presetLabel.textContent = preset.name;
    
    presetElement.appendChild(presetPreview);
    presetElement.appendChild(presetLabel);
    
    // Add click handler
    presetElement.addEventListener('click', () => {
      const rgb = hexToRgb(preset.color);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      currentHue = hsv.h;
      currentSaturation = hsv.s;
      currentValue = hsv.v;
      updateColorPicker(currentHue, currentSaturation, currentValue, false);
    });
    
    solidPresetsGrid.appendChild(presetElement);
  });
  
  solidPresetsContainer.appendChild(solidPresetsTitle);
  solidPresetsContainer.appendChild(solidPresetsGrid);
  solidPicker.appendChild(solidPresetsContainer);
  
  // Create gradient presets container
  const gradientPresetsContainer = document.createElement('div');
  gradientPresetsContainer.className = 'presets-container';
  
  const gradientPresetsTitle = document.createElement('h3');
  gradientPresetsTitle.textContent = 'Presets';
  gradientPresetsTitle.className = 'presets-title';
  
  const gradientPresetsGrid = document.createElement('div');
  gradientPresetsGrid.className = 'presets-grid';
  
  // Create gradient presets
  gradientPresets.forEach(preset => {
    const presetElement = document.createElement('div');
    presetElement.className = 'preset-item';
    
    const presetPreview = document.createElement('div');
    presetPreview.className = 'preset-preview';
    
    // Create gradient string
    const gradientString = preset.stops.map(stop => 
      `${stop.color} ${stop.position}%`
    ).join(', ');
    
    presetPreview.style.background = `linear-gradient(${preset.angle}deg, ${gradientString})`;
    
    const presetLabel = document.createElement('div');
    presetLabel.className = 'preset-label';
    presetLabel.textContent = preset.name;
    
    presetElement.appendChild(presetPreview);
    presetElement.appendChild(presetLabel);
    
    // Add click handler
    presetElement.addEventListener('click', () => {
      // Make a deep copy of the preset stops to avoid reference issues
      gradientStopsData = JSON.parse(JSON.stringify(preset.stops));
      angleInput.value = preset.angle;
      activeStopIndex = 0;
      renderGradientStops();
      updateGradientPreview();
    });
    
    gradientPresetsGrid.appendChild(presetElement);
  });
  
  gradientPresetsContainer.appendChild(gradientPresetsTitle);
  gradientPresetsContainer.appendChild(gradientPresetsGrid);
  gradientEditor.appendChild(gradientPresetsContainer);
  
  console.log("Presets created successfully");
}

// Tab indicator slide effect with improved initialization
function initializeTabIndicator() {
  // Check if indicator already exists
  const existingIndicator = document.querySelector('.tab-indicator');
  if (existingIndicator) {
    console.log("Tab indicator already exists, updating position");
    updateTabIndicator();
    return;
  }
  
  console.log("Creating tab indicator");
  const tabContainer = document.querySelector('.tab-switcher');
  const indicator = document.createElement('div');
  indicator.className = 'tab-indicator';
  tabContainer.appendChild(indicator);
  
  // Set initial position
  updateTabIndicator();
}

function updateTabIndicator() {
  const activeTab = document.querySelector('.tab-option.active');
  const indicator = document.querySelector('.tab-indicator');
  
  if (activeTab && indicator) {
    console.log("Updating tab indicator to match:", activeTab.dataset.tab);
    indicator.style.left = `${activeTab.offsetLeft}px`;
    indicator.style.width = `${activeTab.offsetWidth}px`;
  } else {
    console.warn("Could not find active tab or indicator");
  }
}

// Enhance event binding with error handling
function safeAddEventListener(element, event, handler) {
  if (element) {
    try {
      element.addEventListener(event, handler);
    } catch (e) {
      console.error(`Error adding ${event} event listener:`, e);
    }
  } else {
    console.warn(`Cannot add ${event} event listener: element not found`);
  }
}

// Initialize when DOM is loaded with improved error handling
window.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, initializing picker");
  
  try {
    // Force create tab indicator immediately
    initializeTabIndicator();
    
    // Set initial tab state
    const solidTab = document.querySelector('[data-tab="solid"]');
    const gradientTab = document.querySelector('[data-tab="gradient"]');
    
    if (solidTab && gradientTab) {
      solidTab.classList.add('active');
      gradientTab.classList.remove('active');
      
      // Set current tab
      currentTab = 'solid';
      
      // Show solid picker, hide gradient
      if (solidPicker) solidPicker.classList.remove('hidden');
      if (gradientEditor) gradientEditor.classList.remove('active');
      
      // Set initial color
      if (hexInput) {
        hexInput.value = '#00b894';
        hexInput.dispatchEvent(new Event('change'));
      }
      
      // Initialize gradient editor
      initializeGradientEditor();
      
      // Create presets
      createPresets();
      
      // Force update tab indicator
      updateTabIndicator();
      
      // Ensure proper setup of color pickers
      setupColorAreaEvents(colorArea, false);
      setupColorAreaEvents(colorAreaGradient, true);
      setupHueSliderEvents(hueSlider, false);
      setupHueSliderEvents(hueSliderGradient, true);
      
      // Double-check initialization
      setTimeout(() => {
        try {
          console.log("=== Debug: Initialization Check ===");
          
          const tabIndicator = document.querySelector('.tab-indicator');
          console.log("Tab indicator:", tabIndicator ? "exists" : "missing");
          
          if (!tabIndicator) {
            console.log("Creating missing tab indicator");
            const tabContainer = document.querySelector('.tab-switcher');
            if (tabContainer) {
              const indicator = document.createElement('div');
              indicator.className = 'tab-indicator';
              tabContainer.appendChild(indicator);
              updateTabIndicator();
            }
          }
          
          const solidPresetsContainer = solidPicker.querySelector('.presets-container');
          console.log("Solid presets:", solidPresetsContainer ? "exists" : "missing");
          
          const gradientPresetsContainer = gradientEditor.querySelector('.presets-container');
          console.log("Gradient presets:", gradientPresetsContainer ? "exists" : "missing");
          
          console.log("Gradient stops:", gradientStops.querySelectorAll('.gradient-stop').length);
          
          // Force reinitialize if needed
          if (!solidPresetsContainer || !gradientPresetsContainer) {
            console.log("Presets missing, recreating");
            createPresets();
          }
          
          // Force rerender gradient stops if they're missing
          if (gradientStops.querySelectorAll('.gradient-stop').length === 0) {
            console.log("Gradient stops missing, forcing recreation");
            renderGradientStops();
          }
          
          // Force update color pickers to ensure they're displayed correctly
          updateColorPicker(currentHue, currentSaturation, currentValue, false);
          
          console.log("=== Initialization Complete ===");
        } catch (e) {
          console.error("Error during post-initialization check:", e);
        }
      }, 500);
    } else {
      console.error("Tab elements not found");
    }
  } catch (e) {
    console.error("Error during initialization:", e);
  }
});
