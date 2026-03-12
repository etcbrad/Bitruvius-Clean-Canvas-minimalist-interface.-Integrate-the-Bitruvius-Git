import { Pose, PoseSlot, SequenceState, EasingFunction, PartName, JointConstraint, AnchorName, Vector2D } from '../types';
import { interpolatePoses, solveFABRIK, getJointPositions } from './kinematics';

// Easing function implementations
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

export const applyEasing = (t: number, easing: EasingFunction): number => {
  const func = easingFunctions[easing];
  return func ? func(t) : t;
};

// Smooth transition function with configurable smoothness
export const smoothTransition = (t: number, smoothness: number): number => {
  const smoothed = t < 0.5 
    ? smoothness * t * t / 0.5 
    : 1 - smoothness * (1 - t) * (1 - t) / 0.5;
  return smoothed;
};

// IK-assisted pose interpolation for more natural transitions
export const interpolatePosesWithIK = (
  startPose: Pose, 
  endPose: Pose, 
  t: number, 
  ikAssisted: boolean = false,
  ikStrength: number = 0.5,
  jointModes: Record<PartName, JointConstraint> = {} as Record<PartName, JointConstraint>,
  activePins: AnchorName[] = []
): Pose => {
  // Start with basic interpolation
  let interpolated = interpolatePoses(startPose, endPose, t);
  
  if (!ikAssisted || ikStrength <= 0) {
    return interpolated;
  }
  
  // Apply IK assistance to limb endpoints for more natural motion
  const limbs: Array<'rArm' | 'lArm' | 'rLeg' | 'lLeg'> = ['rArm', 'lArm', 'rLeg', 'lLeg'];
  const limbEndpoints: Record<string, PartName> = {
    'rArm': PartName.RWrist,
    'lArm': PartName.LWrist,
    'rLeg': PartName.RAnkle,
    'lLeg': PartName.LAnkle
  };
  
  for (const limbName of limbs) {
    const endpoint = limbEndpoints[limbName];
    if (!endpoint) continue;
    
    // Get target position from end pose
    const endJoints = getJointPositions(endPose, activePins);
    const targetPos = endJoints[endpoint];
    
    if (!targetPos) continue;
    
    // Apply IK to find a more natural path
    try {
      const ikPose = solveFABRIK(interpolated, limbName, targetPos, jointModes, activePins, 5, 0.5);
      
      // Blend IK result with interpolated result
      const blend = ikStrength * t; // Stronger IK influence as we progress
      interpolated = interpolatePoses(interpolated, ikPose, blend);
    } catch (error) {
      // Fallback to basic interpolation if IK fails
      console.warn(`IK assistance failed for ${limbName}:`, error);
    }
  }
  
  return interpolated;
};

// Enhanced sequence engine function with all new features
export const getPoseAtTime = (sequence: SequenceState, timeMs: number): Pose => {
  if (sequence.slots.length === 0) {
    throw new Error('Sequence has no slots');
  }
  
  if (sequence.slots.length === 1) {
    return sequence.slots[0].pose;
  }

  const totalDuration = sequence.slots.slice(0, -1).reduce((sum, slot) => sum + slot.durationToNext, 0);
  
  if (totalDuration === 0) {
    return sequence.slots[0].pose;
  }

  const adjustedTime = sequence.loop ? timeMs % totalDuration : Math.min(timeMs, totalDuration);
  
  let elapsed = 0;
  for (let i = 0; i < sequence.slots.length - 1; i++) {
    const currentSlot = sequence.slots[i];
    const nextSlot = sequence.slots[i + 1];
    const segmentDuration = currentSlot.durationToNext;
    
    if (adjustedTime <= elapsed + segmentDuration) {
      let localT = (adjustedTime - elapsed) / segmentDuration;
      
      // Apply easing if enabled
      if (sequence.easingEnabled) {
        localT = applyEasing(localT, currentSlot.easing);
      }
      
      // Apply smooth transitions if enabled
      if (sequence.smoothTransitions) {
        localT = smoothTransition(localT, 0.8); // Default smoothness
      }
      
      // Apply IK assistance if enabled
      if (sequence.ikAssisted) {
        return interpolatePosesWithIK(
          currentSlot.pose, 
          nextSlot.pose, 
          localT, 
          true, 
          0.7 // Default IK strength
        );
      }
      
      return interpolatePoses(currentSlot.pose, nextSlot.pose, localT);
    }
    elapsed += segmentDuration;
  }
  
  return sequence.slots[sequence.slots.length - 1].pose;
};

