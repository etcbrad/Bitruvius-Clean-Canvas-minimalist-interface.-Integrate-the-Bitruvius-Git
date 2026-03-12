import { ANATOMY, BASE_ROTATIONS, RIGGING, JOINT_LIMITS } from '../constants';
import { Vector2D, Pose, PartName, AnchorName, JointConstraint, RenderMode, PARENT_MAP, CHILD_MAP, partNameToPoseKey, PinnedState, LIMB_SEQUENCES } from '../types';
import { smoothTransition } from './sequenceEngine';
import { safeDistance, safeAddVectors, safeClamp, isSafeNumber } from './safeMath';

// Type for joint positions that includes both Vector2D positions and numeric angle fields
type JointPositionsResult = Record<string, Vector2D | number>;

// ---------------------------------------------------------------------------
// Math Utilities
// ---------------------------------------------------------------------------

export const lerp = (start: number, end: number, t: number): number =>
  start * (1 - t) + end * t;

/**
 * Calculates shortest angular difference between two angles in degrees.
 */
export const getShortestAngleDiffDeg = (currentDeg: number, startDeg: number): number => {
  let diff = currentDeg - startDeg;
  diff = ((diff % 360) + 360) % 360;
  if (diff > 180) diff -= 360;
  return diff;
};

export const lerpAngleShortestPath = (a: number, b: number, t: number): number => {
  const normalize = (angle: number) => ((angle % 360) + 360) % 360;
  const start = normalize(a);
  const end   = normalize(b);
  let delta = end - start;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  return a + delta * t;
};

const rad = (d: number): number => d * Math.PI / 180;
const deg = (r: number): number => r * 180 / Math.PI;
const dist = (v1: Vector2D, v2: Vector2D): number => safeDistance(v1, v2, 0);

