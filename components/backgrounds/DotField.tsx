import {
  memo,
  useEffect,
  useRef,
  type HTMLAttributes,
} from 'react';

/** Dots stay in the layout as invisible joints; the grid lines connect them. */
interface Dot {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

interface DotFieldProps extends HTMLAttributes<HTMLDivElement> {
  dotRadius?: number;
  dotSpacing?: number;
  lineWidth?: number;
  cursorRadius?: number;
  cursorForce?: number;
  bulgeOnly?: boolean;
  bulgeStrength?: number;
  glowRadius?: number;
  glowStrength?: number;
  glowFade?: number;
  waveAmplitude?: number;
  gradientFrom?: string;
  gradientTo?: string;
  /** Accepts a literal colour or a `var(--token)` reference resolved off the container. */
  glowColor?: string;
}

const DotField = memo(function DotField({
  dotRadius = 1.5,
  dotSpacing = 14,
  lineWidth = 1,
  cursorRadius = 500,
  cursorForce = 0.1,
  bulgeOnly = true,
  bulgeStrength = 67,
  glowRadius = 160,
  glowStrength = 0.09,
  glowFade = 0.022,
  waveAmplitude = 0,
  gradientFrom = 'rgba(168, 85, 247, 0.35)',
  gradientTo = 'rgba(180, 151, 207, 0.25)',
  glowColor = '#120F17',
  style,
  ...rest
}: DotFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const gridRef = useRef({ rows: 0, columns: 0 });
  const resolvedGlowRef = useRef(glowColor);
  const mouseRef = useRef({
    x: -9999,
    y: -9999,
    prevX: -9999,
    prevY: -9999,
    speed: 0,
  });
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const engagementRef = useRef(0);
  const propsRef = useRef({
    dotRadius,
    dotSpacing,
    lineWidth,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    glowRadius,
    glowStrength,
    glowFade,
    glowColor,
    waveAmplitude,
    gradientFrom,
    gradientTo,
  });
  const rebuildRef = useRef<(() => void) | null>(null);

  propsRef.current = {
    dotRadius,
    dotSpacing,
    lineWidth,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    glowRadius,
    glowStrength,
    glowFade,
    glowColor,
    waveAmplitude,
    gradientFrom,
    gradientTo,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    // The trail lives on its own layer so it can persist and decay between
    // frames; the main canvas is cleared every tick.
    const trailCanvas = document.createElement('canvas');
    const trailContext = trailCanvas.getContext('2d', { alpha: true });
    if (!trailContext) return;

    // Holds the accent-coloured grid clipped to the trail.
    const glowCanvas = document.createElement('canvas');
    const glowContext = glowCanvas.getContext('2d', { alpha: true });
    if (!glowContext) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let resizeTimer: ReturnType<typeof setTimeout>;

    const resolveGlowColor = () => {
      const raw = propsRef.current.glowColor.trim();
      const token = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
      if (!token) {
        resolvedGlowRef.current = raw;
        return;
      }

      const target = containerRef.current ?? document.documentElement;
      const value = getComputedStyle(target)
        .getPropertyValue(token[1])
        .trim();
      resolvedGlowRef.current = value || token[2]?.trim() || '#6366F1';
    };

    // Themes swap accent tokens at runtime, so re-resolve when they change.
    const themeObserver = new MutationObserver(resolveGlowColor);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    resolveGlowColor();

    const buildDots = (width: number, height: number) => {
      const props = propsRef.current;
      const step = props.dotRadius + props.dotSpacing;
      // One extra row and column on every side, so the grid runs past the edges
      // instead of stopping at them.
      const columns = Math.floor(width / step) + 2;
      const rows = Math.floor(height / step) + 2;
      const paddingX = (width % step) / 2 - step;
      const paddingY = (height % step) / 2 - step;
      const dots = new Array<Dot>(rows * columns);
      let index = 0;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const ax = paddingX + column * step + step / 2;
          const ay = paddingY + row * step + step / 2;
          dots[index] = {
            ax,
            ay,
            sx: ax,
            sy: ay,
            vx: 0,
            vy: 0,
            x: ax,
            y: ay,
            px: ax,
            py: ay,
          };
          index += 1;
        }
      }

      dotsRef.current = dots;
      gridRef.current = { rows, columns };
    };

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCanvas.width = rect.width * dpr;
      trailCanvas.height = rect.height * dpr;
      trailContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      glowCanvas.width = rect.width * dpr;
      glowCanvas.height = rect.height * dpr;
      glowContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = {
        w: rect.width,
        h: rect.height,
        offsetX: rect.left + window.scrollX,
        offsetY: rect.top + window.scrollY,
      };
      buildDots(rect.width, rect.height);
    };

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 100);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const size = sizeRef.current;
      mouseRef.current.x = event.pageX - size.offsetX;
      mouseRef.current.y = event.pageY - size.offsetY;
    };

    const updateMouseSpeed = () => {
      const mouse = mouseRef.current;
      const dx = mouse.prevX - mouse.x;
      const dy = mouse.prevY - mouse.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      mouse.speed += (distance - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    };

    const speedInterval = window.setInterval(updateMouseSpeed, 20);
    let frameCount = 0;

    const tick = () => {
      frameCount += 1;
      const dots = dotsRef.current;
      const mouse = mouseRef.current;
      const { w: width, h: height } = sizeRef.current;
      const props = propsRef.current;
      const time = frameCount * 0.02;
      const targetEngagement = Math.min(mouse.speed / 5, 1);

      engagementRef.current +=
        (targetEngagement - engagementRef.current) * 0.06;
      if (engagementRef.current < 0.001) engagementRef.current = 0;

      const engagement = engagementRef.current;

      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, props.gradientFrom);
      gradient.addColorStop(1, props.gradientTo);
      context.strokeStyle = gradient;
      context.lineWidth = props.lineWidth;

      const cursorRadiusSquared = props.cursorRadius * props.cursorRadius;

      for (let index = 0; index < dots.length; index += 1) {
        const dot = dots[index];
        const dx = mouse.x - dot.ax;
        const dy = mouse.y - dot.ay;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < cursorRadiusSquared && engagement > 0.01) {
          const distance = Math.sqrt(distanceSquared);
          const angle = Math.atan2(dy, dx);

          if (props.bulgeOnly) {
            const proximity = 1 - distance / props.cursorRadius;
            const push =
              proximity * proximity * props.bulgeStrength * engagement;
            dot.sx +=
              (dot.ax - Math.cos(angle) * push - dot.sx) * 0.15;
            dot.sy +=
              (dot.ay - Math.sin(angle) * push - dot.sy) * 0.15;
          } else {
            const move =
              (500 / Math.max(distance, 1)) *
              (mouse.speed * props.cursorForce);
            dot.vx += Math.cos(angle) * -move;
            dot.vy += Math.sin(angle) * -move;
          }
        } else if (props.bulgeOnly) {
          dot.sx += (dot.ax - dot.sx) * 0.1;
          dot.sy += (dot.ay - dot.sy) * 0.1;
        }

        if (!props.bulgeOnly) {
          dot.vx *= 0.9;
          dot.vy *= 0.9;
          dot.x = dot.ax + dot.vx;
          dot.y = dot.ay + dot.vy;
          dot.sx += (dot.x - dot.sx) * 0.1;
          dot.sy += (dot.y - dot.sy) * 0.1;
        }

        let drawX = dot.sx;
        let drawY = dot.sy;
        if (props.waveAmplitude > 0) {
          drawY +=
            Math.sin(dot.ax * 0.03 + time) * props.waveAmplitude;
          drawX +=
            Math.cos(dot.ay * 0.03 + time * 0.7) *
            props.waveAmplitude *
            0.5;
        }

        dot.px = drawX;
        dot.py = drawY;
      }

      // Trace the grid through the dots: a run per row, then a run per column.
      const { rows, columns } = gridRef.current;
      const gridPath = new Path2D();

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const dot = dots[row * columns + column];
          if (column === 0) gridPath.moveTo(dot.px, dot.py);
          else gridPath.lineTo(dot.px, dot.py);
        }
      }

      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
          const dot = dots[row * columns + column];
          if (row === 0) gridPath.moveTo(dot.px, dot.py);
          else gridPath.lineTo(dot.px, dot.py);
        }
      }

      context.stroke(gridPath);

      // Age the whole trail, then stamp the cursor's current position onto it.
      trailContext.globalCompositeOperation = 'destination-out';
      trailContext.fillStyle = `rgba(0, 0, 0, ${props.glowFade})`;
      trailContext.fillRect(0, 0, width, height);

      if (mouse.x > -9998) {
        const glow = trailContext.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          props.glowRadius,
        );
        glow.addColorStop(0, resolvedGlowRef.current);
        glow.addColorStop(1, 'transparent');

        trailContext.globalCompositeOperation = 'lighter';
        trailContext.globalAlpha = props.glowStrength;
        trailContext.fillStyle = glow;
        trailContext.fillRect(
          mouse.x - props.glowRadius,
          mouse.y - props.glowRadius,
          props.glowRadius * 2,
          props.glowRadius * 2,
        );
        trailContext.globalAlpha = 1;
      }

      // Re-stroke the same grid at full accent, keep only the part the trail has
      // touched, then add it back over the base lines. Masking this way lets the
      // lines actually brighten instead of being capped at their own alpha.
      glowContext.globalCompositeOperation = 'source-over';
      glowContext.clearRect(0, 0, width, height);
      glowContext.strokeStyle = resolvedGlowRef.current;
      glowContext.lineWidth = props.lineWidth;
      glowContext.stroke(gridPath);
      glowContext.globalCompositeOperation = 'destination-in';
      glowContext.drawImage(trailCanvas, 0, 0, width, height);

      context.save();
      context.globalCompositeOperation = 'lighter';
      context.drawImage(glowCanvas, 0, 0, width, height);
      context.restore();

      rafRef.current = window.requestAnimationFrame(tick);
    };

    resizeCanvas();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    rafRef.current = window.requestAnimationFrame(tick);
    rebuildRef.current = () => {
      const { w: width, h: height } = sizeRef.current;
      if (width > 0 && height > 0) buildDots(width, height);
    };

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      window.clearInterval(speedInterval);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      themeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    rebuildRef.current?.();
  }, [dotRadius, dotSpacing]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      {...rest}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
});

export default DotField;
