/**
 * Path Graph View
 * Custom SVG layered layout by depth tier with directed edges and arrowheads.
 * Nodes distinguished by shape, icon, and label in addition to color.
 * Supports pan, zoom, keyboard navigation (Enter to select), and accessible legend.
 * Source of truth: DESIGN_DOC §5.3.C, §6.7, PRD FR-04
 */

import React, { useState, useMemo, useRef } from 'react';
import { type ConceptRecord, type ConceptStatus } from '@/types/domain';
import { type NormalizedGraphEdge } from '@/features/dependency-graph';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  List,
  Lock,
  Sparkles,
  Clock,
  RefreshCw,
  CheckCircle2,
  Circle,
  Square,
  Hexagon,
} from 'lucide-react';

export interface PathGraphViewProps {
  concepts: ConceptRecord[];
  activeEdges: NormalizedGraphEdge[];
  selectedConceptId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSwitchToList: () => void;
}

interface NodePosition {
  concept: ConceptRecord;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: number;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;
const COLUMN_GAP = 120;
const ROW_GAP = 36;
const PADDING_X = 60;
const PADDING_Y = 60;

export function PathGraphView({
  concepts,
  activeEdges,
  selectedConceptId,
  onSelectConcept,
  onSwitchToList,
}: PathGraphViewProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Group concepts by tier and compute 2D positions
  const { nodePositions, totalWidth, totalHeight, tierColumns } = useMemo(() => {
    const tiersMap = new Map<number, ConceptRecord[]>();
    for (const c of concepts) {
      const tier = c.tier ?? 0;
      if (!tiersMap.has(tier)) {
        tiersMap.set(tier, []);
      }
      tiersMap.get(tier)!.push(c);
    }

    const sortedTiers = Array.from(tiersMap.keys()).sort((a, b) => a - b);
    const positions = new Map<string, NodePosition>();
    const tierCols: Array<{ tier: number; x: number; label: string }> = [];

    let maxX = 0;
    let maxY = 0;

    sortedTiers.forEach((tier, colIndex) => {
      const colConcepts = tiersMap.get(tier)!;
      const x = PADDING_X + colIndex * (NODE_WIDTH + COLUMN_GAP);

      const label =
        tier === 0
          ? 'Tier 0: Foundational'
          : tier === 1
          ? 'Tier 1: Core Mechanisms'
          : `Tier ${tier}: Advanced`;

      tierCols.push({ tier, x, label });

      colConcepts.forEach((concept, rowIndex) => {
        const y = PADDING_Y + rowIndex * (NODE_HEIGHT + ROW_GAP);
        positions.set(concept.id, {
          concept,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          tier,
        });

        if (x + NODE_WIDTH > maxX) maxX = x + NODE_WIDTH;
        if (y + NODE_HEIGHT > maxY) maxY = y + NODE_HEIGHT;
      });
    });

    return {
      nodePositions: positions,
      totalWidth: Math.max(maxX + PADDING_X, 800),
      totalHeight: Math.max(maxY + PADDING_Y, 500),
      tierColumns: tierCols,
    };
  }, [concepts]);

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 2.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Keyboard navigation for canvas
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = 40;
    if (e.key === 'ArrowRight') setPan((p) => ({ ...p, x: p.x - step }));
    if (e.key === 'ArrowLeft') setPan((p) => ({ ...p, x: p.x + step }));
    if (e.key === 'ArrowUp') setPan((p) => ({ ...p, y: p.y + step }));
    if (e.key === 'ArrowDown') setPan((p) => ({ ...p, y: p.y - step }));
    if (e.key === '+' || e.key === '=') handleZoomIn();
    if (e.key === '-' || e.key === '_') handleZoomOut();
    if (e.key === '0') handleReset();
  };

