import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Pose } from '../types';
import { AnimationEngine, AnimationClip, AnimationFrame, ActionGroup, createEmptyClip, addFrameToClip } from '../utils/animationEngine';

// ============================================================================
// STATE MANAGEMENT - Clean handshake between engine and React
// ============================================================================

export interface AnimationState {
  currentClip: AnimationClip | null;
  currentTime: number;
  isActive: boolean;
  currentFrame: AnimationFrame | null;
  activeGroups: ActionGroup[];
  playbackSpeed: number;
  isLooping: boolean;
}

export interface AnimationActions {
  // Clip management
  createClip: (name: string) => void;
  loadClip: (clip: AnimationClip) => void;
  addFrame: (pose: Pose, timestamp?: number, metadata?: AnimationFrame['metadata']) => void;
  
  // Playback control
  play: () => void;
  pause: () => void;
  stop: () => void;
  setTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  toggleLoop: () => void;
  
  // Group management
  createGroup: (name: string, startTime: number, endTime: number, options?: { color?: string; description?: string; tags?: string[] }) => void;
  updateGroup: (groupId: string, updates: Partial<ActionGroup>) => void;
  deleteGroup: (groupId: string) => void;
  
  // Frame management
  updateFrame: (frameId: string, pose: Pose) => void;
  deleteFrame: (frameId: string) => void;
  
  // Cleanup
  cleanup: () => void;
}

const initialState: AnimationState = {
  currentClip: null,
  currentTime: 0,
  isActive: false,
  currentFrame: null,
  activeGroups: [],
  playbackSpeed: 1.0,
  isLooping: false,
};

