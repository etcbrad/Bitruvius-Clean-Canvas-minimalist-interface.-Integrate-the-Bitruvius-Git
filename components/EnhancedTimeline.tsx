import React, { useState } from 'react';
import { SequenceState, PoseSlot, EasingFunction, Pose } from '../types';
import { poseToString, stringToPose } from '../utils/pose-parser';

interface EnhancedTimelineProps {
  sequence: SequenceState;
  currentPose: Pose;
  viewingPose: Pose | null;
  selectedSlotId: string | null;
  autoInterpolation: boolean;
  onScrubPositionChange: (position: number) => void;
  onSlotClick: (slotId: string) => void;
  onSlotUpdate: (slotId: string, pose: Pose) => void;
  onSlotLabelUpdate: (slotId: string, label: string) => void;
  onSlotDelete: (slotId: string) => void;
  onSlotReorder: (fromIndex: number, toIndex: number) => void;
  onTransitionUpdate: (slotId: string, duration: number, easing: EasingFunction) => void;
  onSlotLabelUpdate: (slotId: string, label: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onLoopToggle: () => void;
  onAddSlot: () => void;
  onEasingToggle: () => void;
  onSmoothToggle: () => void;
  onIKToggle: () => void;
  onAutoInterpolationToggle: () => void;
  onExitPoseView: () => void;
  onCaptureSlot: (label: 'A' | 'B' | 'C') => void;
}

export const EnhancedTimeline: React.FC<EnhancedTimelineProps> = ({
  sequence,
  currentPose,
  viewingPose,
  selectedSlotId,
  autoInterpolation,
  onScrubPositionChange,
  onSlotClick,
  onSlotUpdate,
  onSlotLabelUpdate,
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
  onAutoInterpolationToggle,
  onExitPoseView,
  onCaptureSlot
}) => {
  const [expandedTransitions, setExpandedTransitions] = useState<Record<string, boolean>>({});
  const [draggedSlot, setDraggedSlot] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');
  const [poseEditMode, setPoseEditMode] = useState(false);
  const [poseString, setPoseString] = useState('');
  const [activeTab, setActiveTab] = useState<'animation' | 'poses'>('animation');

  const totalDuration = sequence.slots.slice(0, -1).reduce((sum, slot) => sum + slot.durationToNext, 0);

  const handleSlotDragStart = (index: number) => {
    setDraggedSlot(index);
  };

  const handleSlotDragEnd = () => {
    setDraggedSlot(null);
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
    const trimmedLabel = editingLabel.trim();
    if (trimmedLabel.length > 0) {
      // Call the parent callback to persist the label change
      onSlotLabelUpdate?.(slotId, trimmedLabel);
    }
    setEditingSlot(null);
    setEditingLabel('');
  };

  const startPoseEdit = (slotId: string) => {
    const slot = sequence.slots.find(s => s.id === slotId);
    if (slot) {
      setPoseString(poseToString(slot.pose));
      setEditingSlot(slot);
      setPoseEditMode(true);
    }
  };

  const savePoseEdit = (slotId: string) => {
    try {
      const editedPose = stringToPose(poseString);
      onSlotUpdate(slotId, editedPose);
      setPoseEditMode(false);
      setPoseString('');
    } catch (error) {
      console.error('Invalid pose string:', error);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getEasingLabel = (easing: EasingFunction) => {
    return easing.replace('-', ' ');
  };

  // Pose Viewer Component
  const PoseViewer = ({ pose, title, onClose, onEdit, slotId }: { 
    pose: Pose; 
    title: string; 
    onClose: () => void; 
    onEdit: (slotId: string) => void;
    slotId: string;
  }) => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
      <div className="bg-black/90 border border-white/20 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-2 mb-4">
          <div className="text-white/70 text-sm">Root Position:</div>
          <div className="text-white font-mono text-sm">
            x: {pose.root.x.toFixed(2)}, y: {pose.root.y.toFixed(2)}
          </div>
          
          <div className="text-white/70 text-sm mt-3">Joint Angles:</div>
          <div className="grid grid-cols-2 gap-2 text-white font-mono text-xs">
            <div>Body: {pose.bodyRotation.toFixed(1)}°</div>
            <div>Torso: {pose.torso.toFixed(1)}°</div>
            <div>Waist: {pose.waist.toFixed(1)}°</div>
            <div>Collar: {pose.collar.toFixed(1)}°</div>
            <div>Head: {pose.head.toFixed(1)}°</div>
            <div>L Shoulder: {pose.lShoulder.toFixed(1)}°</div>
            <div>L Forearm: {pose.lForearm.toFixed(1)}°</div>
            <div>L Wrist: {pose.lWrist.toFixed(1)}°</div>
            <div>R Shoulder: {pose.rShoulder.toFixed(1)}°</div>
            <div>R Forearm: {pose.rForearm.toFixed(1)}°</div>
            <div>R Wrist: {pose.rWrist.toFixed(1)}°</div>
            <div>L Thigh: {pose.lThigh.toFixed(1)}°</div>
            <div>L Calf: {pose.lCalf.toFixed(1)}°</div>
            <div>L Ankle: {pose.lAnkle.toFixed(1)}°</div>
            <div>R Thigh: {pose.rThigh.toFixed(1)}°</div>
            <div>R Calf: {pose.rCalf.toFixed(1)}°</div>
            <div>R Ankle: {pose.rAnkle.toFixed(1)}°</div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(slotId)}
            className="px-4 py-2 bg-accent-purple/30 border border-accent-purple text-white rounded hover:bg-accent-purple/50 transition-colors"
          >
            ✏️ Edit Pose
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(poseToString(pose))}
            className="px-4 py-2 bg-white/10 border border-white/20 text-white rounded hover:bg-white/20 transition-colors"
          >
            📋 Copy Pose String
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-lg p-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('animation')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'animation'
                ? 'text-accent-purple border-b-2 border-accent-purple'
                : 'text-white/50 hover:text-white'
            }`}
          >
            🎬 Animation
          </button>
          <button
            onClick={() => setActiveTab('poses')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'poses'
                ? 'text-accent-purple border-b-2 border-accent-purple'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Poses
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onCaptureSlot('A')}
            className="px-3 py-1 border rounded text-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20 transition-colors"
          >
            Capture A
          </button>
          <button
            onClick={() => onCaptureSlot('B')}
            className="px-3 py-1 border rounded text-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20 transition-colors"
          >
            Capture B
          </button>
          <button
            onClick={() => onCaptureSlot('C')}
            className="px-3 py-1 border rounded text-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20 transition-colors"
          >
            Capture C
          </button>
        </div>

        {/* Animation Tab */}
        {activeTab === 'animation' && (
          <div className="space-y-4">
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

            {/* Animation Settings */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <h4 className="text-white font-medium text-sm mb-3">Animation Settings</h4>
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
                <button
                  onClick={onAutoInterpolationToggle}
                  className={`px-3 py-2 border rounded transition-colors text-sm ${
                    autoInterpolation 
                      ? 'bg-accent-green/30 border-accent-green text-white' 
                      : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                  }`}
                >
                  🔄 Auto-Interp: {autoInterpolation ? 'ON' : 'OFF'}
                </button>
              </div>
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
              <h4 className="text-white font-medium text-sm">Timeline Slots</h4>
              {sequence.slots.map((slot, index) => (
                <div key={slot.id} className="space-y-1">
                  {/* Slot */}
                  <div
                    draggable
                    onDragStart={() => handleSlotDragStart(index)}
                    onDragOver={handleSlotDragOver}
                    onDrop={(e) => handleSlotDrop(e, index)}
                    onDragEnd={handleSlotDragEnd}
                    className={`flex items-center gap-2 p-2 bg-white/5 border rounded cursor-move transition-all ${
                      draggedSlot === index ? 'opacity-50 border-accent-purple' : 
                      selectedSlotId === slot.id ? 'border-accent-purple bg-accent-purple/10' : 
                      'border-white/10 hover:border-white/20'
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
                      Slot {index + 1} {selectedSlotId === slot.id && '(Viewing)'}
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
        )}

        {/* Poses Tab */}
        {activeTab === 'poses' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <h4 className="text-white font-medium text-sm mb-3">Pose Management</h4>
              <div className="space-y-2">
                {sequence.slots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className={`flex items-center gap-2 p-2 bg-white/5 border rounded transition-all cursor-pointer ${
                      selectedSlotId === slot.id 
                        ? 'border-accent-purple bg-accent-purple/10' 
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    onClick={() => onSlotClick(slot.id)}
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-accent-purple/30 border border-accent-purple text-white rounded text-xs font-bold flex items-center justify-center">
                      {slot.label || String.fromCharCode(65 + index)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="text-white text-xs font-medium">
                        Slot {index + 1}
                      </div>
                      <div className="text-white/50 text-xs">
                        {formatDuration(slot.durationToNext)} duration
                      </div>
                    </div>
                    
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startPoseEdit(slot.id);
                        }}
                        className="text-white/50 hover:text-white text-xs p-1"
                        title="Edit pose data"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlotUpdate(slot.id, currentPose);
                        }}
                        className="text-white/50 hover:text-white text-xs p-1"
                        title="Update from current pose"
                      >
                        Update
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (slot) {
                            navigator.clipboard.writeText(poseToString(slot.pose));
                          }
                        }}
                        className="text-white/50 hover:text-white text-xs p-1"
                        title="Copy pose string"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Pose Info */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <h4 className="text-white font-medium text-sm mb-3">Current Pose</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/70">Root Position:</span>
                  <span className="text-white font-mono">
                    x: {currentPose.root.x.toFixed(2)}, y: {currentPose.root.y.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Body Rotation:</span>
                  <span className="text-white font-mono">{currentPose.bodyRotation.toFixed(1)}°</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="text-center">
                    <div className="text-white/70 text-xs">Torso</div>
                    <div className="text-white font-mono">{currentPose.torso.toFixed(1)}°</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/70 text-xs">Waist</div>
                    <div className="text-white font-mono">{currentPose.waist.toFixed(1)}°</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/70 text-xs">Head</div>
                    <div className="text-white font-mono">{currentPose.head.toFixed(1)}°</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pose Viewer Modal */}
      {viewingPose && selectedSlotId && (
        <PoseViewer
          pose={viewingPose}
          title={`Viewing Pose: ${sequence.slots.find(s => s.id === selectedSlotId)?.label || 'Unknown'}`}
          onClose={onExitPoseView}
          onEdit={startPoseEdit}
          slotId={selectedSlotId}
        />
      )}

      {/* Pose Editor Modal */}
      {poseEditMode && editingSlot && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-black/90 border border-white/20 rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Edit Pose Data</h3>
              <button
                onClick={() => setPoseEditMode(false)}
                className="text-white/50 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            
            <textarea
              value={poseString}
              onChange={(e) => setPoseString(e.target.value)}
              className="w-full h-64 bg-white/10 border border-white/20 rounded p-2 text-white font-mono text-xs resize-none"
              placeholder="Paste pose string here..."
            />
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => savePoseEdit(editingSlot)}
                className="px-4 py-2 bg-accent-green/30 border border-accent-green text-white rounded hover:bg-accent-green/50 transition-colors"
              >
                💾 Save
              </button>
              <button
                onClick={() => setPoseEditMode(false)}
                className="px-4 py-2 bg-white/10 border border-white/20 text-white rounded hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