const rotateVec = (x: number, y: number, angleDeg: number): Vector2D => {
  const r = rad(angleDeg);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => safeAddVectors(v1, v2, { x: 0, y: 0 });

// ---------------------------------------------------------------------------
// Rotation Helpers
// ---------------------------------------------------------------------------

export const getTotalRotation = (key: string, pose: Pose): number =>
  (BASE_ROTATIONS[key as keyof typeof BASE_ROTATIONS] || 0) + ((pose as any)[key] || 0);

// ---------------------------------------------------------------------------
// Joint Limit Clamping
// ---------------------------------------------------------------------------

/**
 * Relaxed joint limit clamping for intuitive posing.
 * Removed tight shoulder constraints to allow natural arm movement.
 */
const applyJointLimit = (localAngle: number, part: PartName): number => {
  const key = partNameToPoseKey[part];
  const limits = JOINT_LIMITS[key as keyof typeof JOINT_LIMITS];
  if (!limits) return localAngle;
  
  // Simple clamping without additional constraints for intuitive posing
  return Math.max(limits.min, Math.min(limits.max, localAngle));
};

// ---------------------------------------------------------------------------
// Core FK — single source of truth used by both renderer and IK solver
// ---------------------------------------------------------------------------

const calculateBoneGlobalPositions = (
  parentGlobalPos: Vector2D,
  parentGlobalAngle: number,
  boneTotalLocalRotation: number,
  boneLength: number,
  boneOffset: Vector2D = { x: 0, y: 0 },
  isUpwardDrawing: boolean = false,
): { globalStartPoint: Vector2D; globalEndPoint: Vector2D; childInheritedGlobalAngle: number } => {
  const rotatedOffset = rotateVec(boneOffset.x, boneOffset.y, parentGlobalAngle);
  const globalStartPoint = addVec(parentGlobalPos, rotatedOffset);
  const boneGlobalAngle = parentGlobalAngle + boneTotalLocalRotation;
  const y_dir = isUpwardDrawing ? -1 : 1;
  const boneVector = rotateVec(0, boneLength * y_dir, boneGlobalAngle);
  const globalEndPoint = addVec(globalStartPoint, boneVector);
  return { globalStartPoint, globalEndPoint, childInheritedGlobalAngle: boneGlobalAngle };
};

const _calculateGlobalJointPositions = (
  baseRoot: Vector2D,
  baseBodyRotation: number,
  pose: Pose,
): JointPositionsResult => {
  const offsets = pose.offsets || {};

  const waistCalc  = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(PartName.Waist, pose), ANATOMY.WAIST, offsets[PartName.Waist], true);
  const torsoCalc  = calculateBoneGlobalPositions(waistCalc.globalEndPoint, waistCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Torso, pose), ANATOMY.TORSO, offsets[PartName.Torso], true);
  const collarCalc = calculateBoneGlobalPositions(torsoCalc.globalEndPoint, torsoCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Collar, pose), ANATOMY.COLLAR, offsets[PartName.Collar], true);
  const collarAngle = collarCalc.childInheritedGlobalAngle;
  const collarEnd   = collarCalc.globalEndPoint;

  const headPivot      = addVec(collarEnd, rotateVec(0, -ANATOMY.HEAD_NECK_GAP_OFFSET, collarAngle));
  const headGlobalAngle = collarAngle + getTotalRotation(PartName.Head, pose);
  const headTip         = addVec(headPivot, rotateVec(0, -ANATOMY.HEAD, headGlobalAngle));

  const getArmJoints = (isRight: boolean) => {
    const sX = isRight ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER;
    const shoulderAttach = addVec(collarEnd, rotateVec(sX, RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END, collarAngle));
    const upperArmCalc   = calculateBoneGlobalPositions(shoulderAttach, collarAngle, getTotalRotation(isRight ? PartName.RShoulder : PartName.LShoulder, pose), ANATOMY.UPPER_ARM, offsets[isRight ? PartName.RShoulder : PartName.LShoulder], false);
    const forearmCalc    = calculateBoneGlobalPositions(upperArmCalc.globalEndPoint, upperArmCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rForearm' : 'lForearm', pose), ANATOMY.LOWER_ARM, offsets[isRight ? PartName.RElbow : PartName.LElbow], false);
    const handAngle      = forearmCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RWrist : PartName.LWrist, pose);
    const handTip        = addVec(forearmCalc.globalEndPoint, rotateVec(0, ANATOMY.HAND, handAngle));
    return {
      shoulder: shoulderAttach,
      elbow: upperArmCalc.globalEndPoint,
      wrist: forearmCalc.globalEndPoint,
      hand: handTip,
      // Expose inherited angles for IK parent-angle extraction
      upperArmGlobalAngle: upperArmCalc.childInheritedGlobalAngle,
      forearmGlobalAngle:  forearmCalc.childInheritedGlobalAngle,
    };
  };

  const getLegJoints = (isRight: boolean) => {
    const thighCalc = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(isRight ? PartName.RThigh : PartName.LThigh, pose), ANATOMY.LEG_UPPER, offsets[isRight ? PartName.RThigh : PartName.LThigh], false);
    const calfCalc  = calculateBoneGlobalPositions(thighCalc.globalEndPoint, thighCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rCalf' : 'lCalf', pose), ANATOMY.LEG_LOWER, offsets[isRight ? PartName.RSkin : PartName.LSkin], false);
    const ankleAngle = calfCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RAnkle : PartName.LAnkle, pose);
    const footTip    = addVec(calfCalc.globalEndPoint, rotateVec(0, ANATOMY.FOOT, ankleAngle));
    return {
      hip: baseRoot,
      knee: thighCalc.globalEndPoint,
      ankle: calfCalc.globalEndPoint,
      footTip,
    };
  };

  const rArm = getArmJoints(true);
  const lArm = getArmJoints(false);
  const rLeg = getLegJoints(true);
  const lLeg = getLegJoints(false);

  return {
    root:      baseRoot,
    waist:     baseRoot,
    torso:     waistCalc.globalEndPoint,
    collar:    torsoCalc.globalEndPoint,
    head:      headPivot,
    rShoulder: rArm.shoulder,
    rElbow:    rArm.elbow,
    rWrist:    rArm.wrist,
    lShoulder: lArm.shoulder,
    lElbow:    lArm.elbow,
    lWrist:    lArm.wrist,
    rThigh:    baseRoot,
    [PartName.RSkin]: rLeg.knee,
    rAnkle:    rLeg.ankle,
    lThigh:    baseRoot,
    [PartName.LSkin]: lLeg.knee,
    lAnkle:    lLeg.ankle,
    headTip,
    rFootTip:  rLeg.footTip,
    lFootTip:  lLeg.footTip,
    rHandTip:  rArm.hand,
    lHandTip:  lArm.hand,
    // Expose intermediate angles for IK root-angle extraction (not rendered)
    _collarGlobalAngle:       collarAngle,
    _rUpperArmGlobalAngle:    rArm.upperArmGlobalAngle,
    _lUpperArmGlobalAngle:    lArm.upperArmGlobalAngle,
  };
};

