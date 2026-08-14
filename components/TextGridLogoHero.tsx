import { useEffect, useRef } from 'react';

import { getGlyphIndex, getLogoAlpha, getTextGridMetrics, TEXT_GRID_GLYPHS } from '@/lib/text-grid-logo.js';
import styles from '@/styles/Home.module.css';

const MATERIALIZE_MS = 7600;
const GRID_FADE_MS = 700;
const LOGO_CELL_FADE_MS = 460;
const LOGO_FILL_STEP_MS = 34;
const LOGO_CENTER_FILL_MULTIPLIER = 0.5;
const LOGO_FILL_OVERLAP_MS = 180;
const LOGO_MOVE_START_MS = 6400;
const LOGO_MOVE_MS = 1150;
const WORD_WIPE_START_MS = 7000;
const WORD_WIPE_MS = 1250;
const SUBTITLE_WIPE_START_MS = 7550;
const SUBTITLE_WIPE_MS = 1100;
const FRAME_MS = 24;
const GLYPH_CHANGE_RATE = 0.38;
const SUBTITLE_TEXT = 'THE NEW ERA';
const VINE_TIMINGS = [
    [0, 2500],
    [180, 2860],
    [60, 2680],
    [380, 2380],
    [240, 3180],
    [560, 2920],
    [120, 3020],
    [460, 2620],
    [80, 2780],
    [620, 3260],
] as const;

interface Point {
    x: number;
    y: number;
}

interface VinePath {
    edge: 'top' | 'right' | 'bottom' | 'left';
    offset: number;
    angle: number;
    kinkA: [number, number];
    kinkB: [number, number];
    width: number;
}

interface ActiveVine {
    points: Point[];
    segmentLengths: number[];
    totalLength: number;
    head: number;
    tail: number;
    width: number;
    seed: number;
}

interface TextGridMetrics {
    fontSize: number;
    cellWidth: number;
    cellHeight: number;
    cols: number;
    rows: number;
    centerX: number;
    centerY: number;
    radius: number;
}

interface LogoFillMap {
    revealAt: Float32Array;
}

interface LogoLayout {
    centerX: number;
    centerY: number;
    radius: number;
}

interface TextMask {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    titleLeft: number;
    titleRight: number;
    subtitleLeft: number;
    subtitleRight: number;
}

const vinePaths: VinePath[] = [
    { edge: 'top', offset: 0.09, angle: -2.2, kinkA: [-0.34, -0.18], kinkB: [-0.24, 0.14], width: 1.35 },
    { edge: 'top', offset: 0.42, angle: -1.55, kinkA: [-0.08, -0.28], kinkB: [0.06, -0.02], width: 1.1 },
    { edge: 'top', offset: 0.83, angle: -0.78, kinkA: [0.31, -0.24], kinkB: [0.2, 0.08], width: 1.45 },
    { edge: 'right', offset: 0.19, angle: -0.22, kinkA: [0.34, -0.12], kinkB: [0.16, 0.02], width: 1.2 },
    { edge: 'right', offset: 0.71, angle: 0.58, kinkA: [0.38, 0.22], kinkB: [0.12, 0.18], width: 1.55 },
    { edge: 'bottom', offset: 0.86, angle: 1.22, kinkA: [0.26, 0.32], kinkB: [0.1, 0.2], width: 1.25 },
    { edge: 'bottom', offset: 0.37, angle: 1.78, kinkA: [-0.14, 0.34], kinkB: [-0.02, 0.16], width: 1.4 },
    { edge: 'bottom', offset: 0.12, angle: 2.38, kinkA: [-0.36, 0.28], kinkB: [-0.2, 0.08], width: 1.15 },
    { edge: 'left', offset: 0.28, angle: -2.82, kinkA: [-0.38, -0.08], kinkB: [-0.18, -0.02], width: 1.3 },
    { edge: 'left', offset: 0.78, angle: 2.82, kinkA: [-0.42, 0.24], kinkB: [-0.16, 0.18], width: 1.6 },
];

function clamp(value: number) {
    return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number) {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
}

