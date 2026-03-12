import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mannequin } from './Mannequin';
import { Pose, PartSelection, PartVisibility, AnchorName, JointConstraint, RenderMode, PinnedState, PartName } from '../types';

interface CanvasRotationWheelProps {
  selectedPartLabel: string;
  anchorLabel: string;
  rotationModeLabel: string;
  kinematicModeLabel: string;
  kinematicModeDescription: string;
  onRotateChild: (delta: number) => void;
  onRotateParent: (delta: number) => void;
  onSelectPrevPart: () => void;
  onSelectNextPart: () => void;
  onCycleRotationMode: () => void;
  onCycleKinematicMode: () => void;
  onToggleSmartPinning: () => void;
  onToggleMirror: () => void;
  onToggleOmni: () => void;
  onToggleMasks: () => void;
  smartPinning: boolean;
  mirrorMode: boolean;
  omniMode: boolean;
  masksVisible: boolean;
  currentRotation: number;
  parentRotation: number;
  pose: Pose;
  selectedParts: PartSelection;
  visibility: PartVisibility;
  activePins: AnchorName[];
  pinnedState: PinnedState;
  jointModes: Record<PartName, JointConstraint>;
  renderMode: RenderMode;
  modelStyle: 'default' | 'oval';
  boneScale: Record<PartName, { length: number; width: number }>;
  boneVariantOverrides?: Record<PartName, import('../types').BoneVariant | null>;
  viewBox: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const CanvasRotationWheel: React.FC<CanvasRotationWheelProps> = ({
  selectedPartLabel,
  anchorLabel,
  rotationModeLabel,
  kinematicModeLabel,
  kinematicModeDescription,
  onRotateChild,
  onRotateParent,
  onSelectPrevPart,
  onSelectNextPart,
  onCycleRotationMode,
  onCycleKinematicMode,
  onToggleSmartPinning,
  onToggleMirror,
  onToggleOmni,
  onToggleMasks,
  smartPinning,
  mirrorMode,
  omniMode,
  masksVisible,
  currentRotation,
  parentRotation,
  pose,
  selectedParts,
  visibility,
  activePins,
  pinnedState,
  jointModes,
  renderMode,
  modelStyle,
  boneScale,
  boneVariantOverrides,
  viewBox,
  collapsed,
  onToggleCollapsed,
}) => {
  const wheelBoundsRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeWheel, setActiveWheel] = useState<'inner' | 'outer' | null>(null);
  const [outerControlsChild, setOuterControlsChild] = useState(false);
  const [visualRotation, setVisualRotation] = useState(0);
  const ROTATION_DAMPENING = 0.5;

  const handleInteractionMove = useCallback((clientX: number, clientY: number) => {
    if (!wheelBoundsRef.current || lastAngleRef.current === null || !activeWheel) return;
    
    const rect = wheelBoundsRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    let deltaAngle = angle - lastAngleRef.current;

    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

    lastAngleRef.current = angle;
    
    const rotationDegrees = deltaAngle * (180 / Math.PI) * ROTATION_DAMPENING;

    if (activeWheel === 'inner') {
      onRotateChild(rotationDegrees);
    } else {
      if (outerControlsChild) {
        onRotateChild(rotationDegrees);
      } else {
        onRotateParent(rotationDegrees);
      }
    }
  }, [activeWheel, onRotateChild, onRotateParent, outerControlsChild]);