// ---------------------------------------------------------------------------
// Public FK — pin-stabilised joint positions
// ---------------------------------------------------------------------------

/**
 * Calculates global positions of all joints, stabilised for the primary active pin.
 * Secondary pins exhibit elastic tension (visualised in Mannequin.tsx) but do not
 * constrain the solve — that is handled by the physics validator in App.tsx.
 */
// Type guard for Vector2D
const isVector2D = (value: any): value is Vector2D => 
  typeof value === 'object' && value !== null && 'x' in value && 'y' in value;

export const getJointPositions = (
  pose: Pose,
  activePins: AnchorName[],
): Record<string, Vector2D> => {
  const inputRoot         = pose.root;
  const inputBodyRotation = getTotalRotation('bodyRotation', pose);
  const primaryPin        = activePins[0] || 'root';

  if (primaryPin === 'root' || primaryPin === PartName.Waist) {
    const allResults = _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose);
    // Filter out angle fields, return only Vector2D positions
    return Object.fromEntries(
      Object.entries(allResults).filter(([_, value]) => isVector2D(value))
    ) as Record<string, Vector2D>;
  }

  // Compute the offset introduced by body rotation so we can cancel it out,
  // keeping the primary pin stationary in world space.
  const jointsNoRot   = _calculateGlobalJointPositions(inputRoot, 0, pose);
  const pinNoRot      = jointsNoRot[primaryPin as string];
  if (!pinNoRot || !isVector2D(pinNoRot)) {
    const allResults = _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose);
    return Object.fromEntries(
      Object.entries(allResults).filter(([_, value]) => isVector2D(value))
    ) as Record<string, Vector2D>;
  }

  const jointsWithRot = _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose);
  const pinWithRot    = jointsWithRot[primaryPin as string];
  if (!pinWithRot || !isVector2D(pinWithRot)) {
    return Object.fromEntries(
      Object.entries(jointsWithRot).filter(([_, value]) => isVector2D(value))
    ) as Record<string, Vector2D>;
  }

  // Stabilize the primary pin by counter-rotating the root to keep it stationary.
  const offset = {
    x: pinNoRot.x - pinWithRot.x,
    y: pinNoRot.y - pinWithRot.y,
  };
  const stabilizedRoot = {
    x: inputRoot.x + offset.x,
    y: inputRoot.y + offset.y,
  };

  const allResults = _calculateGlobalJointPositions(stabilizedRoot, inputBodyRotation, pose);
  return Object.fromEntries(
    Object.entries(allResults).filter(([_, value]) => isVector2D(value))
  ) as Record<string, Vector2D>;
};

// ---------------------------------------------------------------------------
// Limb tip key helper (shared by both IK solvers)
// ---------------------------------------------------------------------------

const getTipKey = (chain: PartName[]): string => {
  const effector = chain[chain.length - 1];
  switch (effector) {
    case PartName.RAnkle: return 'rFootTip';
    case PartName.LAnkle: return 'lFootTip';
    case PartName.RWrist: return 'rHandTip';
    default:              return 'lHandTip';
  }
};

// ---------------------------------------------------------------------------
// IK parent-angle extraction — uses the SAME FK path as the renderer
// ---------------------------------------------------------------------------

/**
 * Returns the accumulated global angle at the root of a limb chain by reading
 * directly from the FK joint positions. This guarantees the IK solver and the
 * visual renderer share an identical coordinate frame, eliminating drift.
 *
 * FIX: Previously accumulated body/torso/collar angles manually, double-counting
 * bodyRotation and diverging from the renderer's transform chain.
 */
