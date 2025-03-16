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

// Prevent flicker when switching to gradient tab
function smoothTabTransition(fromTab, toTab) {
  if (fromTab === 'solid' && toTab === 'gradient') {
    // Preload gradient UI
    setTimeout(() => {
      const stop = gradientStopsData[activeStopIndex];
      if (stop) {
        const rgb = hexToRgb(stop.color);
        if (rgb) {
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          
          // Prepare gradient color picker with correct values
          colorAreaInnerGradient.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
          
          // Update thumbs
          if (colorAreaThumbGradient && hueSliderThumb) {
            const colorAreaWidth = colorAreaGradient.offsetWidth || 200;
            const colorAreaHeight = colorAreaGradient.offsetHeight || 200;
            const hueSliderWidth = hueSliderGradient.offsetWidth || 200;
            
            const saturationX = ((100 - hsv.s) / 100) * colorAreaWidth;
            const valueY = ((100 - hsv.v) / 100) * colorAreaHeight;
            const hueX = (hsv.h / 360) * hueSliderWidth;
            
            colorAreaThumbGradient.style.left = `${saturationX}px`;
            colorAreaThumbGradient.style.top = `${valueY}px`;
            colorAreaThumbGradient.style.backgroundColor = stop.color;
            hueSliderThumb.style.left = `${hueX}px`;
          }
        }
      }
    }, 0);
  }
}

// Update the color picker UI with improved error handling
function updateColorPicker(h, s, v, isGradient = false) {
  try {
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
    
    // Update thumbs position with constraints to prevent edge cases
    const saturationX = Math.max(5, Math.min(colorAreaWidth - 5, ((100 - s) / 100) * colorAreaWidth));
    const valueY = Math.max(5, Math.min(colorAreaHeight - 5, ((100 - v) / 100) * colorAreaHeight));
    const hueX = Math.max(5, Math.min(hueSliderWidth - 5, (h / 360) * hueSliderWidth));
    
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

// Optimize color updates with rAF and debouncing
let colorUpdateRAF = null;
function updateColorFromEvent(e, colorArea, isGradient) {
  if (colorUpdateRAF) {
    cancelAnimationFrame(colorUpdateRAF);
  }
  
  colorUpdateRAF = requestAnimationFrame(() => {
    try {
      const rect = colorArea.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      
      // Calculate new saturation and value
      currentSaturation = x * 100; // Changed from (1-x) to x for more intuitive interaction
      currentValue = 100 - (y * 100);
      
      updateColorPicker(currentHue, currentSaturation, currentValue, isGradient);
      colorUpdateRAF = null;
    } catch (e) {
      console.error("Error updating color from event:", e);
      colorUpdateRAF = null;
    }
  });
}

// Optimize hue updates with improved handling
let hueUpdateRAF = null;
function updateHueFromEvent(e, hueSlider, isGradient) {
  if (hueUpdateRAF) {
    cancelAnimationFrame(hueUpdateRAF);
  }
  
  hueUpdateRAF = requestAnimationFrame(() => {
    try {
      const rect = hueSlider.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      currentHue = x * 360;
      
      // Update color picker immediately
      updateColorPicker(currentHue, currentSaturation, currentValue, isGradient);
      
      // Update gradient if needed
      if (isGradient && activeStopIndex !== null) {
        updateGradientStopColor(currentHue, currentSaturation, currentValue);
      }
      
      hueUpdateRAF = null;
    } catch (e) {
      console.error("Error updating hue from event:", e);
      hueUpdateRAF = null;
    }
  });
}

// Performance optimization - use pointer events for smoother dragging
function setupColorAreaEvents(colorArea, isGradient) {
  if (!colorArea) {
    console.error("Color area not found for", isGradient ? "gradient" : "solid", "picker");
    return;
  }

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
  if (!hueSlider) {
    console.error("Hue slider not found for", isGradient ? "gradient" : "solid", "picker");
    return;
  }

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

// Handle gradient stop drag events
gradientStops.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('gradient-stop')) {
    e.stopPropagation();
    e.preventDefault();
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
    
    // Update active color in color picker
    updateGradientPreview();
  }
});

