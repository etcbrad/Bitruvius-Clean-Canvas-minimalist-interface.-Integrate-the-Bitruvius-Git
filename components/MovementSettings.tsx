import React from 'react';
import { SequenceState, BodyDragMode } from '../types';

interface MovementSettingsProps {
  sequence: SequenceState;
  autoInterpolation: boolean;
  bodyDragMode: BodyDragMode;
  bodyDragWeightiness: number;
  onEasingToggle: () => void;
  onSmoothToggle: () => void;
  onIKToggle: () => void;
  onAutoInterpolationToggle: () => void;
  onCycleBodyDragMode: () => void;
  onCycleBodyDragWeightiness: () => void;
  walkingEnabled: boolean;
  walkingPresetName: string;
  gaitDepth: number;
  walkingSpeed: number;
  walkingPinMode: 'none' | 'leftFoot' | 'rightFoot' | 'dual';
  onToggleWalking: () => void;
  onCycleWalkingPreset: () => void;
  onGaitDepthChange: (value: number) => void;
  onWalkingSpeedChange: (value: number) => void;
  onWalkingPinModeChange: (mode: 'none' | 'leftFoot' | 'rightFoot' | 'dual') => void;
  onSaveWalkingLoop: () => void;
  onOpenCalibration?: () => void;
}