function getVineStart(vine: VinePath, width: number, height: number): Point {
    switch (vine.edge) {
        case 'top':
            return { x: width * vine.offset, y: -height * 0.03 };
        case 'right':
            return { x: width * 1.03, y: height * vine.offset };
        case 'bottom':
            return { x: width * vine.offset, y: height * 1.03 };
        case 'left':
            return { x: -width * 0.03, y: height * vine.offset };
    }
}

function getVinePoints(vine: VinePath, width: number, height: number, radius: number): Point[] {
    const center = { x: width / 2, y: height / 2 };
    const target = {
        x: center.x + Math.cos(vine.angle) * radius * 1.025,
        y: center.y + Math.sin(vine.angle) * radius * 1.025,
    };
    const points = [
        getVineStart(vine, width, height),
        { x: center.x + width * vine.kinkA[0], y: center.y + height * vine.kinkA[1] },
        { x: center.x + width * vine.kinkB[0], y: center.y + height * vine.kinkB[1] },
        target,
    ];

    return points.slice(0, -1).flatMap((point, index) => {
        const next = points[index + 1];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.hypot(dx, dy) || 1;
        const direction = index % 2 === 0 ? 1 : -1;
        const unevenness = (0.018 + ((vine.offset * 10 + index) % 3) * 0.006) * Math.min(width, height);
        const knuckle = {
            x: (point.x + next.x) / 2 - (dy / length) * unevenness * direction,
            y: (point.y + next.y) / 2 + (dx / length) * unevenness * direction,
        };

        return [point, knuckle];
    }).concat(target);
}

function getSegmentSample(x: number, y: number, start: Point, end: Point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return { distance: Math.hypot(x - start.x, y - start.y), projection: 0 };

    const projection = clamp(((x - start.x) * dx + (y - start.y) * dy) / lengthSquared);
    return {
        distance: Math.hypot(x - (start.x + dx * projection), y - (start.y + dy * projection)),
        projection,
    };
}

function getVineTiming(index: number) {
    const [delay, duration] = VINE_TIMINGS[index % VINE_TIMINGS.length];
    return { delay, duration };
}

function getActiveVines(width: number, height: number, radius: number, elapsed: number): ActiveVine[] {
    return vinePaths.flatMap((vine, seed) => {
        const { delay, duration } = getVineTiming(seed);
        const head = clamp((elapsed - delay) / duration);
        const tail = clamp((elapsed - delay - duration * 0.6) / (duration * 0.92));

        if (head <= 0 || head <= tail) return [];

        const points = getVinePoints(vine, width, height, radius);
        const segmentLengths = points.slice(0, -1).map((point, index) => Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y));
        return [{
            points,
            segmentLengths,
            totalLength: segmentLengths.reduce((sum, length) => sum + length, 0),
            head,
            tail,
            width: vine.width,
            seed,
        }];
    });
}

function getVineCellAlpha(x: number, y: number, activeVines: ActiveVine[], cellSize: number) {
    let alpha = 0;

    activeVines.forEach((vine) => {
        const headLength = vine.totalLength * vine.head;
        const tailLength = vine.totalLength * vine.tail;
        let travelled = 0;
        let minDistance = Number.POSITIVE_INFINITY;
        let pathPosition = tailLength;

        for (let index = 0; index < vine.segmentLengths.length; index += 1) {
            const start = vine.points[index];
            const end = vine.points[index + 1];
            const segmentLength = vine.segmentLengths[index];
            const segmentStart = travelled;
            const segmentEnd = travelled + segmentLength;
            const visibleStart = Math.max(segmentStart, tailLength);
            const visibleEnd = Math.min(segmentEnd, headLength);

            travelled = segmentEnd;
            if (visibleEnd <= visibleStart) {
                continue;
            }

            const startProgress = (visibleStart - segmentStart) / segmentLength;
            const endProgress = (visibleEnd - segmentStart) / segmentLength;
            const partialStart = {
                x: start.x + (end.x - start.x) * startProgress,
                y: start.y + (end.y - start.y) * startProgress,
            };
            const partialEnd = {
                x: start.x + (end.x - start.x) * endProgress,
                y: start.y + (end.y - start.y) * endProgress,
            };
            const sample = getSegmentSample(x, y, partialStart, partialEnd);

            if (sample.distance < minDistance) {
                minDistance = sample.distance;
                pathPosition = visibleStart + (visibleEnd - visibleStart) * sample.projection;
            }
        }

        const noise = ((getGlyphIndex(Math.round(x), Math.round(y), vine.seed) % 11) - 5) / 10;
        const widthLimit = cellSize * (vine.width + noise);
        const tailFade = clamp((pathPosition - tailLength) / (vine.totalLength * 0.18));
        const localAlpha = clamp(1 - minDistance / widthLimit);
        alpha = Math.max(alpha, localAlpha * tailFade);
    });

    return alpha;
}