// Tab switching with better state management
tabSwitcher.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-option')) {
    const newTab = e.target.dataset.tab;
    const oldTab = currentTab;
    
    // Don't re-initialize if already on this tab
    if (oldTab === newTab) return;
    
    // Update tab classes
    document.querySelectorAll('.tab-option').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    // Update indicator position immediately
    requestAnimationFrame(() => {
      updateTabIndicator();
    });
    
    // Save current tab
    currentTab = newTab;
    
    // Apply smooth transition
    smoothTabTransition(oldTab, newTab);
    
    if (newTab === 'solid') {
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
      
    } else if (newTab === 'gradient') {
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
        }, 20);
      }, 10);
    }
  }
});

// Handle gradient stop drag with improved performance and reliability
let stopDragRAF = null;
function handleGradientStopDrag(e) {
  if (isDraggingStop && currentDragTarget) {
    // Cancel any existing animation frame to ensure we're always using the latest event
    if (stopDragRAF) {
      cancelAnimationFrame(stopDragRAF);
    }
    
    stopDragRAF = requestAnimationFrame(() => {
      try {
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
      } catch (e) {
        console.error("Error dragging gradient stop:", e);
        stopDragRAF = null;
      }
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

// Update gradient preview with cubic-bezier curve implementation
function updateGradientPreview() {
  try {
    // Sort by position
    gradientStopsData.sort((a, b) => a.position - b.position);
    
    // Create gradient with cubic-bezier curve implementation for smoother transitions
    let gradientString;
    
    if (gradientStopsData.length <= 2) {
      // Simple two-color gradient
      gradientString = gradientStopsData
        .map(stop => `${stop.color} ${stop.position}%`)
        .join(', ');
    } else {
      // Implement multi-stop gradient with more control points for smooth curves
      // Add intermediate points for smoother curves
      const enhancedStops = [];
      
      // First add the first stop
      enhancedStops.push(`${gradientStopsData[0].color} ${gradientStopsData[0].position}%`);
      
      // For each segment between stops, add interpolated points
      for (let i = 0; i < gradientStopsData.length - 1; i++) {
        const current = gradientStopsData[i];
        const next = gradientStopsData[i + 1];
        const segmentWidth = next.position - current.position;
        
        if (segmentWidth > 5) {  // Only add points if there's enough space
          // Add 5 interpolated points for smoother gradient
          for (let j = 1; j <= 5; j++) {
            const t = j / 6;  // Fraction of the way from current to next
            const cubicT = cubicBezier(t, 0.42, 0, 0.58, 1); // Smooth ease-in-out curve
            
            const position = current.position + cubicT * segmentWidth;
            
            // Interpolate colors
            const currentRgb = hexToRgb(current.color);
            const nextRgb = hexToRgb(next.color);
            
            const r = currentRgb.r + cubicT * (nextRgb.r - currentRgb.r);
            const g = currentRgb.g + cubicT * (nextRgb.g - currentRgb.g);
            const b = currentRgb.b + cubicT * (nextRgb.b - currentRgb.b);
            
            const interpolatedColor = rgbToHex(Math.round(r), Math.round(g), Math.round(b));
            enhancedStops.push(`${interpolatedColor} ${position.toFixed(2)}%`);
          }
        }
        
        // Add the next stop (except for the last iteration which adds the final stop)
        if (i < gradientStopsData.length - 2) {
          enhancedStops.push(`${next.color} ${next.position}%`);
        }
      }
      
      // Add the last stop
      enhancedStops.push(`${gradientStopsData[gradientStopsData.length-1].color} ${gradientStopsData[gradientStopsData.length-1].position}%`);
      
      gradientString = enhancedStops.join(', ');
    }
    
    const angle = angleInput && !isNaN(parseFloat(angleInput.value)) ? parseFloat(angleInput.value) : 90;
    const gradient = `linear-gradient(${angle}deg, ${gradientString})`;
    
    // Apply gradient
    if (gradientPreview) {
      gradientPreview.style.background = gradient;
    }
    
    // Update global CSS variable
    document.documentElement.style.setProperty('--accent-gradient', gradient);
    
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
        
        if (colorAreaThumbGradient && colorAreaGradient && hueSliderThumb && hueSliderGradient) {
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
          hueSliderThumb.style.left = `${hueX}px`;
        }
      }
    }
    
    // Calculate text color based on the average of gradient stops
    updateTextColorFromGradient();
  } catch (e) {
    console.error("Error updating gradient preview:", e);
  }
}

// Cubic bezier function for smooth curves
function cubicBezier(t, p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  
  const tSq = t * t;
  const tCu = tSq * t;
  
  return ax * tCu + bx * tSq + cx * t;
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

// Update gradient angle with improved handling
let angleUpdateTimeout;
angleInput.addEventListener('input', (e) => {
  clearTimeout(angleUpdateTimeout);
  
  const angle = parseFloat(e.target.value);
  if (!isNaN(angle)) {
    // Update immediately for smoother interaction
    updateGradientPreview();
    
    // Debounce the final update
    angleUpdateTimeout = setTimeout(() => {
      try {
        // Normalize angle to 0-360 range
        const normalizedAngle = ((angle % 360) + 360) % 360;
        e.target.value = normalizedAngle;
        updateGradientPreview();
      } catch (error) {
        console.error("Error updating angle:", error);
      }
    }, 100);
  }
});

// Add new gradient stop with improved positioning
addStopBtn.addEventListener('click', () => {
  try {
    if (gradientStopsData.length >= 5) {
      console.warn("Maximum number of stops reached (5)");
      return;
    }
    
    // Sort stops by position
    const stops = [...gradientStopsData].sort((a, b) => a.position - b.position);
    
    // Find largest gap
    let maxGap = 0;
    let insertPosition = 50;
    
    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1].position - stops[i].position;
      if (gap > maxGap) {
        maxGap = gap;
        insertPosition = stops[i].position + gap / 2;
      }
    }
    
    // Interpolate color
    const prevStop = stops.find(s => s.position <= insertPosition);
    const nextStop = stops.find(s => s.position > insertPosition);
    
    let newColor;
    if (!prevStop) {
      newColor = nextStop.color;
    } else if (!nextStop) {
      newColor = prevStop.color;
    } else {
      const ratio = (insertPosition - prevStop.position) / (nextStop.position - prevStop.position);
      const prevRgb = hexToRgb(prevStop.color);
      const nextRgb = hexToRgb(nextStop.color);
      
      newColor = rgbToHex(
        Math.round(prevRgb.r + (nextRgb.r - prevRgb.r) * ratio),
        Math.round(prevRgb.g + (nextRgb.g - prevRgb.g) * ratio),
        Math.round(prevRgb.b + (nextRgb.b - prevRgb.b) * ratio)
      );
    }
    
    // Add new stop
    gradientStopsData.push({
      position: insertPosition,
      color: newColor
    });
    
    // Update active stop
    activeStopIndex = gradientStopsData.length - 1;
    
    // Update UI
    renderGradientStops();
    updateGradientPreview();
    
    // Enable remove button
    removeStopBtn.disabled = false;
    
  } catch (e) {
    console.error("Error adding gradient stop:", e);
  }
});

// Remove gradient stop with improved handling
removeStopBtn.addEventListener('click', () => {
  try {
    if (gradientStopsData.length <= 2) {
      console.warn("Cannot remove stop: minimum 2 stops required");
      return;
    }
    
    // Remove active stop
    gradientStopsData.splice(activeStopIndex, 1);
    
    // Update active index
    activeStopIndex = Math.max(0, activeStopIndex - 1);
    
    // Update UI
    renderGradientStops();
    updateGradientPreview();
    
    // Update remove button state
    removeStopBtn.disabled = gradientStopsData.length <= 2;
    
  } catch (e) {
    console.error("Error removing gradient stop:", e);
  }
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

// Enhanced presets for solid colors - creative names with unique colors
const solidPresets = [
  { name: "Ocean Breeze", color: "#38b6ff" },
  { name: "Emerald Isle", color: "#00c07f" },
  { name: "Sunset Orange", color: "#ff7043" },
  { name: "Royal Purple", color: "#9c56c4" },
  { name: "Ruby Red", color: "#e53935" },
  { name: "Sunflower", color: "#ffca28" },
  { name: "Mint Fresh", color: "#26a69a" },
  { name: "Coral Pink", color: "#ff5e94" },
  { name: "Midnight Blue", color: "#1a237e" },
  { name: "Olive Green", color: "#7cb342" },
  { name: "Coffee Brown", color: "#795548" },
  { name: "Slate Gray", color: "#607d8b" }
];

// Enhanced gradient presets with creative multi-point gradients
const gradientPresets = [
  { 
    name: "Cosmic Aurora", 
    stops: [
      { position: 0, color: "#3d3393" },
      { position: 16, color: "#2b76b9" },
      { position: 42, color: "#2cacd1" },
      { position: 60, color: "#35eb93" },
      { position: 85, color: "#f8d90f" },
      { position: 100, color: "#f08c2e" }
    ],
    angle: 135
  },
  { 
    name: "Sunset Blaze", 
    stops: [
      { position: 0, color: "#ff416c" },
      { position: 48, color: "#ff6b6b" },
      { position: 100, color: "#fda085" }
    ],
    angle: 160
  },
  { 
    name: "Northern Lights", 
    stops: [
      { position: 0, color: "#43cea2" },
      { position: 31, color: "#1894a8" },
      { position: 75, color: "#3858b3" },
      { position: 100, color: "#2b5876" }
    ],
    angle: 215
  },
  { 
    name: "Berry Smoothie", 
    stops: [
      { position: 0, color: "#e570e7" },
      { position: 24, color: "#c85ec7" },
      { position: 50, color: "#ac3ba3" },
      { position: 79, color: "#8a307f" },
      { position: 100, color: "#6b2255" }
    ],
    angle: 45
  },
  { 
    name: "Deep Ocean", 
    stops: [
      { position: 0, color: "#0f0c29" },
      { position: 30, color: "#302b63" },
      { position: 80, color: "#24243e" },
      { position: 100, color: "#1c1b33" }
    ],
    angle: 180
  },
  { 
    name: "Lush Meadow", 
    stops: [
      { position: 0, color: "#56ab2f" },
      { position: 40, color: "#a8e063" },
      { position: 70, color: "#c5d170" },
      { position: 100, color: "#ebd834" }
    ],
    angle: 90
  },
  { 
    name: "Candy Cotton", 
    stops: [
      { position: 0, color: "#ffafbd" },
      { position: 50, color: "#ffc3a0" },
      { position: 100, color: "#ffafbd" }
    ],
    angle: 120
  },
  { 
    name: "Nebula", 
    stops: [
      { position: 0, color: "#0f2027" },
      { position: 20, color: "#203a43" },
      { position: 60, color: "#2c5364" },
      { position: 100, color: "#051e31" }
    ],
    angle: 225
  }
];

// Create presets elements and add to the picker with glassmorphism design
function createPresets() {
  try {
    console.log("Creating color presets with glassmorphism design");
    
    // Remove any existing presets
    const existingSolidPresets = solidPicker.querySelector('.presets-container');
    const existingGradientPresets = gradientEditor.querySelector('.presets-container');
    
    if (existingSolidPresets) existingSolidPresets.remove();
    if (existingGradientPresets) existingGradientPresets.remove();
    
    // Create solid presets container
    const solidPresetsContainer = document.createElement('div');
    solidPresetsContainer.className = 'presets-container';
    
    const solidPresetsTitle = document.createElement('h3');
    solidPresetsTitle.textContent = 'Solid Color Presets';
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
        if (rgb) {
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          currentHue = hsv.h;
          currentSaturation = hsv.s;
          currentValue = hsv.v;
          updateColorPicker(currentHue, currentSaturation, currentValue, false);
        }
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
    gradientPresetsTitle.textContent = 'Gradient Presets';
    gradientPresetsTitle.className = 'presets-title';
    
    const gradientPresetsGrid = document.createElement('div');
    gradientPresetsGrid.className = 'presets-grid';
    
    // Create gradient presets
    gradientPresets.forEach(preset => {
      const presetElement = document.createElement('div');
      presetElement.className = 'preset-item';
      
      const presetPreview = document.createElement('div');
      presetPreview.className = 'preset-preview';
      
      // Create gradient string with enhanced points
      const gradientString = preset.stops.map(stop => 
        `${stop.color} ${stop.position}%`
      ).join(', ');
      
      presetPreview.style.background = `linear-gradient(${preset.angle}deg, ${gradientString})`;
      
      const presetLabel = document.createElement('div');
      presetLabel.className = 'preset-label';
      presetLabel.textContent = preset.name;
      
      presetElement.appendChild(presetPreview);
      presetElement.appendChild(presetLabel);
      
      // Add click handler with proper error handling
      presetElement.addEventListener('click', () => {
        try {
          // Make a deep copy of the preset stops to avoid reference issues
          gradientStopsData = JSON.parse(JSON.stringify(preset.stops));
          angleInput.value = preset.angle;
          activeStopIndex = 0;
          
          renderGradientStops();
          updateGradientPreview();
          
          // Update the active stop's color in the gradient color picker
          const activeStop = gradientStopsData[activeStopIndex];
          if (activeStop && hexInputGradient) {
            hexInputGradient.value = activeStop.color;
            
            // Update the gradient color picker UI
            const rgb = hexToRgb(activeStop.color);
            if (rgb) {
              const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
              currentHue = hsv.h;
              currentSaturation = hsv.s;
              currentValue = hsv.v;
              updateColorPicker(currentHue, currentSaturation, currentValue, true);
            }
          }
        } catch (e) {
          console.error("Error applying gradient preset:", e);
        }
      });
      
      gradientPresetsGrid.appendChild(presetElement);
    });
    
    gradientPresetsContainer.appendChild(gradientPresetsTitle);
    gradientPresetsContainer.appendChild(gradientPresetsGrid);
    gradientEditor.appendChild(gradientPresetsContainer);
    
    console.log("Presets created successfully with glassmorphism design");
  } catch (e) {
    console.error("Error creating presets:", e);
  }
}

// Update tab indicator function to use transform instead of left/width
function updateTabIndicator() {
  const activeTab = document.querySelector('.tab-option.active');
  const indicator = document.querySelector('.tab-indicator');
  
  if (activeTab && indicator) {
    const tabName = activeTab.dataset.tab;
    
    // Add the data-tab attribute to the indicator
    indicator.setAttribute('data-tab', tabName);
    
    // Use transform for smoother animation
    if (tabName === 'gradient') {
      indicator.style.transform = 'translateX(100%)';
    } else {
      indicator.style.transform = 'translateX(0)';
    }
    
    console.log(`Tab indicator updated to ${tabName} tab`);
  } else {
    console.warn("Could not find active tab or indicator");
  }
}

// Initialize tab indicator
function initializeTabIndicator() {
  // Check if indicator already exists
  const existingIndicator = document.querySelector('.tab-indicator');
  if (existingIndicator) {
    console.log("Tab indicator already exists, updating position");
    updateTabIndicator();
    return existingIndicator;
  }
  
  console.log("Creating tab indicator");
  const tabContainer = document.querySelector('.tab-switcher');
  const indicator = document.createElement('div');
  indicator.className = 'tab-indicator';
  
  // Set initial state based on active tab
  const activeTab = document.querySelector('.tab-option.active');
  if (activeTab) {
    indicator.setAttribute('data-tab', activeTab.dataset.tab);
  } else {
    // Default to solid if no active tab
    indicator.setAttribute('data-tab', 'solid');
  }
  
  tabContainer.appendChild(indicator);
  
  // Set initial position
  updateTabIndicator();
  return indicator;
}

// Event listener for DOMContentLoaded - updated for reliability
document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log("DOM fully loaded, initializing color picker with glassmorphism design");
    
    // Delay execution slightly to ensure DOM is ready
    setTimeout(() => {
      // Initialize tabs
      const solidTab = document.querySelector('[data-tab="solid"]');
      const gradientTab = document.querySelector('[data-tab="gradient"]');
      const solidPicker = document.querySelector('.solid-picker');
      const gradientEditor = document.querySelector('.gradient-editor');
      
      if (!solidTab || !gradientTab || !solidPicker || !gradientEditor) {
        console.error("Critical UI elements are missing!");
        return;
      }
      
      // Force create tab indicator immediately
      const tabIndicator = initializeTabIndicator();
      if (!tabIndicator) {
        console.error("Failed to create tab indicator!");
      }
      
      // Set initial tab state
      solidTab.classList.add('active');
      gradientTab.classList.remove('active');
      solidPicker.classList.remove('hidden');
      solidPicker.style.display = 'block';
      gradientEditor.classList.remove('active');
      gradientEditor.style.display = 'none';
      
      // Initialize solid color picker
      initializeColorPicker(false);
      
      // Initialize gradient editor
      initializeGradientEditor();
      
      // Set initial color
      updateColorPicker(currentHue, currentSaturation, currentValue, false);
      
      // Create presets immediately
      createPresets();
      
      // Add tab click event listener
      solidTab.addEventListener('click', () => {
        solidTab.classList.add('active');
        gradientTab.classList.remove('active');
        solidPicker.classList.remove('hidden');
        solidPicker.style.display = 'block';
        gradientEditor.classList.remove('active');
        gradientEditor.style.display = 'none';
        updateTabIndicator();
      });
      
      gradientTab.addEventListener('click', () => {
        solidTab.classList.remove('active');
        gradientTab.classList.add('active');
        solidPicker.classList.add('hidden');
        solidPicker.style.display = 'none';
        gradientEditor.classList.add('active');
        gradientEditor.style.display = 'block';
        updateTabIndicator();
        
        // Make sure gradient is updated
        updateGradientPreview();
      });
      
      console.log("Color picker initialized successfully");
      
      // Check for important elements again after a short delay
      setTimeout(() => {
        // Post-initialization check
        const tabIndicatorCheck = document.querySelector('.tab-indicator');
        const solidPresetsCheck = document.querySelector('.solid-picker .presets-container');
        const gradientPresetsCheck = document.querySelector('.gradient-editor .presets-container');
        
        console.log("Post-initialization check:", 
                  "Tab indicator:", tabIndicatorCheck ? "✓" : "✗",
                  "Solid presets:", solidPresetsCheck ? "✓" : "✗",
                  "Gradient presets:", gradientPresetsCheck ? "✓" : "✗");
        
        // Re-create anything missing
        if (!tabIndicatorCheck) {
          console.warn("Tab indicator missing after initialization, recreating...");
          initializeTabIndicator();
        }
        
        if (!solidPresetsCheck || !gradientPresetsCheck) {
          console.warn("Presets missing after initialization, recreating...");
          createPresets();
        }
        
        // Final update to ensure everything is drawn
        updateColorPicker(currentHue, currentSaturation, currentValue, false);
        updateGradientPreview();
        updateTabIndicator();
      }, 500);
    }, 100);
  } catch (e) {
    console.error("Error during color picker initialization:", e);
  }
});

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