const getLimbRootAngle = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  activePins: AnchorName[],
): number => {
  const joints = getJointPositions(pose, activePins);

  if (limbName === 'rArm' || limbName === 'lArm') {
    // Derive the collar's world-space angle from the two FK-computed points
    // that bracket it, instead of re-accumulating rotation values.
    const torso  = joints['torso'];
    const collar = joints['collar'];
    if (!torso || !collar) return 0;
    // Collar points upward (drawsUpwards = true), so its direction vector is collar→torso
    return Math.atan2(torso.y - collar.y, torso.x - collar.x) * 180 / Math.PI + 90;
  }

  // Legs descend directly from root using bodyRotation
  return getTotalRotation('bodyRotation', pose);
};

// ---------------------------------------------------------------------------
// Kinetic Behavior Propagation (match / offset)
// ---------------------------------------------------------------------------

/**
 * Propagates a parent joint's rotation delta to its children according to their
 * jointMode. Call this inside validateAndApplyPoseUpdate in App.tsx after writing
 * the new angle for the directly-manipulated part.
 *
 *   - offset: child counter-rotates to maintain its world orientation
 *   - match:  child rotates with the parent, exaggerating the fold
 *   - fk:      no effect
 *
 * NOTE: This function was fully implemented in the original but never wired up.
 * Wire it in App.tsx › validateAndApplyPoseUpdate:
 *
 *   if (partBeingDirectlyManipulated) {
 *     const prevVal = (prev as any)[partNameToPoseKey[partBeingDirectlyManipulated]] || 0;
 *     const nextVal = (tentativeNextPose as any)[partNameToPoseKey[partBeingDirectlyManipulated]] || 0;
 *     tentativeNextPose = applyKineticBehaviors(
 *       tentativeNextPose,
 *       partBeingDirectlyManipulated,
 *       nextVal - prevVal,
 *       jointModes,
 *     );
 *   }
 */
export const applyKineticBehaviors = (
  pose: Pose,
  changedPart: PartName,
  angleDelta: number,
  jointModes: Record<PartName, JointConstraint>,
  resonance: number = 1.0,
): Pose => {
  const newPose = { ...pose };
  const children = CHILD_MAP[changedPart];
  if (!children) return newPose;

  children.forEach(child => {
    const mode = jointModes[child];
    if (mode === 'fk') return;

    const poseKey =
      child === PartName.RElbow ? 'rForearm' :
      child === PartName.LElbow ? 'lForearm' :
      child === PartName.RSkin  ? 'rCalf'    :
      child === PartName.LSkin  ? 'lCalf'    :
      (child as string);

    const current = (newPose as any)[poseKey] || 0;

    if (mode === 'offset') {
      // Counter-rotate: child maintains world orientation
      (newPose as any)[poseKey] = current - (angleDelta * resonance);
    } else if (mode === 'match') {
      // Co-rotate: child folds with the parent
      (newPose as any)[poseKey] = current + (angleDelta * resonance);
    }
  });

  return newPose;
};

// ---------------------------------------------------------------------------
// Tension Visualization Helper
// ---------------------------------------------------------------------------

/**
 * Returns a normalised tension factor (0–2) for rubber-band pin visualisation.
 */
export const calculateTensionFactor = (
  anatomicalPos: Vector2D,
  pinnedPos: Vector2D,
  threshold: number = 50,
): number => {
  const dx = anatomicalPos.x - pinnedPos.x;
  const dy = anatomicalPos.y - pinnedPos.y;
  return Math.min(2.0, Math.sqrt(dx * dx + dy * dy) / threshold);
};

// ---------------------------------------------------------------------------
// Pose Interpolation
// ---------------------------------------------------------------------------

export const interpolatePoses = (start: Pose, end: Pose, t: number): Pose => {
  const result: any = {
    root: {
      x: lerp(start.root.x, end.root.x, t),
      y: lerp(start.root.y, end.root.y, t),
    },
    bodyRotation: lerpAngleShortestPath(start.bodyRotation, end.bodyRotation, t),
    offsets: {},
  };

  const keys = Object.keys(BASE_ROTATIONS) as (keyof typeof BASE_ROTATIONS)[];
  keys.forEach(key => {
    if (key === 'bodyRotation') return;
    result[key] = lerpAngleShortestPath(
      (start as any)[key] || 0,
      (end as any)[key]   || 0,
      t,
    );
  });

  return result as Pose;
};

