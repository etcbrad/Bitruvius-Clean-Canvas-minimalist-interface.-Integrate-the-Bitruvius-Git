
import React from 'react';
import { Vector2D } from '../types'; // Assuming Vector2D is defined in types.ts
import { ANATOMY, GROUND_STRIP_HEIGHT, GROUND_STRIP_COLOR } from '../constants'; // Import ANATOMY and new ground constants

interface AdvancedGridProps {
  origin: Vector2D;
  gridSize: number;
  viewBox: { x: number; y: number; width: number; height: number };
}

interface SystemGuidesProps {
  floorY: number;
  groundMode: 'gradient' | 'black' | 'white' | 'transparent' | 'perspective';
  groundPattern: 'none' | 'hatch' | 'stippling' | 'dither';
  perspective?: {
    lines: number;
    spacing: number;
    convergence: number;
  };
}

export const Scanlines: React.FC = () => (
  <svg width="100%" height="100%" className="absolute inset-0 z-10 pointer-events-none opacity-20">
    <defs>
      <pattern id="scanlines" patternUnits="userSpaceOnUse" width="1" height="4">
        <line x1="0" y1="1" x2="1" y2="1" stroke="#2D2D2D" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#scanlines)" />
  </svg>
);

export const AdvancedGrid: React.FC<AdvancedGridProps> = ({ origin, gridSize, viewBox }) => {
  if (gridSize <= 0) return null;

  const lines: React.ReactNode[] = [];
  const minorGridSize = gridSize / 4;

  // Vertical lines
  const startX = Math.floor((viewBox.x - origin.x) / minorGridSize) * minorGridSize + origin.x;
  const endX = viewBox.x + viewBox.width;
  for (let x = startX; x <= endX; x += minorGridSize) {
    const isMajor = Math.abs(Math.round((x - origin.x) / minorGridSize)) % 4 === 0;
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={viewBox.y}
        x2={x}
        y2={viewBox.y + viewBox.height}
        stroke={isMajor ? 'rgba(80, 80, 80, 0.3)' : 'rgba(80, 80, 80, 0.15)'} // Changed to darker monochrome rgba
        strokeWidth={isMajor ? 1 : 0.5}
      />
    );
  }

  // Horizontal lines
  const startY = Math.floor((viewBox.y - origin.y) / minorGridSize) * minorGridSize + origin.y;
  const endY = viewBox.y + viewBox.height;
  for (let y = startY; y <= endY; y += minorGridSize) {
    const isMajor = Math.abs(Math.round((y - origin.y) / minorGridSize)) % 4 === 0;
    lines.push(
      <line
        key={`h-${y}`}
        x1={viewBox.x}
        y1={y}
        x2={viewBox.x + viewBox.width}
        y2={y}
        stroke={isMajor ? 'rgba(80, 80, 80, 0.3)' : 'rgba(80, 80, 80, 0.15)'} // Changed to darker monochrome rgba
        strokeWidth={isMajor ? 1 : 0.5}
      />
    );
  }

  return <g className="pointer-events-none">{lines}</g>;
};

export const SystemGuides: React.FC<SystemGuidesProps> = ({ floorY, groundMode, groundPattern, perspective }) => {
  const guideColor = 'rgba(80, 80, 80, 0.25)'; // Changed to darker monochrome rgba
  const span = 2000; // Extend guide lines far beyond typical viewport
  const groundColor = groundMode === 'white' ? '#ffffff' : '#000000';

  return (
    <g className="pointer-events-none">
      {/* Center X-axis guide */}
      <line x1={-span} y1="0" x2={span} y2="0" stroke={guideColor} strokeWidth="1" opacity="0.3" strokeDasharray="10 5" />
      {/* Center Y-axis guide */}
      <line x1="0" y1={-span} x2="0" y2={span} stroke={guideColor} strokeWidth="1" opacity="0.3" strokeDasharray="10 5" />

      {/* Floor guide line and ground strip */}
      {groundMode !== 'transparent' && (
        <g style={{ transition: 'all 0.2s ease-in-out' }}>
          <defs>
            <linearGradient id="ground-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={groundColor} stopOpacity="0.9" />
              <stop offset="100%" stopColor={groundColor} stopOpacity="0" />
            </linearGradient>
            <pattern id="ground-hatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="12" stroke={groundColor} strokeWidth="1" opacity="0.25" />
            </pattern>
            <pattern id="ground-stipple" patternUnits="userSpaceOnUse" width="10" height="10">
              <circle cx="2" cy="2" r="1.4" fill={groundColor} opacity="0.25" />
              <circle cx="7" cy="6" r="1.2" fill={groundColor} opacity="0.2" />
            </pattern>
            <pattern id="ground-dither" patternUnits="userSpaceOnUse" width="4" height="4">
              <circle cx="1" cy="1" r="0.7" fill={groundColor} opacity="0.2" />
              <circle cx="3" cy="3" r="0.7" fill={groundColor} opacity="0.2" />
            </pattern>
          </defs>
          {/* Main floor guide line */}
          <line
            x1={-span}
            y1={floorY}
            x2={span}
            y2={floorY}
            stroke={groundColor}
            strokeWidth={1}
            opacity={groundMode === 'gradient' ? 0.9 : 1}
          />
          {/* Ground strip */}
          <rect
            x={-span}
            y={floorY}
            width={span * 2}
            height={GROUND_STRIP_HEIGHT}
            fill={groundMode === 'gradient' ? 'url(#ground-fade)' : groundColor}
            opacity={groundMode === 'gradient' ? 1 : 0.8}
          />
          {groundPattern !== 'none' && (
            <rect
              x={-span}
              y={floorY}
              width={span * 2}
              height={GROUND_STRIP_HEIGHT}
              fill={
                groundPattern === 'hatch'
                  ? 'url(#ground-hatch)'
                  : groundPattern === 'stippling'
                    ? 'url(#ground-stipple)'
                    : 'url(#ground-dither)'
              }
              opacity={0.9}
            />
          )}
          {groundMode === 'perspective' && (
            <g>
              {Array.from({ length: perspective?.lines ?? 10 }).map((_, index) => {
                const spacing = perspective?.spacing ?? 40;
                const convergence = perspective?.convergence ?? 0.85;
                const t = index + 1;
                const y = floorY + t * spacing * Math.pow(convergence, t - 1);
                const widthScale = Math.max(0.1, Math.pow(convergence, t));
                const lineOpacity = Math.max(0, 0.5 - t * 0.03);
                return (
                  <line
                    key={`persp-${index}`}
                    x1={-span * widthScale}
                    y1={y}
                    x2={span * widthScale}
                    y2={y}
                    stroke={groundColor}
                    strokeWidth={1}
                    opacity={lineOpacity}
                  />
                );
              })}
            </g>
          )}
        </g>
      )}
    </g>
  );
};