  const handleInteractionEnd = useCallback(() => {
    setIsDragging(false);
    lastAngleRef.current = null;
    setActiveWheel(null);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleInteractionMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => handleInteractionMove(e.touches[0].clientX, e.touches[0].clientY);
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleInteractionEnd);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleInteractionEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleInteractionEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleInteractionEnd);
    };
  }, [isDragging, handleInteractionMove, handleInteractionEnd]);

  const handleInteractionStart = (clientX: number, clientY: number, wheel: 'inner' | 'outer') => {
    if (!wheelBoundsRef.current) return;
    setIsDragging(true);
    setActiveWheel(wheel);
    const rect = wheelBoundsRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    lastAngleRef.current = angle;
  };

  useEffect(() => {
    if (!Number.isFinite(currentRotation)) return;
    setVisualRotation(currentRotation);
  }, [currentRotation]);

  const outerRotation = outerControlsChild ? currentRotation : parentRotation;

  if (collapsed) {
    return (
      <div className="relative pointer-events-auto">
        <button
          onClick={onToggleCollapsed}
          className="w-20 h-20 rounded-full bg-black/60 border border-white/20 shadow-xl flex items-center justify-center"
          aria-label="Expand rotation wheel"
        >
          <svg viewBox={viewBox} className="w-16 h-16">
            <g>
              <Mannequin
                pose={pose}
                showOverlay={false}
                showPins={false}
                modelStyle={modelStyle}
                boneScale={boneScale}
                boneVariantOverrides={boneVariantOverrides}
                selectedParts={selectedParts}
                visibility={visibility}
                activePins={activePins}
                pinnedState={pinnedState}
                jointModes={jointModes}
                renderMode={renderMode}
              />
            </g>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative pointer-events-auto">
      <button
        onClick={onToggleCollapsed}
        className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-black/70 border border-white/20 text-white/70 text-[10px] hover:text-white"
        aria-label="Collapse rotation wheel"
      >
        −
      </button>
      <div ref={wheelBoundsRef} className="relative w-[18.75rem] h-[18.75rem]">
        <div
          style={{ transform: `rotate(${outerRotation}deg)` }}
          className={`absolute inset-0 rounded-full border shadow-inner backdrop-blur-sm cursor-grab active:cursor-grabbing ${
            outerControlsChild
              ? 'bg-white/10 border-white/50'
              : 'bg-black/70 border-white/10'
          }`}
          onMouseDown={(e) => handleInteractionStart(e.clientX, e.clientY, 'outer')}
          onTouchStart={(e) => handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY, 'outer')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setOuterControlsChild(prev => !prev);
          }}
          aria-label="Outer rotation wheel"
        />
        <div
          style={{ transform: `rotate(${visualRotation}deg)` }}
          className="absolute inset-[0.9375rem] rounded-full bg-selection/30 border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-inner backdrop-blur-sm"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleInteractionStart(e.clientX, e.clientY, 'inner');
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY, 'inner');
          }}
        >
          {/* Inner Screen */}
          <div 
            style={{ transform: `rotate(${-visualRotation}deg)` }}
            className="w-[13.125rem] h-[13.125rem] rounded-full bg-mono-darker/80 border-4 border-white/10 flex flex-col items-center text-center p-3 overflow-hidden">
            <div className="w-full flex items-center justify-between text-[9px] uppercase text-white/50">
              <span>Anchor</span>
              <span className="text-white/70">{anchorLabel || 'NONE'}</span>
            </div>

            <div className="mt-2 w-full flex items-center justify-center gap-2 text-[9px] uppercase">
              <button onClick={() => onRotateChild(-1)} className="w-10 py-0.5 border border-white/10 text-white/60 hover:text-white">-1</button>
              <button onClick={() => onRotateChild(1)} className="w-10 py-0.5 border border-white/10 text-white/60 hover:text-white">+1</button>
            </div>

            <div className="mt-2 w-full flex items-center justify-between">
              <button onClick={onSelectPrevPart} className="px-2 text-white/50 hover:text-white text-lg">‹</button>
              <div className="flex flex-col items-center justify-center">
                <div className="text-white text-[10px] uppercase tracking-widest">
                  {selectedPartLabel || '--'}
                </div>
              <button
                onClick={onCycleRotationMode}
                className="mt-2 px-2 py-0.5 rounded text-[9px] uppercase border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
              >
                {rotationModeLabel}
              </button>
              <button
                onClick={onCycleKinematicMode}
                className="mt-1 px-2 py-0.5 rounded text-[9px] uppercase border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
                title={kinematicModeDescription}
              >
                {kinematicModeLabel}
              </button>
              </div>
              <button onClick={onSelectNextPart} className="px-2 text-white/50 hover:text-white text-lg">›</button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 w-full text-[8px] uppercase">
              <button
                onClick={onToggleSmartPinning}
                className={`py-1 border ${smartPinning ? 'border-selection text-selection bg-selection/20' : 'border-white/10 text-white/50 hover:text-white'}`}
              >
                Smart
              </button>
              <button
                onClick={onToggleMirror}
                className={`py-1 border ${mirrorMode ? 'border-selection text-selection bg-selection/20' : 'border-white/10 text-white/50 hover:text-white'}`}
              >
                Mirror
              </button>
              <button
                onClick={onToggleOmni}
                className={`py-1 border ${omniMode ? 'border-selection text-selection bg-selection/20' : 'border-white/10 text-white/50 hover:text-white'}`}
              >
                Omni
              </button>
              <button
                onClick={onToggleMasks}
                className={`py-1 border col-span-3 flex items-center justify-center gap-1 ${
                  masksVisible ? 'border-selection text-selection bg-selection/20' : 'border-white/10 text-white/50 hover:text-white'
                }`}
                aria-label="Toggle mask controls"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7c3 3 6 4 9 4s6-1 9-4v6c0 4-3 7-9 7s-9-3-9-7V7Z" />
                  <path d="M8 11c1 1 2 1 4 1s3 0 4-1" />
                </svg>
                Mask
              </button>
            </div>

            <div className="mt-auto w-full flex items-center justify-center gap-2 text-[9px] uppercase">
              <button onClick={() => onRotateChild(-10)} className="w-12 py-1 border border-white/10 text-white/60 hover:text-white">-10</button>
              <button onClick={() => onRotateChild(10)} className="w-12 py-1 border border-white/10 text-white/60 hover:text-white">+10</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