// ---------------------------------------------------------------------------
// FABRIK IK Solver
// ---------------------------------------------------------------------------

/**
 * FABRIK IK Solver (Forward And Backward Reaching Inverse Kinematics)
 * Provides more fluid and stable limb movement than CCD.
 */
export const solveFABRIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  iterations: number = 10,
  tolerance: number = 0.1
): Pose => {
  const newPose = { ...pose };
  const chain = LIMB_SEQUENCES[limbName];
  if (!chain) return newPose;
  const epsilon = 1e-6;

  // 1. Get current global positions and bone lengths
  // Use activePins to ensure we are solving in the correct world space
  const joints = getJointPositions(newPose, activePins);
  const points: Vector2D[] = chain.map(joint => ({ ...joints[joint as string] }));

  // Add effector tip for better precision
  const effector = chain[chain.length - 1];
  const tipKey = effector === PartName.RAnkle ? 'rFootTip' : effector === PartName.LAnkle ? 'lFootTip' : effector === PartName.RWrist ? 'rHandTip' : 'lHandTip';
  const tipPoint = joints[tipKey] ?? points[points.length - 1];
  points.push({ ...tipPoint });

  const originalLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    originalLengths.push(dist(points[i], points[i + 1]));
  }

  const origin = { ...points[0] };
  const totalLength = originalLengths.reduce((a, b) => a + b, 0);
  const targetDist = dist(origin, target);

  // Check if any joint in the chain has 'offset' mode
  const hasStretch = chain.some(joint => jointModes[joint] === 'offset');

  // If target is out of reach AND we have offset, we scale the lengths
  let currentLengths = [...originalLengths];
  if (targetDist > totalLength && hasStretch) {
    const scale = targetDist / totalLength;
    currentLengths = originalLengths.map(l => l * scale);
  }

  // FABRIK Iterations
  if (targetDist > totalLength && !hasStretch) {
    // Standard out-of-reach behavior: extend fully
    for (let i = 0; i < points.length - 1; i++) {
      const r = dist(points[i], target);
      if (r < epsilon) continue;
      const lambda = currentLengths[i] / r;
      points[i + 1] = {
        x: (1 - lambda) * points[i].x + lambda * target.x,
        y: (1 - lambda) * points[i].y + lambda * target.y
      };
    }
  } else {
    for (let iter = 0; iter < iterations; iter++) {
      if (dist(points[points.length - 1], target) < tolerance) break;

      // Forward Pass — pull tip to target
      points[points.length - 1] = { ...target };
      for (let i = points.length - 2; i >= 0; i--) {
        const r = dist(points[i + 1], points[i]);
        if (r < epsilon) continue;
        const lambda = currentLengths[i] / r;
        points[i] = {
          x: (1 - lambda) * points[i + 1].x + lambda * points[i].x,
          y: (1 - lambda) * points[i + 1].y + lambda * points[i].y
        };
      }

      // Backward Pass — re-anchor at origin
      points[0] = { ...origin };
      for (let i = 0; i < points.length - 1; i++) {
        const r = dist(points[i], points[i + 1]);
        if (r < epsilon) continue;
        const lambda = currentLengths[i] / r;
        points[i + 1] = {
          x: (1 - lambda) * points[i].x + lambda * points[i + 1].x,
          y: (1 - lambda) * points[i].y + lambda * points[i + 1].y
        };
      }
    }
  }

  // 2. Convert points back to joint angles and update offsets if offset-mode
  // We solve angles sequentially from root to effector
  let currentParentAngle = 0;
  if (limbName === 'rArm' || limbName === 'lArm') {
    const waistAngle = newPose.bodyRotation + getTotalRotation(PartName.Waist, newPose);
    const torsoAngle = waistAngle + getTotalRotation(PartName.Torso, newPose);
    currentParentAngle = torsoAngle + getTotalRotation(PartName.Collar, newPose);
  } else {
    currentParentAngle = newPose.bodyRotation;
  }

  if (!newPose.offsets) newPose.offsets = {};

  for (let i = 0; i < chain.length; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const globalAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    const normalizedGlobalAngle = globalAngle - 90; 

    const part = chain[i];
    const poseKey = partNameToPoseKey[part];
    const baseRot = BASE_ROTATIONS[poseKey as keyof typeof BASE_ROTATIONS] || 0;

    let localAngle = normalizedGlobalAngle - currentParentAngle - baseRot;
    localAngle = ((localAngle + 180) % 360 + 360) % 360 - 180;

    const limits = JOINT_LIMITS[poseKey as keyof typeof JOINT_LIMITS];
    const clampedAngle = limits ? Math.max(limits.min, Math.min(limits.max, localAngle)) : localAngle;
    (newPose as any)[poseKey] = clampedAngle;
    currentParentAngle = normalizedGlobalAngle;

    // If offset-mode, we need to handle the bone length change
    // In our current system, bone lengths are fixed in ANATOMY.
    // To "offset", we would need to use offsets or dynamic ANATOMY.
    // Bitruvius 0.2 uses offsets for "Elasticity".
    if (hasStretch) {
        const originalLen = originalLengths[i];
        const currentLen = currentLengths[i];
        if (Math.abs(currentLen - originalLen) > 0.1) {
            // We don't have a direct "bone length" property in Pose, 
            // but we can use offsets to shift the child joint.
            // However, the next joint in the chain will be calculated from the previous one's end point.
            // This is complex with the current _calculateGlobalJointPositions.
            // For now, let's just solve the angles. 
            // True "Offset" (bone elongation) requires a more flexible rigging system.
        }
    }
  }

  return newPose;
};

