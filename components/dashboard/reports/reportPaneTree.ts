/**
 * Binary split tree for the report split view.
 *
 * A leaf shows one report. Splitting a leaf replaces it with a split node holding the original
 * leaf and a new sibling, so panes can be divided both vertically and horizontally to any depth.
 * Every operation returns a new tree — nodes are never mutated in place.
 */

export type SplitOrientation = 'vertical' | 'horizontal';

export interface PaneLeaf {
  readonly kind: 'leaf';
  readonly id: string;
  /** Report shown in this pane, or null while one is being chosen. */
  readonly reportId: string | null;
}

export interface PaneSplit {
  readonly kind: 'split';
  readonly id: string;
  /** `vertical` places panes side by side; `horizontal` stacks them. */
  readonly orientation: SplitOrientation;
  /** Share of the axis taken by `first`, between MIN_RATIO and MAX_RATIO. */
  readonly ratio: number;
  readonly first: PaneNode;
  readonly second: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

/** Beyond this the panes are too small to read a report page in. */
export const MAX_PANES = 6;

let paneCounter = 0;

export function createPaneId(): string {
  paneCounter += 1;
  return `pane-${paneCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createLeaf(reportId: string | null): PaneLeaf {
  return { kind: 'leaf', id: createPaneId(), reportId };
}

export function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export function countLeaves(node: PaneNode): number {
  return node.kind === 'leaf' ? 1 : countLeaves(node.first) + countLeaves(node.second);
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  return node.kind === 'leaf' ? [node] : [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

/** Replaces the target leaf with a split containing it and a new sibling. */
export function splitLeaf(
  root: PaneNode,
  leafId: string,
  orientation: SplitOrientation,
  newReportId: string | null
): PaneNode {
  if (root.kind === 'leaf') {
    if (root.id !== leafId) return root;
    return {
      kind: 'split',
      id: createPaneId(),
      orientation,
      ratio: 0.5,
      first: root,
      second: createLeaf(newReportId),
    };
  }

  return {
    ...root,
    first: splitLeaf(root.first, leafId, orientation, newReportId),
    second: splitLeaf(root.second, leafId, orientation, newReportId),
  };
}

/**
 * Removes a leaf, collapsing its parent split into the surviving sibling.
 * Returns null when the removed leaf was the last one.
 */
export function closeLeaf(root: PaneNode, leafId: string): PaneNode | null {
  if (root.kind === 'leaf') return root.id === leafId ? null : root;

  const first = closeLeaf(root.first, leafId);
  const second = closeLeaf(root.second, leafId);
  if (first === null) return second;
  if (second === null) return first;
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

export function setLeafReport(root: PaneNode, leafId: string, reportId: string | null): PaneNode {
  if (root.kind === 'leaf') {
    return root.id === leafId ? { ...root, reportId } : root;
  }
  return {
    ...root,
    first: setLeafReport(root.first, leafId, reportId),
    second: setLeafReport(root.second, leafId, reportId),
  };
}

export function setSplitRatio(root: PaneNode, splitId: string, ratio: number): PaneNode {
  if (root.kind === 'leaf') return root;
  if (root.id === splitId) return { ...root, ratio: clampRatio(ratio) };
  return {
    ...root,
    first: setSplitRatio(root.first, splitId, ratio),
    second: setSplitRatio(root.second, splitId, ratio),
  };
}