function getLogoAlphaAtCell(col: number, row: number, metrics: TextGridMetrics) {
    const x = col * metrics.cellWidth - metrics.centerX;
    const y = row * metrics.cellHeight - metrics.centerY;
    return getLogoAlpha(x, y, metrics.radius);
}

function getCellIndex(col: number, row: number, metrics: TextGridMetrics) {
    return row * metrics.cols + col;
}

function getLogoCenterFillMultiplier(col: number, row: number, metrics: TextGridMetrics) {
    const x = col * metrics.cellWidth - metrics.centerX;
    const y = row * metrics.cellHeight - metrics.centerY;
    return Math.hypot(x, y) < metrics.radius * 0.46 ? LOGO_CENTER_FILL_MULTIPLIER : 1;
}

function findNearestLogoCell(point: Point, metrics: TextGridMetrics) {
    const rootCol = Math.round(point.x / metrics.cellWidth);
    const rootRow = Math.round(point.y / metrics.cellHeight);
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let radius = 0; radius <= 10; radius += 1) {
        for (let row = rootRow - radius; row <= rootRow + radius; row += 1) {
            for (let col = rootCol - radius; col <= rootCol + radius; col += 1) {
                if (col < 0 || row < 0 || col >= metrics.cols || row >= metrics.rows || getLogoAlphaAtCell(col, row, metrics) <= 0) {
                    continue;
                }

                const distance = Math.hypot(col - rootCol, row - rootRow);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = getCellIndex(col, row, metrics);
                }
            }
        }

        if (best !== -1) return best;
    }

    return best;
}

function getFirstLogoContact(points: Point[], segmentLengths: number[], metrics: TextGridMetrics) {
    const center = { x: metrics.centerX, y: metrics.centerY };
    const contactRadius = metrics.radius + metrics.cellHeight * 1.5;
    let travelled = 0;

    for (let index = 0; index < segmentLengths.length; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const segmentLength = segmentLengths[index];
        const samples = Math.max(4, Math.ceil(segmentLength / metrics.cellHeight));

        for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex += 1) {
            const progress = sampleIndex / samples;
            const point = {
                x: start.x + (end.x - start.x) * progress,
                y: start.y + (end.y - start.y) * progress,
            };

            if (Math.hypot(point.x - center.x, point.y - center.y) <= contactRadius) {
                return { point, travelled: travelled + segmentLength * progress };
            }
        }

        travelled += segmentLength;
    }

    return { point: points[points.length - 1], travelled };
}