export const useAnimation = (initialPose?: Pose): [AnimationState, AnimationActions] => {
  const animationFrameId = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  
  // Pure engine instance - no UI dependencies
  const engine = useMemo(() => new AnimationEngine(), []);
  
  // React state - UI only
  const [state, setState] = useState<AnimationState>(initialState);

  // ============================================================================
  // CLEAN HANDSHAKE FUNCTIONS
  // ============================================================================

  // Update current frame based on time - pure engine call
  const updateCurrentFrame = useCallback((time: number) => {
    if (!state.currentClip) return;

    const frame = engine.getCurrentFrame(state.currentClip, time);
    const groups = engine.getActiveGroups(state.currentClip, time);

    setState(prev => ({
      ...prev,
      currentFrame: frame,
      currentTime: time,
      activeGroups: groups
    }));
  }, [state.currentClip, engine]);

  // Animation loop - pure timing logic
  const animate = useCallback(() => {
    if (!state.isActive || !state.currentClip) return;

    const elapsed = (performance.now() - startTimeRef.current + pausedTimeRef.current) * state.playbackSpeed;
    const time = state.isLooping ? elapsed % state.currentClip.totalDuration : Math.min(elapsed, state.currentClip.totalDuration);

    updateCurrentFrame(time);

    if (!state.isLooping && elapsed >= state.currentClip.totalDuration) {
      pause();
    } else {
      animationFrameId.current = requestAnimationFrame(animate);
    }
  }, [state.isActive, state.currentClip, state.isLooping, state.playbackSpeed, updateCurrentFrame]);

  // ============================================================================
  // CLIP MANAGEMENT
  // ============================================================================

  const createClip = useCallback((name: string) => {
    const clip = createEmptyClip(name);
    setState(prev => ({ ...prev, currentClip: clip }));
  }, []);

  const loadClip = useCallback((clip: AnimationClip) => {
    setState(prev => ({
      ...prev,
      currentClip: clip,
      currentTime: 0,
      currentFrame: null,
      activeGroups: []
    }));
    pausedTimeRef.current = 0;
  }, []);

  const addFrame = useCallback((pose: Pose, timestamp?: number, metadata?: AnimationFrame['metadata']) => {
    if (!state.currentClip) return;

    const targetTime = timestamp ?? (state.currentClip.totalDuration + 1000);
    const updatedClip = addFrameToClip(state.currentClip, pose, targetTime, metadata);
    
    setState(prev => ({ ...prev, currentClip: updatedClip }));
    
    // Update current frame if we're at or past the new frame
    if (state.currentTime >= targetTime) {
      updateCurrentFrame(state.currentTime);
    }
  }, [state.currentClip, state.currentTime, updateCurrentFrame]);

  // ============================================================================
  // PLAYBACK CONTROL
  // ============================================================================

  const play = useCallback(() => {
    if (!state.currentClip || state.currentClip.frames.length < 2) return;

    setState(prev => ({ ...prev, isActive: true }));
    startTimeRef.current = performance.now() - pausedTimeRef.current;
  }, [state.currentClip]);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isActive: false }));
    pausedTimeRef.current = state.currentTime * 1000 / state.playbackSpeed;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, [state.currentTime, state.playbackSpeed]);

  const stop = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      isActive: false, 
      currentTime: 0, 
      currentFrame: null, 
      activeGroups: [] 
    }));
    pausedTimeRef.current = 0;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  const setTime = useCallback((time: number) => {
    updateCurrentFrame(time);
    pausedTimeRef.current = time * 1000 / state.playbackSpeed;
  }, [updateCurrentFrame, state.playbackSpeed]);

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, playbackSpeed: Math.max(0.1, Math.min(5, speed)) }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState(prev => ({ ...prev, isLooping: !prev.isLooping }));
  }, []);

  // ============================================================================
  // GROUP MANAGEMENT
  // ============================================================================

  const createGroup = useCallback((
    name: string, 
    startTime: number, 
    endTime: number, 
    options?: { color?: string; description?: string; tags?: string[] }
  ) => {
    if (!state.currentClip) return;

    const group = engine.createActionGroup(state.currentClip, name, startTime, endTime, options);
    const updatedClip = {
      ...state.currentClip,
      groups: [...state.currentClip.groups, group]
    };

    setState(prev => ({ ...prev, currentClip: updatedClip }));
  }, [state.currentClip, engine]);

  const updateGroup = useCallback((groupId: string, updates: Partial<ActionGroup>) => {
    if (!state.currentClip) return;

    const updatedGroups = state.currentClip.groups.map(group =>
      group.id === groupId ? { ...group, ...updates } : group
    );

    setState(prev => ({ 
      ...prev, 
      currentClip: { ...prev.currentClip!, groups: updatedGroups }
    }));
  }, [state.currentClip]);

  const deleteGroup = useCallback((groupId: string) => {
    if (!state.currentClip) return;

    const updatedGroups = state.currentClip.groups.filter(group => group.id !== groupId);

    setState(prev => ({ 
      ...prev, 
      currentClip: { ...prev.currentClip!, groups: updatedGroups }
    }));
  }, [state.currentClip]);

  // ============================================================================
  // FRAME MANAGEMENT
  // ============================================================================

  const updateFrame = useCallback((frameId: string, pose: Pose) => {
    if (!state.currentClip) return;

    const updatedFrames = state.currentClip.frames.map(frame =>
      frame.id === frameId ? { ...frame, pose } : frame
    );

    setState(prev => ({ 
      ...prev, 
      currentClip: { ...prev.currentClip!, frames: updatedFrames }
    }));

    // Update current frame if it's the one being modified
    if (state.currentFrame?.id === frameId) {
      updateCurrentFrame(state.currentTime);
    }
  }, [state.currentClip, state.currentFrame, state.currentTime, updateCurrentFrame]);

  const deleteFrame = useCallback((frameId: string) => {
    if (!state.currentClip) return;

    const updatedFrames = state.currentClip.frames.filter(frame => frame.id !== frameId);
    
    setState(prev => ({ 
      ...prev, 
      currentClip: { ...prev.currentClip!, frames: updatedFrames }
    }));
  }, [state.currentClip]);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  const cleanup = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Animation loop effect
  useEffect(() => {
    if (state.isActive && state.currentClip) {
      animationFrameId.current = requestAnimationFrame(animate);
    }

    return cleanup;
  }, [state.isActive, state.currentClip, animate, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // ============================================================================
  // RETURN CLEAN HANDSHAKE
  // ============================================================================

  const actions: AnimationActions = {
    createClip,
    loadClip,
    addFrame,
    play,
    pause,
    stop,
    setTime,
    setSpeed,
    toggleLoop,
    createGroup,
    updateGroup,
    deleteGroup,
    updateFrame,
    deleteFrame,
    cleanup
  };

  return [state, actions];
};
