import React, { useMemo } from 'react';
import { AnimationClip, ActionGroup, AnimationFrame } from '../utils/animationEngine';

// ============================================================================
// MINIMALIST TIMELINE COMPONENT
// ============================================================================

interface MinimalistTimelineProps {
  clip: AnimationClip | null;
  currentTime: number;
  isActive: boolean;
  onTimeChange: (time: number) => void;
  onGroupSelect?: (group: ActionGroup) => void;
  onFrameSelect?: (frame: AnimationFrame) => void;
  selectedGroupId?: string;
  selectedFrameId?: string;
  className?: string;
}

const MinimalistTimeline: React.FC<MinimalistTimelineProps> = ({
  clip,
  currentTime,
  isActive,
  onTimeChange,
  onGroupSelect,
  onFrameSelect,
  selectedGroupId,
  selectedFrameId,
  className = ''
}) => {
  // ============================================================================
  // CALCULATIONS - Pure data processing
  // ============================================================================

  const timelineData = useMemo(() => {
    if (!clip) return { groups: [], frames: [], duration: 0 };

    return {
      groups: clip.groups.map(group => ({
        ...group,
        leftPercent: (group.startTime / clip.totalDuration) * 100,
        widthPercent: ((group.endTime - group.startTime) / clip.totalDuration) * 100
      })),
      frames: clip.frames.map(frame => ({
        ...frame,
        leftPercent: (frame.timestamp / clip.totalDuration) * 100
      })),
      duration: clip.totalDuration
    };
  }, [clip]);

  const currentTimePercent = useMemo(() => {
    if (!clip || clip.totalDuration === 0) return 0;
    return (currentTime / clip.totalDuration) * 100;
  }, [clip, currentTime]);

  // ============================================================================
  // EVENT HANDLERS - Clean UI logic
  // ============================================================================

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clip) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = clickX / rect.width;
    const newTime = clickPercent * clip.totalDuration;

    onTimeChange(Math.max(0, Math.min(newTime, clip.totalDuration)));
  };

  const handleGroupClick = (e: React.MouseEvent, group: ActionGroup) => {
    e.stopPropagation();
    onGroupSelect?.(group);
  };

  const handleFrameClick = (e: React.MouseEvent, frame: AnimationFrame) => {
    e.stopPropagation();
    onFrameSelect?.(frame);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!clip) {
    return (
      <div className={`bg-mono-darker border border-white/10 rounded-lg p-4 text-center ${className}`}>
        <div className="text-white/40 text-sm">No animation clip loaded</div>
      </div>
    );
  }

  return (
    <div className={`bg-mono-darker border border-white/10 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent-green animate-pulse' : 'bg-white/30'}`} />
          <span className="text-white/70 text-sm font-mono">{clip.name}</span>
        </div>
        <div className="text-white/50 text-xs font-mono">
          {Math.floor(currentTime / 1000)}s / {Math.floor(clip.totalDuration / 1000)}s
        </div>
      </div>

      {/* Timeline Track */}
      <div 
        className="relative h-16 bg-black/40 border border-white/10 rounded cursor-pointer"
        onClick={handleTimelineClick}
      >
        {/* Action Groups */}
        {timelineData.groups.map(group => (
          <div
            key={group.id}
            className={`absolute top-2 h-12 rounded cursor-pointer transition-all duration-200 ${
              selectedGroupId === group.id 
                ? 'ring-2 ring-selection ring-offset-1 ring-offset-mono-darker' 
                : 'hover:ring-1 hover:ring-white/30'
            }`}
            style={{
              left: `${group.leftPercent}%`,
              width: `${group.widthPercent}%`,
              backgroundColor: group.color || 'rgba(168, 85, 247, 0.3)',
              border: `1px solid ${group.color || 'rgba(168, 85, 247, 0.6)'}`
            }}
            onClick={(e) => handleGroupClick(e, group)}
            title={`${group.name} (${Math.floor(group.startTime / 1000)}s - ${Math.floor(group.endTime / 1000)}s)`}
          >
            <div className="h-full flex items-center justify-center">
              <span className="text-white/80 text-xs font-mono truncate px-1">
                {group.name}
              </span>
            </div>
          </div>
        ))}

        {/* Frame Markers */}
        {timelineData.frames.map(frame => (
          <div
            key={frame.id}
            className={`absolute top-0 bottom-0 w-0.5 cursor-pointer transition-all duration-200 ${
              selectedFrameId === frame.id 
                ? 'bg-selection' 
                : 'bg-white/40 hover:bg-white/60'
            }`}
            style={{ left: `${frame.leftPercent}%` }}
            onClick={(e) => handleFrameClick(e, frame)}
            title={`${frame.metadata?.label || 'Frame'} @ ${Math.floor(frame.timestamp / 1000)}s`}
          >
            {/* Frame label */}
            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-white/60 font-mono whitespace-nowrap">
              {frame.metadata?.label}
            </div>
          </div>
        ))}

        {/* Current Time Indicator */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-accent-green shadow-lg shadow-accent-green/50"
          style={{ left: `${currentTimePercent}%` }}
        >
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-accent-green rounded-full" />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between text-xs text-white/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-accent-green rounded-full" />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-white/40 rounded-full" />
            <span>Frames</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-purple-500/60 rounded-full" />
            <span>Groups</span>
          </div>
        </div>
        
        {timelineData.groups.length > 0 && (
          <div className="text-white/60">
            {timelineData.groups.length} group{timelineData.groups.length !== 1 ? 's' : ''}, {timelineData.frames.length} frame{timelineData.frames.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default MinimalistTimeline;