function buildLogoFillMap(width: number, height: number): LogoFillMap {
    const metrics = getTextGridMetrics(width, height);
    const revealAt = new Float32Array(metrics.cols * metrics.rows);
    const queue: number[] = [];
    revealAt.fill(Number.POSITIVE_INFINITY);

    vinePaths.forEach((vine, seed) => {
        const { delay, duration } = getVineTiming(seed);
        const points = getVinePoints(vine, width, height, metrics.radius);
        const segmentLengths = points.slice(0, -1).map((point, index) => Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y));
        const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
        const contact = getFirstLogoContact(points, segmentLengths, metrics);

        const cellIndex = findNearestLogoCell(contact.point, metrics);
        if (cellIndex === -1) return;

        revealAt[cellIndex] = delay + duration * (contact.travelled / totalLength) - LOGO_FILL_OVERLAP_MS;
        queue.push(cellIndex);
    });

    // ponytail: this grid is small; queue relaxation avoids a heap until resize cost matters.
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const cellIndex = queue[cursor];
        const col = cellIndex % metrics.cols;
        const row = Math.floor(cellIndex / metrics.cols);
        const neighbors = [
            [col + 1, row],
            [col - 1, row],
            [col, row + 1],
            [col, row - 1],
        ];

        neighbors.forEach(([neighborCol, neighborRow]) => {
            if (neighborCol < 0 || neighborRow < 0 || neighborCol >= metrics.cols || neighborRow >= metrics.rows || getLogoAlphaAtCell(neighborCol, neighborRow, metrics) <= 0) {
                return;
            }

            const neighborIndex = getCellIndex(neighborCol, neighborRow, metrics);
            const jitter = (getGlyphIndex(neighborCol, neighborRow, cellIndex) % 7) * 4;
            const fillMultiplier = getLogoCenterFillMultiplier(neighborCol, neighborRow, metrics);
            const nextRevealAt = revealAt[cellIndex] + (LOGO_FILL_STEP_MS + jitter) * fillMultiplier;

            if (nextRevealAt < revealAt[neighborIndex]) {
                revealAt[neighborIndex] = nextRevealAt;
                queue.push(neighborIndex);
            }
        });
    }

    return { revealAt };
}

function getLogoFillAlpha(fillMap: LogoFillMap, cellIndex: number, elapsed: number, reduceMotion: boolean) {
    if (reduceMotion) return 1;

    const revealAt = fillMap.revealAt[cellIndex];
    if (!Number.isFinite(revealAt)) return 0;

    return clamp((elapsed - revealAt) / LOGO_CELL_FADE_MS);
}

function getLogoLayout(width: number, height: number, elapsed: number, reduceMotion: boolean): LogoLayout {
    const metrics = getTextGridMetrics(width, height);
    const isMobile = width < 700;
    const progress = reduceMotion ? 1 : smoothStep((elapsed - LOGO_MOVE_START_MS) / LOGO_MOVE_MS);
    const target = isMobile
        ? { centerX: width / 2, centerY: height * 0.28, radius: Math.min(width, height) * 0.22 }
        : { centerX: width * 0.215, centerY: height / 2, radius: Math.min(width, height) * 0.2 };

    return {
        centerX: metrics.centerX + (target.centerX - metrics.centerX) * progress,
        centerY: metrics.centerY + (target.centerY - metrics.centerY) * progress,
        radius: metrics.radius + (target.radius - metrics.radius) * progress,
    };
}

function getTextLayout(width: number, height: number) {
    const isMobile = width < 700;
    const titleX = isMobile ? width / 2 : width * 0.395;
    const availableTextWidth = isMobile ? width * 0.86 : width - titleX - width * 0.05;
    const titleSize = isMobile ? Math.min(54, availableTextWidth / 6.2) : Math.min(150, availableTextWidth / 6.2);
    const subtitleSize = isMobile ? Math.min(30, availableTextWidth / 8.8) : Math.min(78, availableTextWidth / 8.8);
    const titleY = isMobile ? height * 0.54 : height * 0.46;
    const subtitleY = titleY + titleSize * (isMobile ? 0.86 : 0.68);

    return { isMobile, titleSize, subtitleSize, titleX, titleY, subtitleY };
}

function buildTextMask(width: number, height: number): TextMask {
    const mask = document.createElement('canvas');
    const ctx = mask.getContext('2d');
    mask.width = Math.ceil(width);
    mask.height = Math.ceil(height);

    if (!ctx) {
        return { data: new Uint8ClampedArray(mask.width * mask.height * 4), width: mask.width, height: mask.height, titleLeft: 0, titleRight: 0, subtitleLeft: 0, subtitleRight: 0 };
    }

    const layout = getTextLayout(width, height);
    ctx.textAlign = layout.isMobile ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f00';

    ctx.font = `700 ${layout.titleSize}px "Geist Mono Variable", "Geist Mono", monospace`;
    const titleMetrics = ctx.measureText('MILLENNIUM');
    const titleLeft = layout.isMobile ? layout.titleX - titleMetrics.width / 2 : layout.titleX;
    const titleRight = titleLeft + titleMetrics.width;
    ctx.fillText('MILLENNIUM', layout.titleX, layout.titleY);

    ctx.font = `600 ${layout.subtitleSize}px "Geist Mono Variable", "Geist Mono", monospace`;
    const subtitleMetrics = ctx.measureText(SUBTITLE_TEXT);
    const subtitleLeft = layout.isMobile ? layout.titleX - subtitleMetrics.width / 2 : layout.titleX + 2;
    const subtitleRight = subtitleLeft + subtitleMetrics.width;
    ctx.fillStyle = '#0f0';
    ctx.fillText(SUBTITLE_TEXT, layout.isMobile ? layout.titleX : layout.titleX + 2, layout.subtitleY);

    return {
        data: ctx.getImageData(0, 0, mask.width, mask.height).data,
        width: mask.width,
        height: mask.height,
        titleLeft,
        titleRight,
        subtitleLeft,
        subtitleRight,
    };
}