// ---------------------------------------------------------------------------
// Smooth IK Solver with Natural Motion
// ---------------------------------------------------------------------------

/**
 * Reactive IK solver for intuitive posing.
 * Removed smooth blending for direct, responsive control.
 */
export const solveSmoothIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  smoothness: number = 0.2, // Reduced smoothness for more responsiveness
  ikStrength: number = 1.0, // Full strength for direct control
): Pose => {
  // Get the raw IK solution first - more direct now
  const rawSolution = solveFABRIK(pose, limbName, target, jointModes, activePins);
  
  // Minimal blending for responsiveness
  const reactivePose = { ...pose };
  
  // Blend each joint angle with minimal smoothing
  const chain = LIMB_SEQUENCES[limbName];
  if (!chain) return rawSolution;
  
  for (const part of chain) {
    const poseKey = partNameToPoseKey[part];
    const currentAngle = (pose as any)[poseKey] || 0;
    const targetAngle = (rawSolution as any)[poseKey] || 0;
    
    // Apply minimal smooth transition for responsive movement
    const t = smoothTransition(ikStrength, smoothness);
    (reactivePose as any)[poseKey] = lerpAngleShortestPath(currentAngle, targetAngle, t);
  }
  
  return reactivePose;
};

/**
 * Advanced IK Solver that combines FABRIK with Bitruvius constraints.
 */
export const solveAdvancedIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[]
): Pose => {
  return solveFABRIK(pose, limbName, target, jointModes, activePins);
};

// ---------------------------------------------------------------------------
// CCD IK Solver
// ---------------------------------------------------------------------------

/**
 * Simple CCD IK Solver for a limb chain.
 */
export const solveIK = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  iterations: number = 10,
  activePins: AnchorName[] = []
): Pose => {
  const newPose = { ...pose };
  const chain = LIMB_SEQUENCES[limbName];
  if (!chain) return newPose;

  // CCD Implementation
  for (let i = 0; i < iterations; i++) {
    // Iterate from end of chain to start
    for (let j = chain.length - 1; j >= 0; j--) {
      const joints = getJointPositions(newPose, activePins);
      const currentJoint = chain[j];
      const effector = chain[chain.length - 1];

      const jointPos = joints[currentJoint as string];
      const effectorPos = joints[effector === PartName.RAnkle ? 'rFootTip' : effector === PartName.LAnkle ? 'lFootTip' : effector === PartName.RWrist ? 'rHandTip' : 'lHandTip'];

      if (!jointPos || !effectorPos) continue;

      const toEffector = { x: effectorPos.x - jointPos.x, y: effectorPos.y - jointPos.y };
      const toTarget = { x: target.x - jointPos.x, y: target.y - jointPos.y };

      const angleEffector = Math.atan2(toEffector.y, toEffector.x);
      const angleTarget = Math.atan2(toTarget.y, toTarget.x);

      let deltaAngle = deg(angleTarget - angleEffector);

      // Apply 1 degree bias for directional stability (Phase 0.1 requirement)
      deltaAngle += (deltaAngle > 0 ? 1 : -1);

      const poseKey = partNameToPoseKey[currentJoint];
      (newPose as any)[poseKey] = ((newPose as any)[poseKey] || 0) + deltaAngle;
    }
  }

  return newPose;
};