  // Status visual attributes
  const getNodeStyles = (status: ConceptStatus, isSelected: boolean) => {
    switch (status) {
      case 'available':
        return {
          fill: 'var(--graph-node-available-bg)',
          stroke: isSelected ? 'var(--graph-node-available-stroke-selected)' : 'var(--graph-node-available-stroke)',
          textColor: 'var(--graph-node-available-text)',
          icon: Sparkles,
        };
      case 'in_progress':
        return {
          fill: 'var(--graph-node-learning-bg)',
          stroke: isSelected ? 'var(--graph-node-learning-stroke-selected)' : 'var(--graph-node-learning-stroke)',
          textColor: 'var(--graph-node-learning-text)',
          icon: Clock,
        };
      case 'review_due':
        return {
          fill: 'var(--graph-node-review-bg)',
          stroke: isSelected ? 'var(--graph-node-review-stroke-selected)' : 'var(--graph-node-review-stroke)',
          textColor: 'var(--graph-node-review-text)',
          icon: RefreshCw,
        };
      case 'mastered':
        return {
          fill: 'var(--graph-node-mastered-bg)',
          stroke: isSelected ? 'var(--graph-node-mastered-stroke-selected)' : 'var(--graph-node-mastered-stroke)',
          textColor: 'var(--graph-node-mastered-text)',
          icon: CheckCircle2,
        };
      case 'locked':
      default:
        return {
          fill: 'var(--graph-node-locked-bg)',
          stroke: isSelected ? 'var(--graph-node-locked-text)' : 'var(--graph-node-locked-stroke)',
          textColor: 'var(--graph-node-locked-text)',
          icon: Lock,
        };
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative flex flex-col h-[650px] w-full overflow-hidden rounded-xl border border-border-subtle bg-canvas outline-none focus:ring-1 focus:ring-accent-violet"
      role="region"
      aria-label="Interactive concept dependency graph"
    >
      {/* Mobile Switch Banner */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle/80 px-4 py-2 sm:hidden text-xs">
        <span className="text-text-muted">Graph view is best on larger screens.</span>
        <button
          type="button"
          onClick={onSwitchToList}
          className="inline-flex items-center gap-1 font-medium text-accent-cyan"
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Switch to List</span>
        </button>
      </div>

      {/* Graph Toolbar: Pan/Zoom controls */}
      <div
        role="toolbar"
        aria-label="Graph navigation controls"
        className="absolute top-4 left-4 z-10 flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-elevated/90 p-1 shadow-md backdrop-blur"
      >
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded p-1.5 text-text-muted hover:bg-surface-card hover:text-text-primary"
          aria-label="Zoom in (+)"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded p-1.5 text-text-muted hover:bg-surface-card hover:text-text-primary"
          aria-label="Zoom out (-)"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="h-4 w-px bg-border-subtle" />
        <button
          type="button"
          onClick={handleReset}
          className="rounded p-1.5 text-text-muted hover:bg-surface-card hover:text-text-primary"
          aria-label="Reset pan and zoom (0)"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="px-2 text-[11px] font-mono text-text-muted">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: 'transform 120ms ease-out',
          }}
        >
          <defs>
            {/* Arrowhead marker for directed edges */}
            <marker
              id="arrowhead-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--graph-edge)" />
            </marker>
            <marker
              id="arrowhead-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--graph-edge-highlight)" />
            </marker>
          </defs>

          {/* Tier Column Headers */}
          {tierColumns.map((col) => (
            <g key={col.tier} className="tier-header">
              <text
                x={col.x + NODE_WIDTH / 2}
                y={32}
                textAnchor="middle"
                className="fill-text-muted text-xs font-semibold uppercase tracking-wider"
              >
                {col.label}
              </text>
              <line
                x1={col.x + NODE_WIDTH / 2}
                y1={42}
                x2={col.x + NODE_WIDTH / 2}
                y2={totalHeight - 20}
                stroke="var(--graph-grid)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Directed Edges */}
          {activeEdges.map((edge) => {
            const source = nodePositions.get(edge.prerequisiteId);
            const target = nodePositions.get(edge.dependentConceptId);
            if (!source || !target) return null;

            const isHighlighted =
              selectedConceptId === edge.prerequisiteId ||
              selectedConceptId === edge.dependentConceptId;

            // Compute curved bezier path from right edge of source to left edge of target
            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x - 4;
            const endY = target.y + target.height / 2;

            const dx = Math.abs(endX - startX) * 0.5;
            const pathData = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

            return (
              <path
                key={edge.id}
                d={pathData}
                fill="none"
                stroke={isHighlighted ? 'var(--graph-edge-highlight)' : 'var(--graph-edge)'}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                markerEnd={isHighlighted ? 'url(#arrowhead-active)' : 'url(#arrowhead-default)'}
                className="transition-colors duration-150"
              />
            );
          })}

          {/* Concept Nodes */}
          {Array.from(nodePositions.values()).map(({ concept, x, y, width, height, tier }) => {
            const isSelected = selectedConceptId === concept.id;
            const styles = getNodeStyles(concept.status, isSelected);

            // Shape differentiation based on tier:
            // Tier 0: Pill / capsule (rx = 20)
            // Tier 1: Rounded rect (rx = 10)
            // Tier 2+: Sharp / chamfered rect (rx = 4)
            const rx = tier === 0 ? 20 : tier === 1 ? 10 : 4;

            return (
              <g
                key={concept.id}
                transform={`translate(${x}, ${y})`}
                tabIndex={0}
                role="button"
                aria-label={`${concept.title}, ${concept.status}, Tier ${tier}`}
                onClick={() => onSelectConcept(concept.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectConcept(concept.id);
                  }
                }}
                className="cursor-pointer group outline-none"
              >
                {/* Node Box */}
                <rect
                  width={width}
                  height={height}
                  rx={rx}
                  ry={rx}
                  fill={styles.fill}
                  stroke={styles.stroke}
                  strokeWidth={isSelected ? 3 : 1.5}
                  className="transition-all duration-150 group-hover:brightness-125 group-focus-visible:ring-2 group-focus-visible:ring-accent-cyan"
                />

                {/* Status Indicator Bar */}
                <rect
                  x={4}
                  y={4}
                  width={4}
                  height={height - 8}
                  rx={2}
                  fill={styles.stroke}
                />

                {/* Node Label Text */}
                <text
                  x={16}
                  y={26}
                  className="fill-text-primary text-xs font-semibold select-none group-hover:fill-accent-cyan transition-colors"
                >
                  {concept.title.length > 20
                    ? `${concept.title.substring(0, 18)}…`
                    : concept.title}
                </text>

                {/* Node Subtitle: Status & Tier */}
                <text
                  x={16}
                  y={46}
                  fill={styles.textColor}
                  className="text-[11px] font-medium uppercase tracking-wider select-none"
                >
                  {concept.status.replace('_', ' ')} • T{tier}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible Legend */}
      <footer
        aria-label="Graph visual legend"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-card/80 px-4 py-2 text-xs text-text-muted backdrop-blur"
      >
        {/* Shape Legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary">Shapes:</span>
          <span className="inline-flex items-center gap-1">
            <Circle className="h-3 w-3 text-text-muted" aria-hidden="true" />
            <span>T0: Foundational</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Square className="h-3 w-3 text-text-muted" aria-hidden="true" />
            <span>T1: Core</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Hexagon className="h-3 w-3 text-text-muted" aria-hidden="true" />
            <span>T2+: Advanced</span>
          </span>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary">Status:</span>
          <span className="inline-flex items-center gap-1 text-accent-cyan">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>Available</span>
          </span>
          <span className="inline-flex items-center gap-1 text-accent-violet">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>In Progress</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--success)]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            <span>Mastered</span>
          </span>
          <span className="inline-flex items-center gap-1 text-text-muted">
            <Lock className="h-3 w-3" aria-hidden="true" />
            <span>Locked</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