function getTextMaskAlpha(mask: TextMask, x: number, y: number) {
    const col = Math.round(x);
    const row = Math.round(y);
    if (col < 0 || row < 0 || col >= mask.width || row >= mask.height) return { title: 0, subtitle: 0 };
    const index = (row * mask.width + col) * 4;
    return { title: mask.data[index] / 255, subtitle: mask.data[index + 1] / 255 };
}

function getTextReveal(mask: TextMask, x: number, elapsed: number, reduceMotion: boolean) {
    const titleProgress = reduceMotion ? 1 : smoothStep((elapsed - WORD_WIPE_START_MS) / WORD_WIPE_MS);
    const subtitleProgress = reduceMotion ? 1 : smoothStep((elapsed - SUBTITLE_WIPE_START_MS) / SUBTITLE_WIPE_MS);
    const titleEdge = mask.titleLeft + (mask.titleRight - mask.titleLeft) * titleProgress;
    const subtitleEdge = mask.subtitleLeft + (mask.subtitleRight - mask.subtitleLeft) * subtitleProgress;

    return {
        title: x <= titleEdge && x >= mask.titleLeft && x <= mask.titleRight ? 1 : 0,
        subtitle: x <= subtitleEdge && x >= mask.subtitleLeft && x <= mask.subtitleRight ? 1 : 0,
    };
}

function updateGlyphState(glyphState: Uint16Array, frame: number, reduceMotion: boolean) {
    if (reduceMotion) return;

    for (let index = 0; index < glyphState.length; index += 1) {
        if (Math.random() < GLYPH_CHANGE_RATE) {
            glyphState[index] = (glyphState[index] + 1 + getGlyphIndex(index, frame, frame)) % TEXT_GRID_GLYPHS.length;
        }
    }
}

