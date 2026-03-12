import { Pose, EasingFunction, PartName, JointConstraint, AnchorName, Vector2D } from '../types';
import { interpolatePoses, solveFABRIK, getJointPositions } from './kinematics';

// ============================================================================
// PURE DATA LAYER - No UI dependencies
// ============================================================================

export interface AnimationFrame {
  id: string;
  timestamp: number;
  pose: Pose;
  metadata?: {
    label?: string;
    ease?: EasingFunction;
    duration?: number;
    notes?: string;
  };
}

export interface ActionGroup {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  frameIds: string[];
  color?: string;
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export interface AnimationClip {
  id: string;
  name: string;
  frames: AnimationFrame[];
  groups: ActionGroup[];
  totalDuration: number;
  loop: boolean;
  created: number;
  modified: number;
}

// ============================================================================
// PURE ANIMATION ENGINE - No React dependencies
// ============================================================================

export class AnimationEngine {
  
  /**
   * Pure pose interpolation - no UI dependencies
   */
  interpolatePose(from: Pose, to: Pose, progress: number, easing?: EasingFunction): Pose {
    const easedProgress = this.applyEasing(progress, easing || 'linear');
    return interpolatePoses(from, to, easedProgress);
  }

  /**
   * Timing calculation - no UI dependencies
   */
  calculateProgress(currentTime: number, clip: AnimationClip): number {
    if (clip.totalDuration === 0) return 0;
    
    const time = clip.loop 
      ? currentTime % clip.totalDuration 
      : Math.min(currentTime, clip.totalDuration);
    
    return time / clip.totalDuration;
  }

  /**
   * Frame resolution - no UI dependencies
   */
  getCurrentFrame(clip: AnimationClip, time: number): AnimationFrame | null {
    if (clip.frames.length === 0) return null;
    if (clip.frames.length === 1) return clip.frames[0];

    // Find surrounding frames
    let prevFrame = clip.frames[0];
    let nextFrame = clip.frames[clip.frames.length - 1];

    for (let i = 0; i < clip.frames.length - 1; i++) {
      if (time >= clip.frames[i].timestamp && time <= clip.frames[i + 1].timestamp) {
        prevFrame = clip.frames[i];
        nextFrame = clip.frames[i + 1];
        break;
      }
    }

    // Calculate interpolation progress
    const duration = nextFrame.timestamp - prevFrame.timestamp;
    const progress = duration > 0 ? (time - prevFrame.timestamp) / duration : 0;

    // Interpolate pose
    const interpolatedPose = this.interpolatePose(
      prevFrame.pose, 
      nextFrame.pose, 
      progress, 
      nextFrame.metadata?.ease
    );

    // Return interpolated frame
    return {
      id: `interpolated_${Date.now()}`,
      timestamp: time,
      pose: interpolatedPose,
      metadata: {
        ...prevFrame.metadata,
        label: `${prevFrame.metadata?.label || ''} → ${nextFrame.metadata?.label || ''}`
      }
    };
  }

  /**
   * Get action groups active at current time
   */
  getActiveGroups(clip: AnimationClip, time: number): ActionGroup[] {
    return clip.groups.filter(group => 
      time >= group.startTime && time <= group.endTime
    );
  }

  /**
   * Create action group from frame range
   */
  createActionGroup(
    clip: AnimationClip, 
    name: string, 
    startTime: number, 
    endTime: number,
    options?: { color?: string; description?: string; tags?: string[] }
  ): ActionGroup {
    const frameIds = clip.frames
      .filter(frame => frame.timestamp >= startTime && frame.timestamp <= endTime)
      .map(frame => frame.id);

    return {
      id: `group_${Date.now()}`,
      name,
      startTime,
      endTime,
      frameIds,
      color: options?.color,
      metadata: {
        description: options?.description,
        tags: options?.tags
      }
    };
  }

  /**
   * Apply easing function
   */
  private applyEasing(t: number, easing: EasingFunction): number {
    const easingFunctions = {
      linear: (t: number) => t,
      'ease-in': (t: number) => t * t,
      'ease-out': (t: number) => 1 - (1 - t) * (1 - t),
      'ease-in-out': (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      spring: (t: number) => {
        const spring = 4;
        const damping = 0.5;
        return 1 - Math.exp(-spring * t) * Math.cos(damping * t * Math.PI * 2);
      }
    };

    const func = easingFunctions[easing];
    return func ? func(t) : t;
  }
}

// ============================================================================
// UTILITIES - Pure functions
// ============================================================================

/**
 * Convert legacy PoseSlot to new AnimationFrame
 */
export function poseSlotToAnimationFrame(slot: any, timestamp: number): AnimationFrame {
  return {
    id: slot.id,
    timestamp,
    pose: slot.pose,
    metadata: {
      label: slot.label,
      ease: slot.easing,
      duration: slot.durationToNext
    }
  };
}

/**
 * Create empty animation clip
 */
export function createEmptyClip(name: string): AnimationClip {
  return {
    id: `clip_${Date.now()}`,
    name,
    frames: [],
    groups: [],
    totalDuration: 0,
    loop: false,
    created: Date.now(),
    modified: Date.now()
  };
}

/**
 * Add frame to clip
 */
export function addFrameToClip(clip: AnimationClip, pose: Pose, timestamp: number, metadata?: AnimationFrame['metadata']): AnimationClip {
  const newFrame: AnimationFrame = {
    id: `frame_${Date.now()}`,
    timestamp,
    pose,
    metadata
  };

  const frames = [...clip.frames, newFrame].sort((a, b) => a.timestamp - b.timestamp);
  
  return {
    ...clip,
    frames,
    totalDuration: Math.max(clip.totalDuration, timestamp),
    modified: Date.now()
  };
}
