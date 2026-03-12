import { Pose, PoseSlot, SequenceState, EasingFunction, PartName, JointConstraint, AnchorName, Vector2D } from '../types';
import { interpolatePoses, solveFABRIK, getJointPositions, lerp } from './kinematics';
import { logWarning, logError, safeExecute } from './errorHandling';

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
  jointModes: Partial<Record<PartName, JointConstraint>> = {},
  activePins: AnchorName[] = []
): Pose => {
  // Runtime validation for type safety
  const safeJointModes = Object.values(PartName).reduce((acc, part) => {
    acc[part] = jointModes[part] || 'fk';
    return acc;
  }, {} as Record<PartName, JointConstraint>);

  const safeActivePins: AnchorName[] = Array.isArray(activePins) 
    ? activePins.filter(pin => 
        Object.values(PartName).includes(pin as PartName) || 
        ['root', 'lFootTip', 'rFootTip', 'lHandTip', 'rHandTip'].includes(pin)
      )
    : [];

  // Validate inputs
  if (!startPose || !endPose) {
    logWarning('Invalid poses provided to interpolatePosesWithIK', {
      operation: 'interpolatePosesWithIK',
      additionalInfo: { startPose: !!startPose, endPose: !!endPose, t }
    });
    return endPose || startPose || {
      root: { x: 0, y: 0 },
      bodyRotation: 0,
      torso: 0,
      waist: 0,
      collar: 0,
      head: 0,
      lShoulder: 0,
      lForearm: 0,
      lWrist: 0,
      rShoulder: 0,
      rForearm: 0,
      rWrist: 0,
      lThigh: 0,
      lCalf: 0,
      lAnkle: 0,
      rThigh: 0,
      rCalf: 0,
      rAnkle: 0
    };
  }

  if (t < 0 || t > 1) {
    logWarning('Invalid interpolation parameter t', {
      operation: 'interpolatePosesWithIK',
      additionalInfo: { t, clampedTo: Math.max(0, Math.min(1, t)) }
    });
    t = Math.max(0, Math.min(1, t)); // Clamp to valid range
  }
  
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
  
  let ikSuccessCount = 0;
  let ikTotalCount = 0;
  
  for (const limbName of limbs) {
    const endpoint = limbEndpoints[limbName];
    if (!endpoint) continue;
    
    ikTotalCount++;
    
    try {
      // Get target position from end pose
      const endJoints = getJointPositions(endPose, safeActivePins);
      const targetPos = endJoints[endpoint];
      
      if (!targetPos) {
        console.warn(`No joint position found for ${endpoint}`);
        continue;
      }
      
      // Validate target position
      if (!Number.isFinite(targetPos.x) || !Number.isFinite(targetPos.y)) {
        console.warn(`Invalid target position for ${endpoint}:`, targetPos);
        continue;
      }
      
      // Apply IK to find a more natural path
      const ikPose = solveFABRIK(interpolated, limbName, targetPos, safeJointModes, safeActivePins, 5, 0.5);
      
      // Validate IK result
      if (!ikPose || typeof ikPose !== 'object') {
        console.warn(`Invalid IK result for ${limbName}`);
        continue;
      }
      
      // Blend IK result with interpolated result
      const blend = ikStrength * t; // Stronger IK influence as we progress
      
      // Create a safe blended pose
      const blendedPose: Pose = { ...interpolated };
      for (const [key, value] of Object.entries(ikPose)) {
        if (key in interpolated && typeof value === 'number' && typeof (interpolated as any)[key] === 'number') {
          const startValue = (interpolated as any)[key] as number;
          const endValue = value as number;
          blendedPose[key as keyof Pose] = lerp(startValue, endValue, blend) as any;
        }
      }
      
      interpolated = blendedPose;
      ikSuccessCount++;
      
    } catch (error) {
      console.warn(`IK assistance failed for ${limbName}:`, error);
      // Continue with basic interpolation for this limb
    }
  }
  
  // Log IK performance for debugging
  if (ikTotalCount > 0) {
    const successRate = (ikSuccessCount / ikTotalCount) * 100;
    if (successRate < 50) {
      console.warn(`Low IK success rate: ${successRate.toFixed(1)}% (${ikSuccessCount}/${ikTotalCount})`);
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

    if (segmentDuration <= 0) {
      if (adjustedTime <= elapsed) {
        return nextSlot.pose;
      }
      continue;
    }
    
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