// Initialize the color picker with improved error handling
function initializeColorPicker(isGradient) {
  try {
    const targetColorArea = isGradient ? colorAreaGradient : colorArea;
    const targetHueSlider = isGradient ? hueSliderGradient : hueSlider;
    const targetThumb = isGradient ? colorAreaThumbGradient : colorAreaThumb;
    const targetHueThumb = isGradient ? hueSliderThumb : hueThumb;
    
    console.log(`Initializing ${isGradient ? 'gradient' : 'solid'} color picker elements`);
    
    // Setup all the event listeners for the color area
    if (targetColorArea) {
      setupColorAreaEvents(targetColorArea, isGradient);
      console.log(`Color area events set up for ${isGradient ? 'gradient' : 'solid'} picker`);
    } else {
      console.error(`Color area element not found for ${isGradient ? 'gradient' : 'solid'} picker`);
    }
    
    // Setup all the event listeners for the hue slider
    if (targetHueSlider) {
      setupHueSliderEvents(targetHueSlider, isGradient);
      console.log(`Hue slider events set up for ${isGradient ? 'gradient' : 'solid'} picker`);
    } else {
      console.error(`Hue slider element not found for ${isGradient ? 'gradient' : 'solid'} picker`);
    }
    
    // Setup hex input event listener
    const targetHexInput = isGradient ? hexInputGradient : hexInput;
    if (targetHexInput) {
      targetHexInput.addEventListener('change', function() {
        const value = this.value.trim();
        if (value.startsWith('#') && /^#[0-9A-Fa-f]{6}$/.test(value)) {
          // Valid hex value
          const rgb = hexToRgb(value);
          if (rgb) {
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            currentHue = hsv.h;
            currentSaturation = hsv.s;
            currentValue = hsv.v;
            updateColorPicker(currentHue, currentSaturation, currentValue, isGradient);
            
            if (isGradient && activeStopIndex !== null) {
              gradientStopsData[activeStopIndex].color = value;
              updateGradientPreview();
            }
          }
        }
      });
      console.log(`Hex input events set up for ${isGradient ? 'gradient' : 'solid'} picker`);
    } else {
      console.error(`Hex input element not found for ${isGradient ? 'gradient' : 'solid'} picker`);
    }
    
    // Setup RGB input event listener
    const targetRgbInput = isGradient ? rgbInputGradient : rgbInput;
    if (targetRgbInput) {
      targetRgbInput.addEventListener('change', function() {
        const value = this.value.trim();
        const rgbParts = value.split(',').map(part => parseInt(part.trim(), 10));
        
        if (rgbParts.length === 3 && 
            !isNaN(rgbParts[0]) && !isNaN(rgbParts[1]) && !isNaN(rgbParts[2]) &&
            rgbParts[0] >= 0 && rgbParts[0] <= 255 &&
            rgbParts[1] >= 0 && rgbParts[1] <= 255 &&
            rgbParts[2] >= 0 && rgbParts[2] <= 255) {
          
          // Valid RGB values
          const r = rgbParts[0];
          const g = rgbParts[1];
          const b = rgbParts[2];
          
          // Update hex input
          const hex = rgbToHex(r, g, b);
          if (targetHexInput) {
            targetHexInput.value = hex;
            targetHexInput.dispatchEvent(new Event('change'));
          }
        }
      });
      console.log(`RGB input events set up for ${isGradient ? 'gradient' : 'solid'} picker`);
    } else {
      console.error(`RGB input element not found for ${isGradient ? 'gradient' : 'solid'} picker`);
    }
    
    console.log(`${isGradient ? 'Gradient' : 'Solid'} color picker initialized successfully`);
  } catch (e) {
    console.error(`Error initializing ${isGradient ? 'gradient' : 'solid'} color picker:`, e);
  }
}
