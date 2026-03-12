import React, { useState } from 'react';
import { SequenceState, PoseSlot, EasingFunction } from '../types';

interface TimelineProps {
  sequence: SequenceState;
  onScrubPositionChange: (position: number) => void;
  onSlotClick: (slotId: string) => void;
  onSlotUpdate: (slotId: string, pose: any) => void;
  onSlotDelete: (slotId: string) => void;
  onSlotReorder: (fromIndex: number, toIndex: number) => void;
  onTransitionUpdate: (slotId: string, duration: number, easing: EasingFunction) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onLoopToggle: () => void;
  onAddSlot: () => void;
  onEasingToggle: () => void;
  onSmoothToggle: () => void;
  onIKToggle: () => void;
  currentPose?: any;
}

export const Timeline: React.FC<TimelineProps> = ({
  sequence,
  onScrubPositionChange,
  onSlotClick,
  onSlotUpdate,
  onSlotDelete,
  onSlotReorder,
  onTransitionUpdate,
  onPlay,
  onPause,
  onStop,
  onLoopToggle,
  onAddSlot,
  onEasingToggle,
  onSmoothToggle,
  onIKToggle,
  currentPose
}) => {
  const [expandedTransitions, setExpandedTransitions] = useState<Record<string, boolean>>({});
  const [draggedSlot, setDraggedSlot] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');

  const totalDuration = sequence.slots.slice(0, -1).reduce((sum, slot) => sum + slot.durationToNext, 0);

  const handleSlotDragStart = (index: number) => {
    setDraggedSlot(index);
  };

  const handleSlotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSlotDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedSlot !== null && draggedSlot !== dropIndex) {
      onSlotReorder(draggedSlot, dropIndex);
    }
    setDraggedSlot(null);
  };

  const toggleTransitionExpansion = (slotId: string) => {
    setExpandedTransitions(prev => ({
      ...prev,
      [slotId]: !prev[slotId]
    }));
  };

  const startEditingLabel = (slotId: string, currentLabel: string) => {
    setEditingSlot(slotId);
    setEditingLabel(currentLabel);
  };

  const saveLabel = (slotId: string) => {
    // This would update the slot label in the sequence
    setEditingSlot(null);
    setEditingLabel('');
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getEasingLabel = (easing: EasingFunction) => easing.replace('-', ' ');

  return (
    <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-lg p-4 space-y-4">
      {/* Playback Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={sequence.isPlaying ? onPause : onPlay}
          className="px-3 py-2 bg-accent-purple/30 border border-accent-purple text-white rounded hover:bg-accent-purple/50 transition-colors"
        >
          {sequence.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={onStop}
          className="px-3 py-2 bg-white/10 border border-white/20 text-white rounded hover:bg-white/20 transition-colors"
        >
          ⏹️ Stop
        </button>
        <button
          onClick={onLoopToggle}
          className={`px-3 py-2 border rounded transition-colors ${
            sequence.loop 
              ? 'bg-accent-purple/30 border-accent-purple text-white' 
              : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
          }`}
        >
          Loop: {sequence.loop ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={onAddSlot}
          className="px-3 py-2 bg-accent-green/30 border border-accent-green text-white rounded hover:bg-accent-green/50 transition-colors"
        >
          Add Slot
        </button>
      </div>

      {/* Transition Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onEasingToggle}
          className={`px-3 py-2 border rounded transition-colors text-sm ${
            sequence.easingEnabled 
              ? 'bg-accent-blue/30 border-accent-blue text-white' 
              : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
          }`}
        >
          Easing: {sequence.easingEnabled ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={onSmoothToggle}
          className={`px-3 py-2 border rounded transition-colors text-sm ${
            sequence.smoothTransitions 
              ? 'bg-accent-cyan/30 border-accent-cyan text-white' 
              : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
          }`}
        >
          Smooth: {sequence.smoothTransitions ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={onIKToggle}
          className={`px-3 py-2 border rounded transition-colors text-sm ${
            sequence.ikAssisted 
              ? 'bg-accent-orange/30 border-accent-orange text-white' 
              : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
          }`}
        >
          IK Assist: {sequence.ikAssisted ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Scrub Bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-white/70 text-xs">◀ 0%</span>
          <div className="flex-1 relative">
            <div className="h-2 bg-white/10 rounded-full">
              <div 
                className="h-2 bg-accent-purple rounded-full transition-all duration-100"
                style={{ width: `${sequence.scrubPosition * 100}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={sequence.scrubPosition}
              onChange={(e) => onScrubPositionChange(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-white/70 text-xs">100%</span>
        </div>
        <div className="text-center text-white/50 text-xs">
          {formatDuration(sequence.currentTimeMs)} / {formatDuration(totalDuration)}
        </div>
      </div>

      {/* Timeline Slots */}
      <div className="space-y-2">
        {sequence.slots.map((slot, index) => (
          <div key={slot.id} className="space-y-1">
            {/* Slot */}
            <div
              draggable
              onDragStart={() => handleSlotDragStart(index)}
              onDragOver={handleSlotDragOver}
              onDrop={(e) => handleSlotDrop(e, index)}
              className={`flex items-center gap-2 p-2 bg-white/5 border rounded cursor-move transition-all ${
                draggedSlot === index ? 'opacity-50 border-accent-purple' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <button
                onClick={() => onSlotClick(slot.id)}
                className="flex-shrink-0 w-8 h-8 bg-accent-purple/30 border border-accent-purple text-white rounded text-xs font-bold hover:bg-accent-purple/50 transition-colors"
              >
                {editingSlot === slot.id ? (
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => saveLabel(slot.id)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel(slot.id)}
                    className="w-full bg-transparent text-center text-xs outline-none"
                    autoFocus
                  />
                ) : (
                  slot.label || String.fromCharCode(65 + index)
                )}
              </button>
              
              <div className="flex-1 text-white/70 text-xs">
                Slot {index + 1}
              </div>
              
              <button
                onClick={() => startEditingLabel(slot.id, slot.label)}
                className="text-white/50 hover:text-white text-xs"
                title="Rename"
              >
                ✏️
              </button>
              
              <button
                onClick={() => onSlotUpdate(slot.id, currentPose)}
                className="text-white/50 hover:text-white text-xs"
                title="Update from current pose"
              >
                📥
              </button>
              
              {sequence.slots.length > 2 && (
                <button
                  onClick={() => onSlotDelete(slot.id)}
                  className="text-red-400/50 hover:text-red-400 text-xs"
                  title="Delete slot"
                >
                  🗑️
                </button>
              )}
            </div>

            {/* Transition Editor */}
            {index < sequence.slots.length - 1 && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleTransitionExpansion(slot.id)}
                  className="flex items-center gap-2 w-full p-1 text-left text-white/50 hover:text-white text-xs"
                >
                  <span>{formatDuration(slot.durationToNext)}</span>
                  <span className="text-white/30">{getEasingLabel(slot.easing)}</span>
                  <span className="ml-auto">{expandedTransitions[slot.id] ? '▼' : '▶'}</span>
                </button>
                
                {expandedTransitions[slot.id] && (
                  <div className="pl-10 pr-2 py-2 bg-white/5 border border-white/10 rounded space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-white/70 text-xs">Duration:</label>
                      <input
                        type="number"
                        value={slot.durationToNext}
                        onChange={(e) => onTransitionUpdate(slot.id, parseInt(e.target.value) || 1000, slot.easing)}
                        className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs"
                        min="100"
                        step="100"
                      />
                      <span className="text-white/50 text-xs">ms</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <label className="text-white/70 text-xs">Easing:</label>
                      <select
                        value={slot.easing}
                        onChange={(e) => onTransitionUpdate(slot.id, slot.durationToNext, e.target.value as EasingFunction)}
                        className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs"
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="ease-in-out">Ease In Out</option>
                        <option value="spring">Spring</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