export const MovementSettings: React.FC<MovementSettingsProps> = ({
  sequence,
  autoInterpolation,
  bodyDragMode,
  bodyDragWeightiness,
  onEasingToggle,
  onSmoothToggle,
  onIKToggle,
  onAutoInterpolationToggle,
  onCycleBodyDragMode,
  onCycleBodyDragWeightiness,
  walkingEnabled,
  walkingPresetName,
  gaitDepth,
  walkingSpeed,
  walkingPinMode,
  onToggleWalking,
  onCycleWalkingPreset,
  onGaitDepthChange,
  onWalkingSpeedChange,
  onWalkingPinModeChange,
  onSaveWalkingLoop,
  onOpenCalibration
}) => {
  const weightLabel = bodyDragWeightiness === 0
    ? 'RIGID'
    : bodyDragWeightiness < 0.5
      ? 'HEAVY'
      : 'ANCHOR';

  const motionToggles = [
    {
      id: 'easing',
      label: 'Easing',
      enabled: sequence.easingEnabled,
      onClick: onEasingToggle,
      activeClass: 'bg-accent-blue/30 border-accent-blue text-white'
    },
    {
      id: 'smooth',
      label: 'Smooth',
      enabled: sequence.smoothTransitions,
      onClick: onSmoothToggle,
      activeClass: 'bg-accent-cyan/30 border-accent-cyan text-white'
    },
    {
      id: 'ik',
      label: 'IK Assist',
      enabled: sequence.ikAssisted,
      onClick: onIKToggle,
      activeClass: 'bg-accent-orange/30 border-accent-orange text-white'
    },
    {
      id: 'auto-interp',
      label: 'Auto-Interp',
      enabled: autoInterpolation,
      onClick: onAutoInterpolationToggle,
      activeClass: 'bg-accent-green/30 border-accent-green text-white'
    }
  ];

  const statusRows = [
    { label: 'Total Slots', value: String(sequence.slots.length), valueClass: 'text-white' },
    { label: 'Playback', value: sequence.isPlaying ? 'PLAYING' : 'STOPPED', valueClass: sequence.isPlaying ? 'text-accent-green' : 'text-white/50' },
    { label: 'Loop Mode', value: sequence.loop ? 'ENABLED' : 'DISABLED', valueClass: sequence.loop ? 'text-accent-purple' : 'text-white/50' },
    { label: 'Position', value: `${(sequence.scrubPosition * 100).toFixed(1)}%`, valueClass: 'text-white font-mono' }
  ];

  return (
    <div className="flex flex-col gap-2 w-full text-left">
      <div className="text-white/50 text-[9px] uppercase tracking-wider">Motion Controls</div>
      <div className="grid grid-cols-2 gap-1">
        {motionToggles.map(toggle => (
          <button
            key={toggle.id}
            onClick={toggle.onClick}
            className={`text-[9px] text-center px-2 py-1 transition-all border ${
              toggle.enabled
                ? toggle.activeClass
                : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
            }`}
            aria-pressed={toggle.enabled}
          >
            {toggle.label.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-white/50 text-[9px] uppercase mt-2">Body Drag</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={onCycleBodyDragMode}
            className="text-[9px] text-center px-2 py-1 transition-all border bg-white/5 border-transparent text-white/60 hover:bg-white/10"
          >
            DRAG: {bodyDragMode.toUpperCase()}
          </button>
          <button
            onClick={onCycleBodyDragWeightiness}
            className="text-[9px] text-center px-2 py-1 transition-all border bg-white/5 border-transparent text-white/60 hover:bg-white/10"
          >
            WEIGHT: {weightLabel}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-white/50 text-[9px] uppercase mt-2">Walking Engine</div>
        <div className="flex items-center justify-between">
          <button
            onClick={onToggleWalking}
            className={`text-[9px] px-2 py-1 border transition-all ${
              walkingEnabled ? 'bg-accent-green/20 border-accent-green text-accent-green' : 'bg-white/5 border-white/10 text-white/40'
            }`}
            aria-pressed={walkingEnabled}
          >
            {walkingEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
          <button
            onClick={onCycleWalkingPreset}
            className="text-[9px] px-2 py-1 border bg-white/5 border-transparent text-white/60 hover:bg-white/10"
          >
            {walkingPresetName.toUpperCase()}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gaitDepth" className="text-white/40 text-[8px] uppercase">Gait Depth</label>
          <input
            id="gaitDepth"
            type="range"
            min={0}
            max={100}
            step={1}
            value={gaitDepth}
            onChange={(e) => onGaitDepthChange(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="text-white/60 text-[8px]">{gaitDepth}%</div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="speed" className="text-white/40 text-[8px] uppercase">Speed</label>
          <input
            id="speed"
            type="range"
            min={0.4}
            max={2.5}
            step={0.05}
            value={walkingSpeed}
            onChange={(e) => onWalkingSpeedChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-white/60 text-[8px]">{walkingSpeed.toFixed(2)}x</div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-white/40 text-[8px] uppercase">Pin Mode</span>
          <div className="grid grid-cols-2 gap-1">
            {(['none', 'leftFoot', 'rightFoot', 'dual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => onWalkingPinModeChange(mode)}
                className={`text-[9px] text-center px-2 py-1 transition-all border ${
                  walkingPinMode === mode ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                }`}
                aria-pressed={walkingPinMode === mode}
              >
                {mode === 'none' ? 'NONE' : mode === 'leftFoot' ? 'LEFT' : mode === 'rightFoot' ? 'RIGHT' : 'DUAL'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onSaveWalkingLoop}
          className="text-[9px] px-2 py-1 border bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
        >
          Save Loop To Timeline
        </button>

        {onOpenCalibration && (
          <button
            onClick={onOpenCalibration}
            className="text-[9px] px-2 py-1 border bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30"
          >
            Calibrate
          </button>
        )}
      </div>

      {/* Animation Status */}
      <div className="flex flex-col gap-2">
        <div className="text-white/50 text-[9px] uppercase mt-2">Status</div>
        {statusRows.map(row => (
          <div key={row.label} className="flex justify-between text-[9px]">
            <span className="text-white/70">{row.label}:</span>
            <span className={`font-medium ${row.valueClass}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-white/30 text-[9px] leading-relaxed">
          <div className="mb-1"><span className="text-white/50">Easing:</span> Smooth acceleration/deceleration</div>
          <div className="mb-1"><span className="text-white/50">Smooth:</span> Natural motion curves</div>
          <div className="mb-1"><span className="text-white/50">IK Assist:</span> Biomechanical transitions</div>
          <div><span className="text-white/50">Auto-Interp:</span> Smart keyframe generation</div>
          <div className="mt-2"><span className="text-white/50">Body Drag:</span> Full-body IK drag styles</div>
        </div>
      </div>
    </div>
  );
};