function drawTextGridLogo(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number, frame: number, glyphState: Uint16Array, reduceMotion: boolean, fillMap: LogoFillMap, textMask: TextMask) {
    const metrics = getTextGridMetrics(width, height);
    const gridOpacity = reduceMotion ? 1 : clamp(elapsed / GRID_FADE_MS);
    const activeVines = !reduceMotion ? getActiveVines(width, height, metrics.radius, elapsed) : [];
    const logoLayout = getLogoLayout(width, height, elapsed, reduceMotion);
    const logoSettled = reduceMotion || elapsed >= LOGO_MOVE_START_MS;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#08090a';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${metrics.fontSize}px "Geist Mono Variable", "Geist Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < metrics.rows; row += 1) {
        for (let col = 0; col < metrics.cols; col += 1) {
            const cellIndex = row * metrics.cols + col;
            const x = col * metrics.cellWidth;
            const y = row * metrics.cellHeight;
            const lowerGridFade = 1 - smoothStep((y - height * 0.82) / (height * 0.14));
            const glyph = TEXT_GRID_GLYPHS[glyphState[cellIndex] ?? getGlyphIndex(col, row, frame)];
            const initialLogoAlpha = getLogoAlpha(x - metrics.centerX, y - metrics.centerY, metrics.radius);
            const movedLogoAlpha = getLogoAlpha(x - logoLayout.centerX, y - logoLayout.centerY, logoLayout.radius);
            const logoAlpha = logoSettled ? movedLogoAlpha : initialLogoAlpha;
            const reveal = logoSettled ? 1 : getLogoFillAlpha(fillMap, cellIndex, elapsed, reduceMotion);
            const logoBrightness = logoAlpha * reveal;
            const insideLogoCircle = Math.hypot(x - metrics.centerX, y - metrics.centerY) <= metrics.radius;
            const vineAlpha = activeVines.length > 0 && !insideLogoCircle
                ? getVineCellAlpha(x, y, activeVines, metrics.cellHeight)
                : 0;
            const maskAlpha = getTextMaskAlpha(textMask, x, y);
            const textReveal = maskAlpha.title > 0 || maskAlpha.subtitle > 0
                ? getTextReveal(textMask, x, elapsed, reduceMotion)
                : { title: 0, subtitle: 0 };
            const titleAlpha = maskAlpha.title * textReveal.title;
            const subtitleAlpha = maskAlpha.subtitle * textReveal.subtitle;
            const textAlpha = Math.max(titleAlpha, subtitleAlpha * 0.86);

            if (textAlpha > 0.01) {
                const base = titleAlpha > 0 ? 0.08 : 0.05;
                const gain = titleAlpha > 0 ? 0.92 : 0.78;
                ctx.fillStyle = `rgba(247, 248, 248, ${(base + textAlpha * gain) * gridOpacity})`;
            } else if (logoBrightness > 0.01) {
                ctx.fillStyle = `rgba(247, 248, 248, ${(0.04 + logoBrightness * 0.96) * gridOpacity})`;
            } else if (vineAlpha > 0.01) {
                ctx.fillStyle = `rgba(247, 248, 248, ${(0.08 + vineAlpha * 0.74) * gridOpacity})`;
            } else {
                ctx.fillStyle = `rgba(247, 248, 248, ${0.048 * gridOpacity * lowerGridFade})`;
            }

            ctx.fillText(glyph, x, y);
        }
    }

}

export function TextGridLogoHero() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let animationFrame = 0;
        let lastDraw = 0;
        let frame = 0;
        let startedAt = performance.now();
        let glyphState = new Uint16Array(0);
        let fillMap = buildLogoFillMap(window.innerWidth, window.innerHeight);
        let textMask = buildTextMask(window.innerWidth, window.innerHeight);

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = window.innerWidth;
            const height = window.innerHeight;
            const metrics = getTextGridMetrics(width, height);

            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            glyphState = new Uint16Array(metrics.cols * metrics.rows);
            fillMap = buildLogoFillMap(width, height);
            textMask = buildTextMask(width, height);
            for (let row = 0; row < metrics.rows; row += 1) {
                for (let col = 0; col < metrics.cols; col += 1) {
                    glyphState[row * metrics.cols + col] = getGlyphIndex(col, row, 0);
                }
            }
            drawTextGridLogo(ctx, width, height, mediaQuery.matches ? MATERIALIZE_MS : performance.now() - startedAt, 0, glyphState, mediaQuery.matches, fillMap, textMask);
        };

        const render = (now: number) => {
            if (document.visibilityState === 'hidden') {
                animationFrame = requestAnimationFrame(render);
                return;
            }

            if (mediaQuery.matches || now - lastDraw >= FRAME_MS) {
                frame += 1;
                lastDraw = now;
                updateGlyphState(glyphState, frame, mediaQuery.matches);
                drawTextGridLogo(ctx, window.innerWidth, window.innerHeight, now - startedAt, frame, glyphState, mediaQuery.matches, fillMap, textMask);
            }

            if (!mediaQuery.matches) {
                animationFrame = requestAnimationFrame(render);
            }
        };

        const restart = () => {
            startedAt = performance.now();
            frame = 0;
            lastDraw = 0;
            cancelAnimationFrame(animationFrame);
            resize();
            animationFrame = requestAnimationFrame(render);
        };

        resize();
        animationFrame = requestAnimationFrame(render);
        window.addEventListener('resize', resize);
        mediaQuery.addEventListener('change', restart);

        return () => {
            cancelAnimationFrame(animationFrame);
            window.removeEventListener('resize', resize);
            mediaQuery.removeEventListener('change', restart);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.textGridLogoCanvas} aria-hidden="true" />;
}