// Convert scrub position (0-1) to time in milliseconds
export const scrubPositionToTime = (sequence: SequenceState, scrubPosition: number): number => {
  if (sequence.slots.length <= 1) return 0;
  
  const totalDuration = sequence.slots.slice(0, -1).reduce((sum, slot) => sum + slot.durationToNext, 0);
  return scrubPosition * totalDuration;
};

// Convert time in milliseconds to scrub position (0-1)
export const timeToScrubPosition = (sequence: SequenceState, timeMs: number): number => {
  if (sequence.slots.length <= 1) return 0;
  
  const totalDuration = sequence.slots.slice(0, -1).reduce((sum, slot) => sum + slot.durationToNext, 0);
  return totalDuration > 0 ? Math.min(1, Math.max(0, timeMs / totalDuration)) : 0;
};

// Get current pose based on scrub position
export const getPoseAtScrubPosition = (sequence: SequenceState, scrubPosition: number): Pose => {
  const timeMs = scrubPositionToTime(sequence, scrubPosition);
  return getPoseAtTime(sequence, timeMs);
};

// Create a new pose slot with auto-generated label
export const createPoseSlot = (pose: Pose, durationToNext: number = 1000, easing: EasingFunction = 'linear'): PoseSlot => {
  const id = Math.random().toString(36).substr(2, 9);
  return {
    id,
    label: '', // Will be set by the sequence manager
    pose,
    durationToNext,
    easing,
    autoGenerated: false
  };
};

// Initialize sequence with AB mode (2 slots)
export const createABSequence = (poseA: Pose, poseB: Pose): SequenceState => {
  const slotA = createPoseSlot(poseA, 1000, 'ease-in-out');
  const slotB = createPoseSlot(poseB, 0, 'linear'); // Last slot duration doesn't matter
  
  slotA.label = 'A';
  slotB.label = 'B';
  
  return {
    slots: [slotA, slotB],
    loop: false,
    isPlaying: false,
    scrubPosition: 0,
    currentTimeMs: 0,
    easingEnabled: true,
    smoothTransitions: true,
    ikAssisted: false
  };
};

// Add a new slot to sequence
export const addSlot = (sequence: SequenceState, pose: Pose, index?: number): SequenceState => {
  const newSlot = createPoseSlot(pose);
  const slotLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const usedLabels = sequence.slots.map(s => s.label).filter(Boolean);
  const nextLabel = slotLabels.split('').find(label => !usedLabels.includes(label)) || '';
  newSlot.label = nextLabel;
  
  const newSlots = [...sequence.slots];
  if (index !== undefined && index >= 0 && index <= newSlots.length) {
    newSlots.splice(index, 0, newSlot);
  } else {
    newSlots.push(newSlot);
  }
  
  return { ...sequence, slots: newSlots };
};

// Remove a slot from sequence
export const removeSlot = (sequence: SequenceState, slotId: string): SequenceState => {
  return { ...sequence, slots: sequence.slots.filter(s => s.id !== slotId) };
};

// Update a slot's pose
export const updateSlot = (sequence: SequenceState, slotId: string, pose: Pose): SequenceState => {
  return {
    ...sequence,
    slots: sequence.slots.map(slot => 
      slot.id === slotId ? { ...slot, pose } : slot
    )
  };
};

// Reorder slots
export const reorderSlots = (sequence: SequenceState, fromIndex: number, toIndex: number): SequenceState => {
  const newSlots = [...sequence.slots];
  const [movedSlot] = newSlots.splice(fromIndex, 1);
  newSlots.splice(toIndex, 0, movedSlot);
  return { ...sequence, slots: newSlots };
};

// Update slot transition settings
export const updateSlotTransition = (sequence: SequenceState, slotId: string, durationToNext: number, easing: EasingFunction): SequenceState => {
  return {
    ...sequence,
    slots: sequence.slots.map(slot => 
      slot.id === slotId ? { ...slot, durationToNext, easing } : slot
    )
  };
};

// Update a slot's label
export const updateSlotLabel = (sequence: SequenceState, slotId: string, label: string): SequenceState => {
  return {
    ...sequence,
    slots: sequence.slots.map(slot =>
      slot.id === slotId ? { ...slot, label } : slot
    )
  };
};