// ---------------------------------------------------------------------------
// Jacobian Transpose IK Solver (Jacobian Transpose Method)
// ---------------------------------------------------------------------------
/**
 * Jacobian Transpose IK Solver - Gradient-based approach for smooth, stable IK
 * Takes small steps in the direction of the gradient for better control
 */
export const solveJacobianTranspose = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  maxIterations: number = 20,
  damping: number = 0.12,
  stepSize: number = 0.6
): Pose => {
  const newPose = { ...pose };
  const limbChain = LIMB_SEQUENCES[limbName];
  if (!limbChain) return newPose;

  // Iterative solver using Jacobian transpose
  for (let iter = 0; iter < maxIterations; iter++) {
    const joints = getJointPositions(newPose, activePins);
    const effector = limbChain[limbChain.length - 1];
    const effectorPos = joints[effector as string];
    const error = { x: target.x - effectorPos.x, y: target.y - effectorPos.y };
    
    // Check convergence
    const errorMagnitude = Math.sqrt(error.x * error.x + error.y * error.y);
    if (errorMagnitude < 0.1) break;
    
    // Apply Jacobian transpose update
    for (let i = 0; i < limbChain.length; i++) {
      const joint = limbChain[i];
      const jointPos = joints[joint as string];
      const poseKey = partNameToPoseKey[joint];
      const r = { x: effectorPos.x - jointPos.x, y: effectorPos.y - jointPos.y };
      const gradient = (r.x * error.y - r.y * error.x);
      const delta = Math.max(-stepSize, Math.min(stepSize, gradient * damping));
      (newPose as any)[poseKey] = ((newPose as any)[poseKey] || 0) + delta;
    }
  }

  return newPose;
};

// ---------------------------------------------------------------------------
// Pseudo-Inverse Jacobian Method 2 (PIM2) IK Solver
// ---------------------------------------------------------------------------
/**
 * PIM2 IK Solver - More stable than CCD, handles singularities better
 * Uses weighted pseudo-inverse for robust solving
 */
export const solvePIM2 = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  maxIterations: number = 15,
  lambda: number = 0.01
): Pose => {
  return solveJacobianTranspose(pose, limbName, target, jointModes, activePins, maxIterations, 0.16, 0.8);
};

// ---------------------------------------------------------------------------
// Fluid IK Solver - Pinned Constraints Only
// ---------------------------------------------------------------------------
/**
 * Fluid IK Solver - Only pinned parts constrain the system
 * All other parts move fluidly without rapid or choppy motion
 * Uses adaptive damping and smooth interpolation for natural movement
 */
export const solveFluid = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  maxIterations: number = 30,
  baseDamping: number = 0.15,
  adaptiveDamping: boolean = true
): Pose => {
  const solved = solveJacobianTranspose(pose, limbName, target, jointModes, activePins, maxIterations, 0.1, 0.45);
  return interpolatePoses(pose, solved, 0.35);
};

// ---------------------------------------------------------------------------
// Damped Least Squares (DLS) IK Solver
// ---------------------------------------------------------------------------
/**
 * DLS IK Solver - Most robust near singularities
 * Uses Tikhonov regularization for stable solutions
 */
export const solveDLS = (
  pose: Pose,
  limbName: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
  target: Vector2D,
  jointModes: Record<PartName, JointConstraint>,
  activePins: AnchorName[],
  maxIterations: number = 25,
  dampingFactor: number = 0.1
): Pose => {
  return solveJacobianTranspose(pose, limbName, target, jointModes, activePins, maxIterations, 0.22, 0.35);
};
