import React from 'react';
import { SequenceState, Pose } from '../types';

interface MovementSettingsProps {
  sequence: SequenceState;
  autoInterpolation: boolean;
  onEasingToggle: () => void;
  onSmoothToggle: () => void;
  onIKToggle: () => void;
  onAutoInterpolationToggle: () => void;
}

export const MovementSettings: React.FC<MovementSettingsProps> = ({
  sequence,
  autoInterpolation,
  onEasingToggle,
  onSmoothToggle,
  onIKToggle,
  onAutoInterpolationToggle
}) => {
  const motionToggles = [
    {
      id: 'easing',
      label: 'Easing',
      icon: '🎭',
      enabled: sequence.easingEnabled,
      onClick: onEasingToggle,
      activeClass: 'bg-accent-blue/30 border-accent-blue text-white'
    },
    {
      id: 'smooth',
      label: 'Smooth',
      icon: '〰️',
      enabled: sequence.smoothTransitions,
      onClick: onSmoothToggle,
      activeClass: 'bg-accent-cyan/30 border-accent-cyan text-white'
    },
    {
      id: 'ik',
      label: 'IK Assist',
      icon: '🦾',
      enabled: sequence.ikAssisted,
      onClick: onIKToggle,
      activeClass: 'bg-accent-orange/30 border-accent-orange text-white'
    },
    {
      id: 'auto-interp',
      label: 'Auto-Interp',
      icon: '🔄',
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
            {toggle.icon} {toggle.label.toUpperCase()}
          </button>
        ))}
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
          <div className="mb-1">🎭 <span className="text-white/50">Easing:</span> Smooth acceleration/deceleration</div>
          <div className="mb-1">〰️ <span className="text-white/50">Smooth:</span> Natural motion curves</div>
          <div className="mb-1">🦾 <span className="text-white/50">IK Assist:</span> Biomechanical transitions</div>
          <div>🔄 <span className="text-white/50">Auto-Interp:</span> Smart keyframe generation</div>
        </div>
      </div>
    </div>
  );
};
