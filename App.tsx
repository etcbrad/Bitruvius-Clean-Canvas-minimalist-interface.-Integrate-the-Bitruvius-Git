
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Pose, PartName, PartSelection, PartVisibility, AnchorName, partNameToPoseKey, PARENT_MAP, JointConstraint, RenderMode, Vector2D, ViewMode, AnimationState, AnimationKeyframe, SavedPose, KinematicMode, BodyDragMode, WalkingEngineGait, ImageLayerState, BodyPartMaskLayer, BoneVariant, MaskPhysicsMode, MaskBalanceMode } from './types';
import { RESET_POSE, FLOOR_HEIGHT, JOINT_LIMITS, ANATOMY, GROUND_STRIP_HEIGHT } from './constants'; 
import { getJointPositions, getShortestAngleDiffDeg, interpolatePoses, solveIK, solveAdvancedIK, solveFABRIK, solveJacobianTranspose, solvePIM2, solveDLS, solveFluid, lerp } from './utils/kinematics';
import { Scanlines, SystemGuides } from './components/SystemGrid';
import { Mannequin, getPartCategory, getPartCategoryDisplayName } from './components/Mannequin'; 
import { DraggablePanel } from './components/DraggablePanel';
import { COLORS_BY_CATEGORY, COLORS } from './components/Bone';
import { poseToString, stringToPose } from './utils/pose-parser';
import { CanvasRotationWheel } from './components/CanvasRotationWheel';
import { POSE_LIBRARY_DB } from './pose-library-db';
import { useSequence } from './hooks/useSequence';
import { createPoseSlot } from './utils/sequenceEngine';
import { EnhancedTimeline } from './components/EnhancedTimeline';
import { MovementSettings } from './components/MovementSettings';
import { debounce } from './utils/debounce';
import { WalkingCalibrationPanel } from './components/WalkingCalibrationPanel';
import { useDragState } from './hooks/useDragState';
import { usePanel } from './hooks/usePanel';

interface PanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

const DEFAULT_IMAGE_LAYER: ImageLayerState = {
  src: null,
  visible: false,
  opacity: 1,
  x: 50,
  y: 50,
  scale: 100,
  fitMode: 'contain',
  blendMode: 'source-over',
};

const DEFAULT_BODY_PART_MASK_LAYER: BodyPartMaskLayer = {
  src: null,
  visible: false,
  opacity: 1,
  scale: 100,
  rotationDeg: 0,
  offsetX: 0,
  offsetY: 0,
  blendMode: 'source-over',
  boneAdjustEnabled: false,
  boneScaleLength: 1,
  boneScaleWidth: 1,
  boneVariant: null,
  physicsMode: 'follow',
  balanceMode: 'y',
  counterTargets: [],
  lockTargets: [],
};

const BONE_VARIANT_OPTIONS: BoneVariant[] = [
  'diamond',
  'waist-teardrop-pointy-up',
  'torso-teardrop-pointy-down',
  'collar-horizontal-oval-shape',
  'deltoid-shape',
  'limb-tapered',
  'head-tall-oval',
  'hand-foot-arrowhead-shape',
  'oval-limb',
  'oval-torso',
  'oval-waist',
  'oval-hand-foot',
];

const MASK_AUTO_CROP_ALPHA_THRESHOLD = 12;
const MASK_AUTO_CROP_PADDING = 8;

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const MIRROR_PART_MAP: Partial<Record<PartName, PartName>> = {
  [PartName.LShoulder]: PartName.RShoulder,
  [PartName.RShoulder]: PartName.LShoulder,
  [PartName.LElbow]: PartName.RElbow,
  [PartName.RElbow]: PartName.LElbow,
  [PartName.LWrist]: PartName.RWrist,
  [PartName.RWrist]: PartName.LWrist,
  [PartName.LThigh]: PartName.RThigh,
  [PartName.RThigh]: PartName.LThigh,
  [PartName.LSkin]: PartName.RSkin,
  [PartName.RSkin]: PartName.LSkin,
  [PartName.LAnkle]: PartName.RAnkle,
  [PartName.RAnkle]: PartName.LAnkle,
};

const getMirrorPart = (part: PartName): PartName | null => MIRROR_PART_MAP[part] ?? null;

const applyBoneScalePatch = (
  prev: Record<PartName, { length: number; width: number }>,
  part: PartName,
  patch: Partial<{ length: number; width: number }>
) => {
  const current = prev[part] ?? { length: 1, width: 1 };
  const next = {
    length: patch.length ?? current.length,
    width: patch.width ?? current.width,
  };
  const updated = { ...prev, [part]: next };
  const mirrorPart = getMirrorPart(part);
  if (mirrorPart) {
    const mirrorCurrent = prev[mirrorPart] ?? { length: 1, width: 1 };
    updated[mirrorPart] = {
      length: patch.length ?? mirrorCurrent.length,
      width: patch.width ?? mirrorCurrent.width,
    };
  }
  return updated;
};

const WALKING_PRESETS: { name: string; gait: WalkingEngineGait }[] = [
  {
    name: 'Walk',
    gait: { intensity: 0.8, stride: 0.55, lean: 0.1, frequency: 1.2, gravity: 0.6, bounce: 0.1, bends: 1.0, head_spin: 0.0, mood: 0.8, ground_drag: 0.2, foot_angle_on_ground: 0, arm_swing: 0.6, elbow_bend: 0.7, wrist_swing: 0.6, foot_roll: 0.6, toe_lift: 0.8, shin_tilt: 0.0, foot_slide: 0.2, kick_up_force: 0.4, hover_height: 0.1, waist_twist: 0.3, hip_sway: 0.4, toe_bend: 0.8 },
  },
  {
    name: 'Bouncy',
    gait: { intensity: 0.9, stride: 0.5, lean: -0.1, frequency: 1.5, gravity: 0.4, bounce: 0.8, bends: 0.8, head_spin: 0.0, mood: 0.9, ground_drag: 0.1, foot_angle_on_ground: 5, arm_swing: 0.8, elbow_bend: 0.6, wrist_swing: 0.7, foot_roll: 0.7, toe_lift: 0.7, shin_tilt: -0.1, foot_slide: 0.1, kick_up_force: 0.5, hover_height: 0.3, waist_twist: 0.4, hip_sway: 0.6, toe_bend: 0.7 },
  },
  {
    name: 'Run',
    gait: { intensity: 1.0, stride: 0.8, lean: 0.05, frequency: 2.2, gravity: 0.3, bounce: 0.3, bends: 0.14, head_spin: 0.0, mood: 1.0, ground_drag: 0.1, foot_angle_on_ground: 0, arm_swing: 1.2, elbow_bend: 0.8, wrist_swing: 0.8, foot_roll: 0.8, toe_lift: 0.8, shin_tilt: 0.0, foot_slide: 0.1, kick_up_force: 0.9, hover_height: 0.2, waist_twist: 0.2, hip_sway: 0.1, toe_bend: 1.0 },
  },
  {
    name: 'Jog',
    gait: { intensity: 0.9, stride: 0.6, lean: 0.1, frequency: 1.8, gravity: 0.5, bounce: 0.4, bends: 0.6, head_spin: 0.0, mood: 0.85, ground_drag: 0.15, foot_angle_on_ground: 0, arm_swing: 1.0, elbow_bend: 0.9, wrist_swing: 0.5, foot_roll: 0.7, toe_lift: 0.6, shin_tilt: 0.0, foot_slide: 0.1, kick_up_force: 0.6, hover_height: 0.15, waist_twist: 0.3, hip_sway: 0.2, toe_bend: 0.9 },
  },
  {
    name: 'Scoot',
    gait: { intensity: 0.7, stride: 0.2, lean: 0.2, frequency: 2.5, gravity: 0.7, bounce: 0.1, bends: 1.2, head_spin: 0.0, mood: 0.6, ground_drag: 0.6, foot_angle_on_ground: 10, arm_swing: 0.1, elbow_bend: 0.3, wrist_swing: 0.1, foot_roll: 0.3, toe_lift: 0.2, shin_tilt: 0.2, foot_slide: 0.8, kick_up_force: 0.1, hover_height: 0.0, waist_twist: 0.8, hip_sway: 1.0, toe_bend: 0.4 },
  },
];

const toBlendMode = (value?: GlobalCompositeOperation): React.CSSProperties['mixBlendMode'] => {
  if (!value || value === 'source-over') {
    return 'normal';
  }
  return value as React.CSSProperties['mixBlendMode'];
};

const App: React.FC = () => {
  const [activePose, setActivePose] = useState<Pose>(RESET_POSE);
  const [ghostPose, setGhostPose] = useState<Pose>(RESET_POSE);
  const isDragging = useRef(false);
  const undoStack = useRef<Pose[]>([]);
  const redoStack = useRef<Pose[]>([]);
  const dragStartPose = useRef<Pose | null>(null);


  const [activeTab, setActiveTab] = useState<'model' | 'animation'>('model');
  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [activePins, setActivePins] = useState<AnchorName[]>([PartName.Waist]); 
  const [pinnedState, setPinnedState] = useState<Record<string, Vector2D>>({});
  const [renderMode, setRenderMode] = useState<RenderMode>('default');
  const [paletteColors] = useState({
    shadow: '#0f172a',
    mid: '#64748b',
    highlight: '#e2e8f0',
  });

  const [selectedParts, setSelectedParts] = useState<PartSelection>(() => {
    const initialSelection: PartSelection = Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: false }), {} as PartSelection);
    initialSelection[PartName.Waist] = true; 
    return initialSelection;
  });

  const [visibility, setVisibility] = useState<PartVisibility>(() => Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: true }), {} as PartVisibility));

  const [jointModes, setJointModes] = useState<Record<PartName, JointConstraint>>(() => 
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: 'fk' }), {} as Record<PartName, JointConstraint>)
  );

  // New Sequence Engine with Auto-Interpolation (defaults to ON)
  const [autoInterpolation, setAutoInterpolation] = useState(true);
  const [sequence, sequencePose, sequenceActions] = useSequence(activePose, { autoInterpolationEnabled: autoInterpolation });
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [viewingPose, setViewingPose] = useState<Pose | null>(null);

  const captureSequenceSlot = useCallback((label: 'A' | 'B' | 'C') => {
    const existing = sequence.slots.find(slot => slot.label === label);
    if (existing) {
      sequenceActions.updateSlot(existing.id, activePose);
      setSelectedSlotId(existing.id);
      return;
    }

    const newSlot = createPoseSlot(activePose, 1000, 'ease-in-out');
    newSlot.label = label;
    const orderRank = (slotLabel: string) => ({ A: 0, B: 1, C: 2 } as Record<string, number>)[slotLabel] ?? 99;
    const orderedSlots = [...sequence.slots, newSlot].sort((a, b) => orderRank(a.label) - orderRank(b.label));
    sequenceActions.setSequence({ ...sequence, slots: orderedSlots });
    setSelectedSlotId(newSlot.id);
  }, [activePose, sequence, sequenceActions]);

  const [kinematicMode, setKinematicMode] = useState<KinematicMode>('fk');
  const [bodyDragMode, setBodyDragMode] = useState<BodyDragMode>('rigid');
  const [bodyDragWeightiness, setBodyDragWeightiness] = useState(0);
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [groundPlaneMode, setGroundPlaneMode] = useState<'gradient' | 'black' | 'white' | 'transparent' | 'perspective'>('gradient');
  const [groundPattern, setGroundPattern] = useState<'none' | 'hatch' | 'stippling' | 'dither'>('none');
  const [groundPerspective, setGroundPerspective] = useState({ lines: 10, spacing: 40, convergence: 0.85 });

  const bodyDragStateRef = useRef<{ lastTime: number; lastTarget: Vector2D | null; velocity: Vector2D }>({
    lastTime: 0,
    lastTarget: null,
    velocity: { x: 0, y: 0 },
  });
  const bodyDragModeRef = useRef<BodyDragMode>('rigid');
  const bodyDragModeSwitchRef = useRef<{ lastMode: BodyDragMode; lastSwitchTime: number }>({
    lastMode: 'rigid',
    lastSwitchTime: 0,
  });

  // Update activePose with sequencePose when sequence is playing or scrubbing
  useEffect(() => {
    if ((sequence.isPlaying || sequence.scrubPosition >= 0) && !isUserInteracting) {
      setActivePose(sequencePose);
    }
  }, [sequencePose, sequence.isPlaying, sequence.scrubPosition, isUserInteracting]);

  // --- Sequence Actions ---
  const addKeyframe = useCallback(() => {
    sequenceActions.addSlot(activePose);
  }, [activePose, sequenceActions]);

  const removeKeyframe = useCallback((id: string) => {
    sequenceActions.removeSlot(id);
  }, [sequenceActions]);

  const playAnimation = useCallback(() => {
    sequenceActions.play();
  }, [sequenceActions]);

  const stopAnimation = useCallback(() => {
    sequenceActions.stop();
  }, [sequenceActions]);

  // --- Pose Editing Actions ---
  const handleSlotClick = useCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    const slot = sequence.slots.find(s => s.id === slotId);
    if (slot) {
      setViewingPose(slot.pose);
    }
  }, [sequence.slots]);

  const updateSlotFromCurrent = useCallback((slotId: string) => {
    sequenceActions.updateSlot(slotId, activePose);
  }, [activePose, sequenceActions]);

  const exitPoseView = useCallback(() => {
    setViewingPose(null);
    setSelectedSlotId(null);
  }, []);

  // --- IK Interaction Logic with Smooth Motion ---
  const handleIKMove = useCallback((pinName: AnchorName, targetPos: Vector2D) => {
    if (pinName === 'root' || pinName === PartName.Waist) return;

    // Set interaction flag to prevent sequence updates during user manipulation
    setIsUserInteracting(true);

    // Determine which limb we are dragging
    let limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg' | null = null;
    if (pinName === PartName.RWrist || pinName === 'rHandTip') limb = 'rArm';
    else if (pinName === PartName.LWrist || pinName === 'lHandTip') limb = 'lArm';
    else if (pinName === PartName.RAnkle || pinName === 'rFootTip') limb = 'rLeg';
    else if (pinName === PartName.LAnkle || pinName === 'lFootTip') limb = 'lLeg';

    if (limb) {
      let solvedPose: Pose;

      if (kinematicMode === 'fk') {
        solvedPose = activePose;
      } else if (kinematicMode === 'ik') {
        solvedPose = solveIK(activePose, limb, targetPos, 10);
      } else if (kinematicMode === 'fabrik') {
        solvedPose = solveFABRIK(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'jacobian') {
        solvedPose = solveJacobianTranspose(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'pim2') {
        solvedPose = solvePIM2(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'dls') {
        solvedPose = solveDLS(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'fluid') {
        solvedPose = solveFluid(activePose, limb, targetPos, jointModes, activePins);
      } else {
        solvedPose = solveFABRIK(activePose, limb, targetPos, jointModes, activePins);
      }
      setGhostPose(solvedPose);
    }
  }, [activePose, jointModes, activePins, kinematicMode]);

  const getPinnedLimbTargets = useCallback(() => {
    const targets: Partial<Record<'rArm' | 'lArm' | 'rLeg' | 'lLeg', Vector2D>> = {};
    const priority: { limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg'; pins: AnchorName[] }[] = [
      { limb: 'rLeg', pins: ['rFootTip', PartName.RAnkle] },
      { limb: 'lLeg', pins: ['lFootTip', PartName.LAnkle] },
      { limb: 'rArm', pins: ['rHandTip', PartName.RWrist] },
      { limb: 'lArm', pins: ['lHandTip', PartName.LWrist] },
    ];

    priority.forEach(({ limb, pins }) => {
      for (const pin of pins) {
        if (activePins.includes(pin) && pinnedState[pin]) {
          targets[limb] = pinnedState[pin];
          break;
        }
      }
    });

    return targets;
  }, [activePins, pinnedState]);

  const solveBodyDragLimb = useCallback((
    pose: Pose,
    limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
    target: Vector2D
  ) => {
    if (bodyDragMode === 'float' || bodyDragMode === 'space') {
      return solveFluid(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'ragdoll') {
      return solveDLS(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'sling') {
      return solveJacobianTranspose(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'tether') {
      return solvePIM2(pose, limb, target, jointModes, activePins);
    }
    return solveFABRIK(pose, limb, target, jointModes, activePins);
  }, [activePins, bodyDragMode, jointModes]);

  const solvePinnedLimbsForBodyDrag = useCallback((pose: Pose) => {
    const targets = getPinnedLimbTargets();
    let nextPose = pose;
    (Object.entries(targets) as Array<['rArm' | 'lArm' | 'rLeg' | 'lLeg', Vector2D]>).forEach(
      ([limb, target]) => {
        if (target) {
          nextPose = solveBodyDragLimb(nextPose, limb, target);
        }
      }
    );
    return nextPose;
  }, [getPinnedLimbTargets, solveBodyDragLimb]);

  const computeBodyDragRoot = useCallback((targetRoot: Vector2D) => {
    const now = performance.now();
    const dragState = bodyDragStateRef.current;
    const switchState = bodyDragModeSwitchRef.current;

    if (bodyDragModeRef.current !== bodyDragMode) {
      bodyDragModeRef.current = bodyDragMode;
      switchState.lastMode = bodyDragMode;
      switchState.lastSwitchTime = now;
      dragState.velocity = { x: 0, y: 0 };
      dragState.lastTarget = targetRoot;
      dragState.lastTime = now;
    }
    const lastTarget = dragState.lastTarget ?? targetRoot;
    const dt = Math.max(8, now - (dragState.lastTime || now));

    const targetVel = {
      x: (targetRoot.x - lastTarget.x) / dt,
      y: (targetRoot.y - lastTarget.y) / dt,
    };

    dragState.velocity = {
      x: dragState.velocity.x * 0.65 + targetVel.x * 0.35,
      y: dragState.velocity.y * 0.65 + targetVel.y * 0.35,
    };

    dragState.lastTarget = targetRoot;
    dragState.lastTime = now;

    const presets: Record<BodyDragMode, { follow: number; lag: number; sag: number; tether: number; switchFriction: number }> = {
      rigid: { follow: 1, lag: 0, sag: 0, tether: 0, switchFriction: 0.6 },
      float: { follow: 0.22, lag: 0.3, sag: 0.1, tether: 0.1, switchFriction: 0.35 },
      space: { follow: 0.15, lag: 0.45, sag: 0.05, tether: 0.15, switchFriction: 0.3 },
      sling: { follow: 0.28, lag: 0.7, sag: 0.1, tether: 0.25, switchFriction: 0.4 },
      ragdoll: { follow: 0.16, lag: 0.2, sag: 1, tether: 0, switchFriction: 0.32 },
      tether: { follow: 0.2, lag: 0.4, sag: 0.05, tether: 0.9, switchFriction: 0.42 },
    };

    const preset = presets[bodyDragMode];
    const weightScale = 1 - Math.min(0.75, bodyDragWeightiness * 0.9);
    let follow = Math.min(1, preset.follow * weightScale * (dt / 16));

    const switchAge = now - switchState.lastSwitchTime;
    if (switchAge < 200) {
      follow *= preset.switchFriction;
    }

    const delta = {
      x: targetRoot.x - activePose.root.x,
      y: targetRoot.y - activePose.root.y,
    };
    const distance = Math.hypot(delta.x, delta.y);
    const maxSnap = switchAge < 200 ? 60 * preset.switchFriction : 220;
    const snapScale = distance > maxSnap ? maxSnap / Math.max(distance, 0.001) : 1;

    let nextRoot = {
      x: activePose.root.x + delta.x * follow * snapScale,
      y: activePose.root.y + delta.y * follow * snapScale,
    };

    const speed = Math.hypot(dragState.velocity.x, dragState.velocity.y);

    if (bodyDragMode === 'sling') {
      const lag = Math.min(1, speed * 40) * preset.lag;
      nextRoot = {
        x: nextRoot.x - dragState.velocity.x * 120 * lag,
        y: nextRoot.y - dragState.velocity.y * 120 * lag,
      };
    } else if (bodyDragMode === 'ragdoll') {
      const sag = (30 + Math.min(120, speed * 300)) * preset.sag;
      nextRoot = {
        x: nextRoot.x,
        y: nextRoot.y + sag * (0.4 + bodyDragWeightiness),
      };
    } else if (bodyDragMode === 'tether') {
      nextRoot = {
        x: nextRoot.x + dragState.velocity.x * 60 * preset.tether,
        y: nextRoot.y + dragState.velocity.y * 60 * preset.tether,
      };
    } else if (bodyDragMode === 'float' || bodyDragMode === 'space') {
      nextRoot = {
        x: nextRoot.x - dragState.velocity.x * 40 * preset.lag,
        y: nextRoot.y - dragState.velocity.y * 40 * preset.lag + 20 * preset.sag,
      };
    }

    return nextRoot;
  }, [activePose.root.x, activePose.root.y, bodyDragMode, bodyDragWeightiness]);

  const [userPoses, setUserPoses] = useState<SavedPose[]>(() => {
    const saved = localStorage.getItem('bitruvius-saved-poses');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bitruvius-saved-poses', JSON.stringify(userPoses));
  }, [userPoses]);

  const saveCurrentPose = (name: string) => {
    const newPose: SavedPose = {
      id: `UP-${Date.now()}`,
      name: name || `Pose ${userPoses.length + 1}`,
      data: poseToString(activePose),
      timestamp: Date.now(),
    };
    setUserPoses(prev => [newPose, ...prev]);
  };

  const deleteSavedPose = (id: string) => {
    setUserPoses(prev => prev.filter(p => p.id !== id));
  };

  const [isAdjusting, setIsAdjusting] = useState(false);
  const [rotatingPart, setRotatingPart] = useState<PartName | null>(null);
  const rotationStartInfo = useRef<{ 
    startAngle: number; 
    startRotationValue: number; 
    pointerX: number; 
    pointerY: number;
    initialPinnedPos: Vector2D | null;
  } | null>(null);

  const [isEffectorDragging, setIsEffectorDragging] = useState(false);
  const [effectorPart, setEffectorPart] = useState<PartName | null>(null);
  const [isIKDragging, setIsIKDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null); 
  const [isCraneActive] = useState(false);
  const [isCraneDragging, setIsCraneDragging] = useState(false);
const dragStartInfo = useRef<{ startX: number; startY: number; startRootX: number; startRootY: number } | null>(null);

  function dragStartInfoInitial() {
    return { startX: 0, startY: 0, startRootX: 0, startRootY: 0 };
  }

  const [showSplash, setShowSplash] = useState(true);
  const [isAirMode] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showBoneOverlay, setShowBoneOverlay] = useState(true);
  const [wheelCollapsed, setWheelCollapsed] = useState(false);
  const [mannequinStyle, setMannequinStyle] = useState<'default' | 'oval'>('default');
  const [walkingEnabled, setWalkingEnabled] = useState(false);
  const [walkingPinMode, setWalkingPinMode] = useState<'none' | 'leftFoot' | 'rightFoot' | 'dual'>('none');
  const [gaitDepth, setGaitDepth] = useState(35);
  const [walkingPresetIndex, setWalkingPresetIndex] = useState(0);
  const [walkingGait, setWalkingGait] = useState<WalkingEngineGait>(WALKING_PRESETS[0].gait);
  const [walkingSpeed, setWalkingSpeed] = useState(1);
  const [showCalibrationPanel, setShowCalibrationPanel] = useState(false);

  // Hook for drag state management
  const [dragState, dragActions] = useDragState();

  // Hook for panel management  
  const [panelState, panelActions] = usePanel();

  const resolveLayerPlacement = useCallback((layer: any) => {
    return { x: 0, y: 0, width: 100, height: 100 };
  }, []);

  const cycleBodyDragMode = useCallback(() => {
    // Add body drag mode cycling logic here if needed
  }, []);

  const cycleBodyDragWeightiness = useCallback(() => {
    // Add body drag weightiness cycling logic here if needed  
  }, []);

  const cycleWalkingPreset = useCallback(() => {
    setWalkingPresetIndex(prev => {
      const nextIndex = (prev + 1) % WALKING_PRESETS.length;
      const nextPreset = WALKING_PRESETS[nextIndex];
      if (nextPreset) {
        setWalkingGait(nextPreset.gait);
        walkingGaitRef.current = nextPreset.gait;
        walkingPhaseRef.current = 0;
        walkingLastTimeRef.current = performance.now();
      }
      return nextIndex;
    });
  }, []);

  const saveWalkingLoopToTimeline = useCallback(() => {
    const gait = walkingGaitRef.current;
    const basePose = walkingEnabled ? walkingBasePoseRef.current : activePose;
    const depth = clampNumber(gaitDepth / 100, 0, 1);
    const phases = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    const durationToNext = 350;
    const slots = phases.map((phase, index) => ({
      id: `WALK-${Date.now()}-${index}`,
      label: `W${index + 1}`,
      pose: buildWalkingPose(phase, basePose, gait, depth),
      durationToNext: index === phases.length - 1 ? 0 : durationToNext,
      easing: 'ease-in-out' as const,
      autoGenerated: false,
    }));

    sequenceActions.setSequence({
      slots,
      loop: true,
      isPlaying: false,
      scrubPosition: 0,
      currentTimeMs: 0,
      easingEnabled: true,
      smoothTransitions: true,
      ikAssisted: false,
    });
  }, [buildWalkingPose, gaitDepth, sequenceActions, walkingEnabled, activePose]);

  const handleBackgroundUploadInput = useCallback(() => {
    backgroundUploadInputRef.current?.click();
  }, []);

  const handleForegroundUploadInput = useCallback(() => {
    foregroundUploadInputRef.current?.click();
  }, []);

  const handleBodyPartMaskUploadInput = useCallback(() => {
    bodyPartMaskUploadInputRef.current?.click();
  }, []);

  const dockHeight = 800;

  const handleClearBackgroundImageLayer = useCallback(() => {
    setBackgroundImageLayer(DEFAULT_IMAGE_LAYER);
  }, []);

  const handlePatchBackgroundImageLayer = useCallback((patch: any) => {
    setBackgroundImageLayer(prev => ({ ...prev, ...patch }));
  }, []);

  const handleClearForegroundImageLayer = useCallback(() => {
    setForegroundImageLayer(DEFAULT_IMAGE_LAYER);
  }, []);

  const handlePatchForegroundImageLayer = useCallback((patch: any) => {
    setForegroundImageLayer(prev => ({ ...prev, ...patch }));
  }, []);

  const handleClearBodyPartMaskLayer = useCallback(() => {
    // Add mask clear logic here if needed
  }, []);

  const handlePatchBodyPartMaskLayer = useCallback((patch: any) => {
    // Add mask patch logic here if needed
  }, []);

  const loadedMaskCount = 0;
  const orderedParts = Object.values(PartName);

  const openBackgroundUpload = useCallback(() => {
    backgroundUploadInputRef.current?.click();
  }, []);

  const openForegroundUpload = useCallback(() => {
    foregroundUploadInputRef.current?.click();
  }, []);

  const openBodyPartMaskUpload = useCallback(() => {
    bodyPartMaskUploadInputRef.current?.click();
  }, []);

  const selectedBoneScale = { length: 1, width: 1 };

  const handlePatchJointOffset = useCallback(() => {
    // Add joint offset patch logic here if needed
  }, []);

  const maskHandles = [];

  const jointPositions = useMemo(() => getJointPositions(activePose, []), [activePose]);

  const applyBoneScalePatch = useCallback((prev: any, part: PartName, scale: any) => {
    return { ...prev, [part]: scale };
  }, []);
  const [showSystemTab, setShowSystemTab] = useState(false);
  const [smartPinning, setSmartPinning] = useState(false);
  const [bodySyncMode, setBodySyncMode] = useState(false);
  const [omniSyncMode, setOmniSyncMode] = useState(false);
  const [panelsVisible, setPanelsVisible] = useState(true);
  const [characterEditMode, setCharacterEditMode] = useState(false);
  const [globalBoneScale, setGlobalBoneScale] = useState({ length: 1.0, width: 1.0 });
  const [boneScale, setBoneScale] = useState<Record<PartName, { length: number; width: number }>>(() => (
    Object.values(PartName).reduce((acc, part) => ({ ...acc, [part]: { length: 1, width: 1 } }), {} as Record<PartName, { length: number; width: number }>)
  ));
  const [enablePerBoneResize] = useState(true);
  const [boneVariantOverrides, setBoneVariantOverrides] = useState<Record<PartName, BoneVariant | null>>(() => (
    Object.values(PartName).reduce((acc, part) => ({ ...acc, [part]: null }), {} as Record<PartName, BoneVariant | null>)
  ));
  const [backgroundImageLayer, setBackgroundImageLayer] = useState<ImageLayerState>(DEFAULT_IMAGE_LAYER);
  const [foregroundImageLayer, setForegroundImageLayer] = useState<ImageLayerState>(DEFAULT_IMAGE_LAYER);
  const [bodyPartMaskLayers, setBodyPartMaskLayers] = useState<Record<PartName, BodyPartMaskLayer>>({});
  const [maskControlsVisible, setMaskControlsVisible] = useState(false);
  const [activeMaskEditorPart, setActiveMaskEditorPart] = useState<PartName | null>(null);
  const [maskUploadTarget, setMaskUploadTarget] = useState<PartName | null>(null);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const foregroundObjectUrlRef = useRef<string | null>(null);
  const bodyPartMaskObjectUrlRef = useRef<Record<PartName, string>>({} as Record<PartName, string>);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const foregroundUploadInputRef = useRef<HTMLInputElement>(null);
  const bodyPartMaskUploadInputRef = useRef<HTMLInputElement>(null);

  const walkingBasePoseRef = useRef<Pose>(RESET_POSE);
  const walkingPhaseRef = useRef(0);
  const walkingLastTimeRef = useRef(0);
  const walkingGaitRef = useRef<WalkingEngineGait>(walkingGait);
  const walkingFootLockRef = useRef<{
    left: { active: boolean; pos: Vector2D; blend: number };
    right: { active: boolean; pos: Vector2D; blend: number };
  }>({
    left: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
    right: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
  });

  const buildWalkingPose = useCallback((
    phase: number,
    basePose: Pose,
    gait: WalkingEngineGait,
    depth: number,
  ): Pose => {
    const strideVal = Math.sin(phase);
    const counterStride = Math.sin(phase + Math.PI);
    const moodFactor = gait.mood;

    const torsoLean = (gait.lean * 35) + (moodFactor - 0.5) * -40 + Math.cos(phase * 2) * 8 * gait.intensity;
    const waistTwist = counterStride * 20 * gait.waist_twist * gait.intensity;
    const hipSwayMagnitude = 25 * gait.hip_sway * gait.intensity;
    const waistSway = Math.cos(phase * 2) * hipSwayMagnitude * 0.5;
    const bodySwayX = Math.sin(phase * 2) * hipSwayMagnitude * 0.5;
    const bobbing = -Math.cos(phase * 2) * 5 * gait.bounce;

    const armSwingMagnitude = (20 + (gait.stride * 45)) * (0.4 + moodFactor) * gait.arm_swing;
    const baseElbowBend = -30 * gait.elbow_bend;
    const dynamicElbowAmplitude = 60 * gait.arm_swing * gait.intensity * gait.bends;
    const elbowPhaseOffset = Math.PI * 0.05;
    const lElbowDrive = Math.cos(phase + Math.PI + elbowPhaseOffset);
    const rElbowDrive = Math.cos(phase + elbowPhaseOffset);
    const wristPhaseOffset = Math.PI * 0.15;
    const lWristDrive = Math.cos(phase + Math.PI + wristPhaseOffset);
    const rWristDrive = Math.cos(phase + wristPhaseOffset);

    const easeInOutQuint = (t: number) => (t < 0.5
      ? 16 * t * t * t * t * t
      : 1 - Math.pow(-2 * t + 2, 5) / 2);

    const calculateLegAngles = (s: number, phaseValue: number) => {
      const hipMult = (10 + (gait.stride * 35)) * (0.8 + gait.intensity * 0.4) * (0.5 + moodFactor);
      const effectiveS = s < 0 ? s * 0.5 : s;
      let hip = effectiveS * hipMult;
      hip -= torsoLean * 0.2;

      let knee = 0;
      let foot = 0;

      const normalizedPhase = (phaseValue + Math.PI * 2) % (Math.PI * 2);
      const isGrounded = normalizedPhase >= Math.PI;

      if (isGrounded) {
        const stanceProgress = (normalizedPhase - Math.PI) / Math.PI;
        const downBend = 25 * (gait.gravity + gait.bends * 0.2);
        const passingStraightness = 5;

        if (stanceProgress < 0.3) {
          const t = stanceProgress / 0.3;
          knee = lerp(0, downBend, easeInOutQuint(t));
        } else {
          const t = (stanceProgress - 0.3) / 0.7;
          knee = lerp(downBend, passingStraightness, t);
        }
        knee += gait.ground_drag * 15;

        const shinGlobalAngle = hip + knee;
        const flatFootAngle = -shinGlobalAngle + gait.foot_angle_on_ground;

        const heelStrikeAngle = 30;
        const toeOffAngle = -90 * (1 - gait.ground_drag * 0.4);

        if (stanceProgress < 0.1) {
          const t = stanceProgress / 0.1;
          foot = lerp(heelStrikeAngle, flatFootAngle, t);
        } else if (stanceProgress <= 0.7) {
          foot = flatFootAngle;
        } else {
          const t = (stanceProgress - 0.7) / 0.3;
          const heelLiftAngle = lerp(0, toeOffAngle, t) * gait.foot_roll;
          foot = flatFootAngle + heelLiftAngle;
        }

        const slideProgress = Math.sin(stanceProgress * Math.PI);
        const slideAmount = slideProgress * gait.foot_slide * 40 * (1 + gait.gravity * 0.5);
        hip += slideAmount;
        knee -= slideAmount * 0.5;
      } else {
        const swingProgressLinear = normalizedPhase / Math.PI;
        const swingArcHeight = Math.sin(normalizedPhase);

        const clearanceBend = (gait.stride + gait.intensity) * 35 * swingArcHeight;
        const hoverLift = gait.hover_height * 40 * swingArcHeight;
        const dragFactor = Math.pow(1 - swingProgressLinear, 5);
        const dragBend = dragFactor * 80 * gait.bends * (1 + gait.ground_drag * 0.5);
        const kickForce = -Math.pow(1 - swingProgressLinear, 4) * gait.kick_up_force * 50;

        knee = clearanceBend + hoverLift + dragBend + kickForce;

        const footDragAngle = Math.cos(swingProgressLinear * Math.PI) * -45;
        const footFlickAngle = swingArcHeight * gait.toe_lift * 60;
        foot = footDragAngle + footFlickAngle;
      }

      const shinTiltAmplitude = 25 * gait.shin_tilt * (0.5 + gait.intensity);
      knee += Math.cos(phaseValue + (Math.PI / 4)) * shinTiltAmplitude;

      return { hip, knee, foot, grounded: isGrounded };
    };

    const lLeg = calculateLegAngles(strideVal, phase);
    const rLeg = calculateLegAngles(counterStride, phase + Math.PI);

    const nextPose: Pose = {
      ...basePose,
      root: {
        x: basePose.root.x + bodySwayX * depth,
        y: basePose.root.y + bobbing * depth,
      },
      waist: basePose.waist + (waistTwist + waistSway) * depth,
      torso: basePose.torso + torsoLean * depth,
      collar: basePose.collar + (-torsoLean * 0.7 + (moodFactor * 15) - waistSway * 0.6) * depth,
      head: basePose.head + (-torsoLean * 0.2 - (moodFactor * 20) + (gait.head_spin * 180)) * depth,
      lShoulder: basePose.lShoulder + counterStride * armSwingMagnitude * depth,
      lForearm: basePose.lForearm + (baseElbowBend + (lElbowDrive * dynamicElbowAmplitude)) * depth,
      lWrist: basePose.lWrist + lWristDrive * 50 * gait.wrist_swing * depth,
      rShoulder: basePose.rShoulder + strideVal * armSwingMagnitude * depth,
      rForearm: basePose.rForearm + (baseElbowBend + (rElbowDrive * dynamicElbowAmplitude)) * depth,
      rWrist: basePose.rWrist + rWristDrive * 50 * gait.wrist_swing * depth,
      lThigh: basePose.lThigh + lLeg.hip * depth,
      lCalf: basePose.lCalf + lLeg.knee * depth,
      lAnkle: basePose.lAnkle + lLeg.foot * depth,
      rThigh: basePose.rThigh + rLeg.hip * depth,
      rCalf: basePose.rCalf + rLeg.knee * depth,
      rAnkle: basePose.rAnkle + rLeg.foot * depth,
    };

    return nextPose;
  }, []);

  const applyWalkingFootLocks = useCallback((
    pose: Pose,
    phase: number,
    lockRef: { left: { active: boolean; pos: Vector2D; blend: number }; right: { active: boolean; pos: Vector2D; blend: number } },
    pinMode: 'none' | 'leftFoot' | 'rightFoot' | 'dual',
    dt: number,
    gait: WalkingEngineGait,
  ): Pose => {
    const joints = getJointPositions(pose, ['root']);
    const leftPhase = (phase + Math.PI * 2) % (Math.PI * 2);
    const rightPhase = (phase + Math.PI) % (Math.PI * 2);
    const leftGrounded = leftPhase >= Math.PI;
    const rightGrounded = rightPhase >= Math.PI;

    const leftAllowed = pinMode === 'leftFoot' || pinMode === 'dual';
    const rightAllowed = pinMode === 'rightFoot' || pinMode === 'dual';

    const dtFactor = clampNumber(dt / 16.67, 0.5, 3);
    const blendRate = clampNumber(dt * 0.007, 0, 1);
    const slideRateBase = clampNumber(dt * 0.0025, 0, 0.15);
    const slideBoost = (gait.foot_slide * 0.2 + gait.ground_drag * 0.1) * dtFactor;

    const updateLock = (side: 'left' | 'right', grounded: boolean, allowed: boolean, footTip?: Vector2D) => {
      const lock = lockRef[side];
      const targetBlend = grounded && allowed ? 1 : 0;
      lock.blend = lerp(lock.blend, targetBlend, blendRate);
      lock.active = lock.blend > 0.01;

      if (allowed && grounded && footTip) {
        if (!lock.active || lock.pos.y === 0) {
          lock.pos = { x: footTip.x, y: FLOOR_HEIGHT };
        }
        const slideRate = clampNumber(slideRateBase + slideBoost, 0, 0.35);
        lock.pos = {
          x: lerp(lock.pos.x, footTip.x, slideRate),
          y: FLOOR_HEIGHT,
        };
      }
    };

    updateLock('left', leftGrounded, leftAllowed, joints.lFootTip);
    updateLock('right', rightGrounded, rightAllowed, joints.rFootTip);

    const adjustments: { x: number; y: number; w: number }[] = [];
    if (lockRef.left.active && joints.lFootTip) {
      adjustments.push({
        x: lockRef.left.pos.x - joints.lFootTip.x,
        y: lockRef.left.pos.y - joints.lFootTip.y,
        w: lockRef.left.blend,
      });
    }
    if (lockRef.right.active && joints.rFootTip) {
      adjustments.push({
        x: lockRef.right.pos.x - joints.rFootTip.x,
        y: lockRef.right.pos.y - joints.rFootTip.y,
        w: lockRef.right.blend,
      });
    }

    let nextPose = pose;
    if (adjustments.length) {
      const totalW = adjustments.reduce((acc, curr) => acc + curr.w, 0);
      const sum = adjustments.reduce((acc, curr) => ({ x: acc.x + curr.x * curr.w, y: acc.y + curr.y * curr.w }), { x: 0, y: 0 });
      const avg = totalW > 0 ? { x: sum.x / totalW, y: sum.y / totalW } : { x: 0, y: 0 };
      const lockStrength = clampNumber(0.35 + 0.65 * Math.max(lockRef.left.blend, lockRef.right.blend), 0, 1);
      nextPose = {
        ...pose,
        root: {
          x: pose.root.x + avg.x * lockStrength,
          y: pose.root.y + avg.y * lockStrength,
        },
      };
    } else if (pinMode === 'none') {
      const lFootY = joints.lFootTip?.y ?? -Infinity;
      const rFootY = joints.rFootTip?.y ?? -Infinity;
      const lowest = Math.max(lFootY, rFootY);
      if (Number.isFinite(lowest)) {
        const correction = FLOOR_HEIGHT - lowest;
        const floorBlend = clampNumber(dt * 0.008, 0, 1);
        nextPose = {
          ...pose,
          root: {
            x: pose.root.x,
            y: pose.root.y + correction * floorBlend,
          },
        };
      }
    }

    const blendLegPose = (base: Pose, target: Pose, parts: PartName[], weight: number) => {
      if (weight <= 0) return base;
      const blended = { ...base };
      for (const part of parts) {
        const key = partNameToPoseKey[part];
        const currentVal = (base as any)[key] ?? 0;
        const targetVal = (target as any)[key] ?? currentVal;
        const delta = getShortestAngleDiffDeg(targetVal, currentVal);
        (blended as any)[key] = currentVal + delta * weight;
      }
      return blended;
    };

    const postRootJoints = getJointPositions(nextPose, ['root']);
    if (lockRef.left.active && postRootJoints.lFootTip) {
      const solve = solveIK(nextPose, 'lLeg', lockRef.left.pos, 6, [PartName.Waist]);
      nextPose = blendLegPose(nextPose, solve, [PartName.LThigh, PartName.LSkin, PartName.LAnkle], clampNumber(lockRef.left.blend * 0.85, 0, 1));
    }
    if (lockRef.right.active && postRootJoints.rFootTip) {
      const solve = solveIK(nextPose, 'rLeg', lockRef.right.pos, 6, [PartName.Waist]);
      nextPose = blendLegPose(nextPose, solve, [PartName.RThigh, PartName.RSkin, PartName.RAnkle], clampNumber(lockRef.right.blend * 0.85, 0, 1));
    }

    return nextPose;
  }, []);

  const computeWalkingPose = useCallback((timeMs: number) => {
    const gait = walkingGaitRef.current;
    const basePose = walkingBasePoseRef.current;
    const depth = clampNumber(gaitDepth / 100, 0, 1);

    const lastTime = walkingLastTimeRef.current || timeMs;
    const dt = Math.max(0, timeMs - lastTime);
    walkingLastTimeRef.current = timeMs;

    const phaseAdvance = dt * 0.005 * gait.frequency * walkingSpeed;
    walkingPhaseRef.current = (walkingPhaseRef.current + phaseAdvance) % (Math.PI * 2);
    const phase = walkingPhaseRef.current;

    let pose = buildWalkingPose(phase, basePose, gait, depth);
    pose = applyWalkingFootLocks(pose, phase, walkingFootLockRef.current, walkingPinMode, dt, gait);

    return pose;
  }, [applyWalkingFootLocks, buildWalkingPose, gaitDepth, walkingPinMode, walkingSpeed]);

  useEffect(() => {
    setIsUserInteracting(walkingEnabled);
  }, [walkingEnabled]);

  useEffect(() => {
    if (!walkingEnabled || !isPoweredOn) return;
    let rafId: number;
    const tick = (timeMs: number) => {
      const pose = computeWalkingPose(timeMs);
      setGhostPose(pose);
      setActivePose(pose);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [walkingEnabled, isPoweredOn, computeWalkingPose]);

  const [windowSize, setWindowSize] = useState({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  });

  useEffect(() => {
    walkingGaitRef.current = walkingGait;
  }, [walkingGait]);

  useEffect(() => {
    if (!walkingEnabled) return;
    walkingBasePoseRef.current = activePose;
    walkingPhaseRef.current = 0;
    walkingLastTimeRef.current = performance.now();
    walkingFootLockRef.current = {
      left: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
      right: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
    };
  }, [walkingEnabled]);

  // --- Panel Management for the settings panels ---
  const DOCK_WIDTH = 280;
  const DOCK_GAP = 8;
  const dockOrder = useMemo(
    () => [
      'model-settings-panel',
      'movement-settings-panel',
    ],
    []
  );

  // Panel Z-index management for the settings panels
  const [panelZIndices, setPanelZIndices] = useState<Record<string, number>>({
    'model-settings-panel': 101,
    'movement-settings-panel': 102,
  });
  const nextZIndex = useRef<number>(103);

  const bringPanelToFront = useCallback((id: string) => {
    setPanelZIndices(prev => {
      const newZIndices = { ...prev };
      newZIndices[id] = nextZIndex.current++;
      return newZIndices;
    });
  }, []);

  // --- Panel Position/Size Management for the settings panels ---
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>({
    'model-settings-panel': { id: 'model-settings-panel', x: 0, y: 0, width: DOCK_WIDTH, height: 700, minimized: false },
    'movement-settings-panel': { id: 'movement-settings-panel', x: 0, y: 0, width: DOCK_WIDTH, height: 600, minimized: true },
  });

  const updatePanelRect = useCallback((id: string, newRect: Omit<PanelRect, 'x' | 'y'>) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.width !== newRect.width || existingRect.height !== newRect.height || existingRect.minimized !== newRect.minimized) {
        return { ...prev, [id]: { ...existingRect, ...newRect } };
      }
      return prev;
    });
  }, []);

  const updatePanelPosition = useCallback((id: string, newX: number, newY: number, minimized: boolean) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.x !== newX || existingRect.y !== newY || existingRect.minimized !== minimized) {
        return { ...prev, [id]: { ...existingRect, x: newX, y: newY, minimized: minimized } };
      }
      return prev;
    });
  }, []);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'joint-control': true,
    'pin-options': false,
    'display-modes': false,
    'animation-engine': false,
    'ab-engine': true,
    'saved-poses': true,
    'system-monitor': false,
    'hotkey-commands': false,
    'system-roadmap': false,
    'pose-export': false,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // --- End Panel Position/Size Management ---
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs(prev => [...prev.slice(-49), { timestamp, message }]);
  }, []);

  useEffect(() => {
    addLog('[SYSTEM]: BOOT SEQUENCE COMPLETE');
  }, [addLog]);

  // Dynamically calculate viewBox based on viewMode and windowSize
  const autoViewBox = useMemo(() => {
    const configs = {
      zoomed: { x: -900, y: 1950, w: 1800, h: 1550 },
      default: { x: -1112.5, y: 1287.5, w: 2225, h: 2212.5 },
      lotte: { x: -1325, y: 625, w: 2650, h: 2875 },
      wide: { x: -1750, y: -700, w: 3500, h: 4200 },
    };

    if (viewMode === 'mobile') {
      const screenAspectRatio = windowSize.innerWidth / windowSize.innerHeight;

      const mannequinIntrinsicHeight = (
        ANATOMY.HEAD +
        ANATOMY.HEAD_NECK_GAP_OFFSET +
        ANATOMY.COLLAR +
        ANATOMY.TORSO +
        ANATOMY.WAIST +
        ANATOMY.LEG_UPPER +
        ANATOMY.LEG_LOWER +
        ANATOMY.FOOT
      );

      const verticalPaddingRatio = 0.20;
      const contentHeightInSVGUnits = mannequinIntrinsicHeight * (1 + verticalPaddingRatio);

      const viewBoxHeight = contentHeightInSVGUnits;
      const viewBoxWidth = viewBoxHeight * screenAspectRatio;

      const groundPlaneBuffer = GROUND_STRIP_HEIGHT * 1.5;
      const desiredViewBoxBottom = FLOOR_HEIGHT + groundPlaneBuffer;
      const viewBoxY = desiredViewBoxBottom - viewBoxHeight;
      const viewBoxX = -viewBoxWidth / 2;

      return `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;

    } else {
      const c = configs[viewMode];
      return `${c.x} ${c.y} ${c.w} ${c.h}`;
    }
  }, [viewMode, windowSize.innerWidth, windowSize.innerHeight]);

  // --- Physics Validation Logic ---
  const isValidMove = useCallback((
    potentialPose: Pose,
    originalPose: Pose,
    activePins: AnchorName[],
    pinnedState: Record<string, Vector2D>,
    isCraneDragging: boolean,
    isEffectorDragging: boolean,
    partBeingRotated: PartName | null,
    isAirMode: boolean,
  ): boolean => {
    if (isAirMode) return true;

    const potentialJoints = getJointPositions(potentialPose, activePins);
    
    // 1. Check Pin Immovability (Softened by Elasticity)
    // In Bitruvius 0.2, pins are elastic, but we still have a "Hard Stop" threshold
    const HARD_STOP_THRESHOLD = 300; // Maximum stretch before hard stop

    for (const pinName of activePins) {
      const targetPos = pinnedState[pinName];
      const currentPos = potentialJoints[pinName as keyof typeof potentialJoints];
      
      if (targetPos && currentPos && !isCraneDragging) {
        const dx = currentPos.x - targetPos.x;
        const dy = currentPos.y - targetPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > HARD_STOP_THRESHOLD) {
          return false;
        }
      }
    }

    // 2. Check Ground Collision
    const isFootRelatedPart = (part: PartName | null) =>
      part === PartName.LAnkle || part === PartName.RAnkle || part === PartName.LSkin || part === PartName.RSkin; 

    const relevantToGrounding = isCraneDragging || isEffectorDragging || isFootRelatedPart(partBeingRotated);
    
    if (relevantToGrounding) {
      const lFootTipY = potentialJoints.lFootTip?.y || -Infinity;
      const rFootTipY = potentialJoints.rFootTip?.y || -Infinity;
      const lowestFootTipY = Math.max(lFootTipY, rFootTipY);

      const GROUND_COLLISION_THRESHOLD = 2;
      if (lowestFootTipY > FLOOR_HEIGHT + GROUND_COLLISION_THRESHOLD) {
          return false;
      }
    }

    return true;
  }, [isAirMode]); 

  const validateAndApplyPoseUpdate = useCallback((
      proposedUpdates: Partial<Pose>,
      partBeingDirectlyManipulated: PartName | null,
      isEffectorDrag: boolean,
  ) => {
      setGhostPose(prev => {
          let tentativeNextPose: Pose = { ...prev, ...proposedUpdates };

          if (bodySyncMode && partBeingDirectlyManipulated) {
            const oppositeMap: Record<string, string> = {
              'lShoulder': 'rShoulder', 'rShoulder': 'lShoulder',
              'lForearm': 'rForearm', 'rForearm': 'lForearm',
              'lWrist': 'rWrist', 'rWrist': 'lWrist',
              'lThigh': 'rThigh', 'rThigh': 'lThigh',
              'lCalf': 'rCalf', 'rCalf': 'lCalf',
              'lAnkle': 'rAnkle', 'rAnkle': 'lAnkle',
            };
            const directKey = partNameToPoseKey[partBeingDirectlyManipulated];
            const oppositeKey = oppositeMap[directKey];
            if (oppositeKey) {
              const delta = ((proposedUpdates as any)[directKey] || 0) - ((prev as any)[directKey] || 0);
              (tentativeNextPose as any)[oppositeKey] = ((prev as any)[oppositeKey] || 0) - delta;
            }
          }

          if (omniSyncMode) {
            const rotationKeys = new Set<string>([...Object.values(partNameToPoseKey), 'bodyRotation']);
            Object.keys(proposedUpdates).forEach(key => {
              if (!rotationKeys.has(key)) return;
              const delta = ((proposedUpdates as any)[key] || 0) - ((prev as any)[key] || 0);
              if (Math.abs(delta) < 0.01) return;
              rotationKeys.forEach(otherKey => {
                if (otherKey === key) return;
                (tentativeNextPose as any)[otherKey] = ((tentativeNextPose as any)[otherKey] || (prev as any)[otherKey] || 0) + delta * 0.08;
              });
            });
          }

          if (!isValidMove(
              tentativeNextPose,
              prev,
              activePins,
              pinnedState,
              isCraneDragging, 
              isEffectorDrag,
              partBeingDirectlyManipulated,
              isAirMode,
          )) {
              return prev;
          }

          // Save to undo stack when making actual changes
          if (isDragging.current && !dragStartPose.current) {
              dragStartPose.current = prev;
          }

          return tentativeNextPose;
      });
  }, [activePins, pinnedState, isAirMode, isCraneDragging, isValidMove]);

  const poseComparisonKeys: (keyof Pose)[] = [
    'bodyRotation', 'torso', 'waist', 'collar', 'head',
    'lShoulder', 'lForearm', 'lWrist', 'rShoulder', 'rForearm', 'rWrist',
    'lThigh', 'lCalf', 'lAnkle', 'rThigh', 'rCalf', 'rAnkle'
  ];

  const posesAreClose = (a: Pose, b: Pose) => {
    if (Math.abs(a.root.x - b.root.x) > 0.01 || Math.abs(a.root.y - b.root.y) > 0.01) return false;
    for (const key of poseComparisonKeys) {
      if (Math.abs((a[key] as number) - (b[key] as number)) > 0.01) return false;
    }
    return true;
  };

  // Exponential Decay Smoothing (Bitruvius 0.1 requirement)
  useEffect(() => {
    if (!isPoweredOn) return;
    if (!isDragging.current && posesAreClose(activePose, ghostPose)) return;
    
    let rafId: number;
    const smooth = () => {
      setActivePose(current => {
        // If not dragging, we can either snap or continue smoothing
        // The "5-frame snap" logic is handled in handleMouseUp
        const smoothingFactor = isDragging.current ? 0.3 : 0.15;
        return interpolatePoses(current, ghostPose, smoothingFactor);
      });
      rafId = requestAnimationFrame(smooth);
    };
    
    rafId = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(rafId);
  }, [activePose, ghostPose, isPoweredOn]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length > 0) {
      const prev = activePose;
      redoStack.current.push(prev); 
      const nextPose = undoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length > 0) {
      const prev = activePose;
      undoStack.current.push(prev);
      const nextPose = redoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!svgRef.current) return;
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX; svgPoint.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

    if (isCraneDragging && dragStartInfo.current) {
      const dx = transformedPoint.x - dragStartInfo.current.startX;
      const dy = transformedPoint.y - dragStartInfo.current.startY;
      
      const newRootX = dragStartInfo.current.startRootX + dx;
      const newRootY = dragStartInfo.current.startRootY + dy;

      validateAndApplyPoseUpdate({ root: { x: newRootX, y: newRootY } }, null, false);
      
    } else if (isAdjusting && rotatingPart && rotationStartInfo.current) {
      const joints = getJointPositions(ghostPose, activePins);
      const pivot = joints[rotatingPart]; 
      if (!pivot) return;
      
      const currentAngleDeg = Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI;
      const startAngleDeg = rotationStartInfo.current.startAngle; 
      
      const angleDeltaDeg = getShortestAngleDiffDeg(currentAngleDeg, startAngleDeg);
      
      let newRotationValue = rotationStartInfo.current.startRotationValue + angleDeltaDeg;
      const partKey = partNameToPoseKey[rotatingPart];
      const limits = JOINT_LIMITS[partKey];

      if (limits) {
        newRotationValue = Math.max(limits.min, Math.min(limits.max, newRotationValue));
      }

      validateAndApplyPoseUpdate({ [partKey]: newRotationValue }, rotatingPart, false);

    } else if (isIKDragging && effectorPart) {
      handleIKMove(effectorPart, transformedPoint);
    }
  }, [isAdjusting, rotatingPart, isCraneDragging, isIKDragging, effectorPart, ghostPose, validateAndApplyPoseUpdate, activePins, handleIKMove]);

  const updatePinnedState = useCallback((pins: AnchorName[]) => {
    const joints = getJointPositions(activePose, pins);
    const newState: Record<string, Vector2D> = {};
    pins.forEach(p => {
      newState[p] = joints[p];
    });
    setPinnedState(newState);
  }, [activePose]);

  const getWalkingPins = useCallback((mode: 'none' | 'leftFoot' | 'rightFoot' | 'dual'): AnchorName[] => {
    if (mode === 'none') return [PartName.Waist];
    if (mode === 'leftFoot') return [PartName.Waist, PartName.LAnkle, 'lFootTip'];
    if (mode === 'rightFoot') return [PartName.Waist, PartName.RAnkle, 'rFootTip'];
    return [PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip'];
  }, []);

  const normalizeWalkingPins = useCallback((pins: AnchorName[], mode: 'none' | 'leftFoot' | 'rightFoot' | 'dual') => {
    const required = getWalkingPins(mode);
    const filtered = pins.filter(pin => {
      if (mode === 'leftFoot') return pin !== PartName.RAnkle && pin !== 'rFootTip';
      if (mode === 'rightFoot') return pin !== PartName.LAnkle && pin !== 'lFootTip';
      if (mode === 'none') return pin !== PartName.LAnkle && pin !== 'lFootTip' && pin !== PartName.RAnkle && pin !== 'rFootTip';
      return true;
    });
    return Array.from(new Set([...filtered, ...required]));
  }, [getWalkingPins]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      // 5-frame snap (Bitruvius 0.1 requirement)
      // We snap activePose to ghostPose immediately on release
      setActivePose(ghostPose);
      
      // Save to undo stack on release
      if (dragStartPose.current) {
        undoStack.current.push(dragStartPose.current);
        redoStack.current.length = 0;
      }
    }

    isDragging.current = false;
    setIsAdjusting(false);
    setRotatingPart(null);
    setIsCraneDragging(false);
    setEffectorPart(null); 
    setIsEffectorDragging(false); 
    setIsIKDragging(false);
    setIsUserInteracting(false); // Reset interaction flag
    rotationStartInfo.current = null;
    dragStartInfo.current = dragStartInfoInitial(); 
  }, [ghostPose, activePose]);

  const handleDoubleClickOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    setJointModes(prev => {
      const currentMode = prev[part];
      let nextMode: JointConstraint;
      if (currentMode === 'fk') {
        nextMode = 'stretch';
      } else if (currentMode === 'stretch') {
        nextMode = 'curl';
      } else if (currentMode === 'curl') {
        nextMode = 'stretch';
      } else {
        nextMode = 'fk';
      }
      return { ...prev, [part]: nextMode };
    });
  }, []);

  useEffect(() => {
    updatePinnedState(activePins);
  }, [activePins]); // Sync pinnedState when activePins change

  useEffect(() => {
    if (!walkingEnabled) return;
    setActivePins(prev => normalizeWalkingPins(prev, walkingPinMode));
  }, [walkingEnabled, walkingPinMode, normalizeWalkingPins]);

  const handleMouseDownOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    if (smartPinning) {
      const smartPinSet: AnchorName[] = [];
      if (part === PartName.LAnkle) smartPinSet.push(PartName.Waist, PartName.LAnkle, 'lFootTip');
      else if (part === PartName.RAnkle) smartPinSet.push(PartName.Waist, PartName.RAnkle, 'rFootTip');
      else if (part === PartName.LWrist) smartPinSet.push(PartName.Waist, PartName.LWrist, 'lHandTip');
      else if (part === PartName.RWrist) smartPinSet.push(PartName.Waist, PartName.RWrist, 'rHandTip');

      if (walkingEnabled) {
        setActivePins(prev => normalizeWalkingPins([...prev, ...smartPinSet], walkingPinMode));
      } else {
        setActivePins(smartPinSet);
      }
    }
    isDragging.current = true;
    dragStartPose.current = activePose;
    setSelectedParts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => next[k as PartName] = k === part);
      return next;
    });

    const joints = getJointPositions(activePose, activePins);
    const pivot = joints[part]; 
    if (!pivot) return;

    // If part is pinned OR global IK is active OR joint mode is 'stretch', use IK instead of rotation
    const isLimbPart = [PartName.RWrist, PartName.LWrist, PartName.RAnkle, PartName.LAnkle].includes(part);
    const isStretchMode = jointModes[part] === 'stretch';
    
    if (activePins.includes(part) || (kinematicMode !== 'fk' && isLimbPart) || (isStretchMode && isLimbPart)) {
      setIsIKDragging(true);
      setEffectorPart(part);
    } else {
      const svgPoint = svgRef.current.createSVGPoint();
      svgPoint.x = e.clientX; svgPoint.y = e.clientY;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

      setIsAdjusting(true);
      setRotatingPart(part);
      rotationStartInfo.current = {
        startAngle: Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI,
        startRotationValue: (activePose as any)[partNameToPoseKey[part]] || 0,
        pointerX: transformedPoint.x, pointerY: transformedPoint.y, initialPinnedPos: null // Not used in Bitruvius 0.2
      };
    }
  }, [activePose, activePins, kinematicMode, jointModes, smartPinning, walkingEnabled, walkingPinMode, normalizeWalkingPins]);

  const cycleKinematicMode = useCallback(() => {
    setKinematicMode(prev => {
      let next: KinematicMode;
      if (prev === 'fk') next = 'ik';
      else if (prev === 'ik') next = 'fabrik';
      else if (prev === 'fabrik') next = 'jacobian';
      else if (prev === 'jacobian') next = 'pim2';
      else if (prev === 'pim2') next = 'dls';
      else if (prev === 'dls') next = 'fluid';
      else next = 'fk';
      addLog(`[SYSTEM]: KINEMATIC MODE -> ${next.toUpperCase()}`);
      return next;
    });
  }, [addLog]);
  const cycleRenderMode = useCallback(() => {
    setRenderMode(prev => {
      if (prev === 'default') return 'wireframe';
      if (prev === 'wireframe') return 'silhouette';
      if (prev === 'silhouette') return 'backlight';
      if (prev === 'backlight') return 'default';
      return 'default';
    });
  }, []);

  const cycleViewMode = useCallback(() => {
    setViewMode(prev => {
      if (prev === 'default') return 'lotte';
      if (prev === 'lotte') return 'wide';
      if (prev === 'wide') return 'mobile';
      if (prev === 'mobile') return 'zoomed';
      if (prev === 'zoomed') return 'default';
      return 'default';
    });
  }, []);

  // Handler for toggling the minimized state of the settings panels
  const toggleSettingsPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['model-settings-panel'];
      return {
        ...prev,
        'model-settings-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('model-settings-panel'); // Bring to front when toggled
  }, [bringPanelToFront]);

  const toggleMovementPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['movement-settings-panel'];
      return {
        ...prev,
        'movement-settings-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('movement-settings-panel');
  }, [bringPanelToFront]);

  const toggleSystemStatusPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['system-status-panel'];
      return {
        ...prev,
        'system-status-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('system-status-panel');
  }, [bringPanelToFront]);

  const toggleCommandLogPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['command-log-panel'];
      return {
        ...prev,
        'command-log-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('command-log-panel');
  }, [bringPanelToFront]);

  const togglePoseDataPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['pose-data-terminal-panel'];
      return {
        ...prev,
        'pose-data-terminal-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('pose-data-terminal-panel');
  }, [bringPanelToFront]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v') cycleViewMode();
      if (e.key === 'p') {
        setActivePins(prev => {
          const cycle = [PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip', 'root'];
          const currentPrimary = prev[0] || PartName.Waist;
          const currentIndex = cycle.indexOf(currentPrimary);
          const nextPrimary = cycle[(currentIndex + 1) % cycle.length] as AnchorName;
          
          if (e.shiftKey) {
            if (prev.includes(nextPrimary)) {
              return prev.filter(p => p !== nextPrimary);
            } else {
              return [...prev, nextPrimary];
            }
          } else {
            return [nextPrimary];
          }
        });
      }
      if (e.key === 'r') cycleRenderMode();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleResize = () => {
      setWindowSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
      // Adjust panel position on resize if it would go off-screen
      setPanelRects(prev => {
        const modelPanel = prev['model-settings-panel'];
        const movementPanel = prev['movement-settings-panel'];
        
        const newModelX = Math.min(modelPanel.x, window.innerWidth - modelPanel.width - 16);
        const newModelY = Math.min(modelPanel.y, window.innerHeight - (modelPanel.minimized ? 40 : modelPanel.height) - 16);
        
        const newMovementX = Math.min(movementPanel.x, window.innerWidth - movementPanel.width - 16);
        const newMovementY = Math.min(movementPanel.y, window.innerHeight - (movementPanel.minimized ? 40 : movementPanel.height) - 16);
        
        return {
          ...prev,
          'model-settings-panel': { ...modelPanel, x: newModelX, y: newModelY },
          'movement-settings-panel': { ...movementPanel, x: newMovementX, y: newMovementY }
        };
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [handleMouseMove, handleMouseUp, handleUndo, handleRedo, cycleRenderMode, cycleViewMode]);

  const getPinName = useCallback((pins: AnchorName[]): string => {
    if (pins.length === 0) return 'NONE';
    return pins.map(p => {
      if (p === PartName.LAnkle) return 'L-ANKLE';
      if (p === 'lFootTip') return 'L-FOOT';
      if (p === PartName.LWrist) return 'L-WRIST';
      if (p === 'lHandTip') return 'L-HAND';
      if (p === PartName.RAnkle) return 'R-ANKLE';
      if (p === 'rFootTip') return 'R-FOOT';
      if (p === PartName.RWrist) return 'R-WRIST';
      if (p === 'rHandTip') return 'R-HAND';
      if (p === 'root') return 'ROOT';
      return String(p).toUpperCase();
    }).join(' + ');
  }, []);

  const getOppositePart = (part: PartName): PartName | null => {
    return getMirrorPart(part);
  };

  const getKineticModeDisplayName = (mode: JointConstraint) => {
    switch (mode) {
      case 'fk': return 'STANDARD (No Effects)';
      case 'offset': return 'OFFSET (PULLS PARENT)';
      case 'match': return 'MATCH (PULLS CHILD)';
      default: return 'UNKNOWN';
    }
  };

  const getKineticModeShortLabel = (mode: JointConstraint) => {
    switch (mode) {
      case 'fk': return 'STANDARD';
      case 'offset': return 'OFFSET';
      case 'match': return 'MATCH';
      default: return 'UNKNOWN';
    }
  };

  const getKineticModeDisplayColorClass = (mode: JointConstraint) => {
    switch (mode) {
      case 'offset': return 'text-accent-purple';
      case 'match': return 'text-accent-green';
      case 'fk': return 'text-focus-ring';
      default: return 'text-white/70';
    }
  };

  const getRenderModeDisplayName = (mode: RenderMode) => {
    switch (mode) {
      case 'default': return 'STANDARD (Solid)';
      case 'wireframe': return 'WIREFRAME (Outline)';
      case 'silhouette': return 'MONOCHROME (Black Fill)';
      case 'backlight': return 'X-RAY (Transparent)';
      case 'spotlight': return 'SPOTLIGHT (Subject)';
      case 'shadow': return 'SHADOW (Blur)';
      case 'grayscale': return 'GRAYSCALE';
      case 'sepia': return 'SEPIA';
      case 'palette': return 'PALETTE (Custom)';
      default: return 'UNKNOWN';
    }
  };

  const kinematicModeDescriptions: Record<KinematicMode, string> = {
    fk: 'FK: direct joint rotation, no target solving.',
    ik: 'IK (CCD): iterative joint rotation toward target.',
    fabrik: 'FABRIK: forward/backward reaching with fixed bone lengths.',
    jacobian: 'Jacobian: gradient-based solver for smoother convergence.',
    pim2: 'PIM2: predictive IK with faster convergence.',
    dls: 'DLS: damped least squares for stability near singularities.',
    fluid: 'Fluid: soft, continuous IK with pinned constraints.',
  };

  const renderModePresets: Record<RenderMode, { showPins: boolean; showBoneOverlay: boolean; maskControlsVisible: boolean }> = {
    default: { showPins: true, showBoneOverlay: true, maskControlsVisible: false },
    wireframe: { showPins: true, showBoneOverlay: false, maskControlsVisible: false },
    silhouette: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    backlight: { showPins: false, showBoneOverlay: true, maskControlsVisible: false },
    spotlight: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    shadow: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    grayscale: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    sepia: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    palette: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
  };

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '');
    const value = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean;
    const num = parseInt(value, 16);
    return {
      r: ((num >> 16) & 255) / 255,
      g: ((num >> 8) & 255) / 255,
      b: (num & 255) / 255,
    };
  };

  const paletteMatrix = useMemo(() => {
    const shadow = hexToRgb(paletteColors.shadow);
    const mid = hexToRgb(paletteColors.mid);
    const highlight = hexToRgb(paletteColors.highlight);
    const r = `${shadow.r} ${mid.r} ${highlight.r}`;
    const g = `${shadow.g} ${mid.g} ${highlight.g}`;
    const b = `${shadow.b} ${mid.b} ${highlight.b}`;
    return { r, g, b };
  }, [paletteColors]);

  const sceneFilter = useMemo(() => {
    if (renderMode === 'grayscale') return 'grayscale(1)';
    if (renderMode === 'sepia') return 'sepia(1)';
    return 'none';
  }, [renderMode]);

  const backgroundModeOpacity = useMemo(() => {
    if (renderMode === 'spotlight') return 0.35;
    if (renderMode === 'shadow') return 0.2;
    return 1;
  }, [renderMode]);

  const getMaskBaseSize = (part: PartName) => {
    switch (part) {
      case PartName.Head:
        return ANATOMY.HEAD * 1.6;
      case PartName.Torso:
        return ANATOMY.TORSO * 1.4;
      case PartName.Waist:
        return ANATOMY.WAIST * 1.4;
      case PartName.Collar:
        return ANATOMY.COLLAR * 2;
      case PartName.RShoulder:
      case PartName.LShoulder:
        return ANATOMY.UPPER_ARM * 1.4;
      case PartName.RElbow:
      case PartName.LElbow:
        return ANATOMY.LOWER_ARM * 1.4;
      case PartName.RWrist:
      case PartName.LWrist:
        return ANATOMY.HAND * 1.8;
      case PartName.RThigh:
      case PartName.LThigh:
        return ANATOMY.LEG_UPPER * 1.4;
      case PartName.RSkin:
      case PartName.LSkin:
        return ANATOMY.LEG_LOWER * 1.4;
      case PartName.RAnkle:
      case PartName.LAnkle:
        return ANATOMY.FOOT * 1.8;
      default:
        return ANATOMY.HEAD * 1.6;
    }
  };


  const allPanelRectsArray = useMemo(() => Object.values(panelRects), [panelRects]);
  const settingsPanel = panelRects['model-settings-panel'];
  const movementPanel = panelRects['movement-settings-panel'];

  const panelQuickAccessButtons = useMemo(() => {
    const labels = ['M', 'MV'];
    const panelIds = ['model-settings-panel', 'movement-settings-panel'];
    
    return labels.map((label, index) => ({
      label,
      panelId: panelIds[index],
      rect: panelRects[panelIds[index] as keyof typeof panelRects],
      zIndex: panelZIndices[panelIds[index] as keyof typeof panelZIndices],
    }));
  }, [panelRects, panelZIndices]);
  const resolvedBackgroundLayer = { ...DEFAULT_IMAGE_LAYER, ...backgroundImageLayer };
  const resolvedForegroundLayer = { ...DEFAULT_IMAGE_LAYER, ...foregroundImageLayer };
  const backgroundPlacement = resolvedBackgroundLayer.src ? resolveLayerPlacement(resolvedBackgroundLayer) : null;
  const foregroundPlacement = resolvedForegroundLayer.src ? resolveLayerPlacement(resolvedForegroundLayer) : null;
  const bgOpacityPercent = Math.round(clampNumber(resolvedBackgroundLayer.opacity ?? 1, 0, 1) * 100);
  const fgOpacityPercent = Math.round(clampNumber(resolvedForegroundLayer.opacity ?? 1, 0, 1) * 100);
  const bgScalePercent = clampNumber(resolvedBackgroundLayer.scale ?? 100, 10, 400);
  const fgScalePercent = clampNumber(resolvedForegroundLayer.scale ?? 100, 10, 400);
  const bgXPercent = clampNumber(resolvedBackgroundLayer.x ?? 50, 0, 100);
  const bgYPercent = clampNumber(resolvedBackgroundLayer.y ?? 50, 0, 100);
  const fgXPercent = clampNumber(resolvedForegroundLayer.x ?? 50, 0, 100);
  const fgYPercent = clampNumber(resolvedForegroundLayer.y ?? 50, 0, 100);
  const activeMaskLayer = activeMaskEditorPart
    ? { ...DEFAULT_BODY_PART_MASK_LAYER, ...(bodyPartMaskLayers[activeMaskEditorPart] ?? {}) }
    : null;

  // Missing essential variables
  const [showGhost, setShowGhost] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);

  // Computed values for part selection and interaction
  const primarySelectedPart = useMemo(() => {
    return (Object.entries(selectedParts).find(([p, sel]) => sel)?.[0]) as PartName | undefined;
  }, [selectedParts]);

  const selectedRotation = useMemo(() => {
    if (!primarySelectedPart) return 0;
    const key = partNameToPoseKey[primarySelectedPart];
    return (activePose as any)[key] || 0;
  }, [activePose, primarySelectedPart]);

  // Missing essential functions
  const handleMouseDownOnRoot = useCallback((e: React.MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    isDragging.current = true;
    dragStartPose.current = activePose;
    if (!svgRef.current) return;
    
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX; svgPoint.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());
    
    dragStartInfo.current = {
      startX: transformedPoint.x,
      startY: transformedPoint.y,
      startRootX: activePose.root?.x ?? 0,
      startRootY: activePose.root?.y ?? 0
    };
    
    setIsCraneDragging(true);
  }, [activePose]);

  const openPanel = useCallback((panelId: string) => {
    setPanelRects(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], minimized: false }
    }));
    bringPanelToFront(panelId);
  }, [bringPanelToFront]);

  const handlePartRotationWheelChange = useCallback((newValue: number) => {
    if (!primarySelectedPart) return;
    const partKey = partNameToPoseKey[primarySelectedPart];
    setActivePose(prev => ({ ...prev, [partKey]: newValue }));
  }, [primarySelectedPart]);

  return (
    <div className={`w-full h-full bg-mono-darker shadow-2xl flex flex-col relative touch-none fixed inset-0 z-50 overflow-hidden text-ink font-mono ${!isPoweredOn ? 'grayscale brightness-50' : ''} safe-area-inset`}>
      <div className="relative flex h-full w-full">
        
        {/* Top Left: System Status */}
        <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1">
          <span className="text-[8px] text-white/40 uppercase">System_Status</span>
          <div className="flex items-center gap-2 bg-black/40 px-2 py-1 border border-white/10 rounded">
            <div className={`w-1.5 h-1.5 rounded-full ${isPoweredOn ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
            <span className="text-[9px] font-bold text-white/70 tracking-widest">
              {isPoweredOn ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>
        </div>

        {/* Top Right: Consolidated Controls */}
        <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2 bg-black/20 backdrop-blur-sm p-1 border border-white/10 rounded-full">
          {/* Kinematic Mode Toggle */}
          <button
            onClick={cycleKinematicMode}
            className={`px-3 py-2 rounded-full border transition-all duration-300 flex items-center gap-2 ${kinematicMode !== 'fk' 
              ? 'bg-accent-purple/30 border-accent-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]' 
              : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
            }`}
            aria-label={`Kinematic Mode: ${kinematicMode.toUpperCase()}`}
          >
            <span className="text-[10px] font-bold tracking-tighter">{kinematicMode.toUpperCase()}</span>
          </button>

          {/* Power/Activation Button */}
          <button
            onClick={() => setIsPoweredOn(!isPoweredOn)}
            className={`p-2 rounded-full border transition-all duration-300 ${isPoweredOn 
              ? 'bg-accent-green/30 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
              : 'bg-accent-red/30 border-accent-red text-accent-red opacity-50'
            }`}
            aria-label={isPoweredOn ? "System Shutdown" : "System Activation"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>

          {/* Settings Toggle Button */}
          <button
            onClick={toggleSettingsPanelMinimized}
            className={`p-2 bg-white/10 hover:bg-white/20 rounded-full border border-white/20 text-white hover:text-focus-ring transition-all duration-200 ${!settingsPanel.minimized ? 'border-selection text-selection bg-selection/20' : ''}`}
            aria-label={settingsPanel.minimized ? "Open Model Settings" : "Close Model Settings"}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.243 14.757l-.37-.37c-.63.63-1.39 1.05-2.22 1.25l-.23.95a.996.996 0 01-1.22.75l-2-.5a.996.996 0 01-.75-1.22l.23-.95c-.83-.2-1.59-.62-2.22-1.25l-.37.37a.997.997 0 01-1.41 0l-.707-.707a.997.997 0 010-1.414l.37-.37c-.63-.63-1.05-1.39-1.25-2.22l-.95-.23a.996.996 0 01-.75-1.22l.5-2a.996.996 0 011.22-.75l.95.23c.2-.83.62-1.59 1.25-2.22l-.37-.37a.997.997 0 010-1.414l.707-.707a.997.997 0 011.414 0l.37.37c.63-.63 1.39-1.05 2.22-1.25l.23-.95a.996.996 0 011.22-.75l2 .5a.996.996 0 01.75 1.22l-.23.95c.83.2 1.59.62 2.22 1.25l.37-.37a.997.997 0 011.414 0l.707.707a.997.997 0 010 1.414l-.37.37c.63.63 1.05 1.39 1.25 2.22l.95.23a.996.996 0 01.75 1.22l-.5 2a.996.996 0 01-1.22.75l-.95-.23c-.2.83-.62 1.59-1.25-2.22l.37.37a.997.997 0 010 1.414l-.707.707a.997.997 0 01-1.414 0zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" fillRule="evenodd"></path>
            </svg>
          </button>
        </div>

        {/* SVG Canvas */}
        <svg 
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          viewBox={autoViewBox}
          onMouseDown={handleMouseDownOnRoot}
        >
          <Scanlines />
          <SystemGuides />
          
          <Mannequin
            pose={activePose}
            ghostPose={showGhost ? ghostPose : undefined}
            showOverlay={showOverlay}
            selectedParts={selectedParts}
            visibility={visibility}
            activePins={activePins}
            pinnedState={pinnedState}
            onMouseDownOnPart={handleMouseDownOnPart}
            onDoubleClickOnPart={handleDoubleClickOnPart}
            onMouseDownOnRoot={handleMouseDownOnRoot}
            jointModes={jointModes}
            renderMode={renderMode}
          />
        </svg>

        {/* MODEL SETTINGS PANEL */}
        <DraggablePanel
          id="model-settings-panel"
          title="MODEL SETTINGS"
          x={settingsPanel.x}
          y={settingsPanel.y}
          minimized={settingsPanel.minimized}
          onUpdateRect={(id, rect) => updatePanelRect(id, rect)}
          onUpdatePosition={(id, x, y, minimized) => updatePanelPosition(id, x, y, minimized)}
          allPanelRects={allPanelRectsArray}
          onBringToFront={bringPanelToFront}
          currentZIndex={panelZIndices['model-settings-panel']}
          className="w-56 max-h-[90vh] overflow-y-auto custom-scrollbar"
        >
          <div className="flex flex-col gap-4">
            {/* Joint Control */}
            <div className="border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Joint Control</h3>
              <div className="space-y-2">
                <div className="text-[8px] text-white/50">Selected: {primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : 'None'}</div>
                {primarySelectedPart && (
                  <div className="text-[8px] text-white/50">
                    Rotation: {selectedRotation.toFixed(1)}°
                  </div>
                )}
              </div>
            </div>

            {/* Pin Options */}
            <div className="border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Pin Options</h3>
              <div className="space-y-2 text-[8px] text-white/50">
                <div>Active: {getPinName(activePins)}</div>
                <div>Mode: {kinematicMode.toUpperCase()}</div>
              </div>
            </div>

            {/* Display Modes */}
            <div className="border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Display Modes</h3>
              <div className="space-y-2 text-[8px] text-white/50">
                <div>View: {viewMode.toUpperCase()}</div>
                <div>Render: {getRenderModeDisplayName(renderMode)}</div>
              </div>
            </div>
          </div>
        </DraggablePanel>

        {/* MOVEMENT SETTINGS PANEL */}
        <DraggablePanel
          id="movement-settings-panel"
          title="MOVEMENT SETTINGS"
          x={movementPanel.x}
          y={movementPanel.y}
          minimized={movementPanel.minimized}
          onUpdateRect={(id, rect) => updatePanelRect(id, rect)}
          onUpdatePosition={(id, x, y, minimized) => updatePanelPosition(id, x, y, minimized)}
          allPanelRects={allPanelRectsArray}
          onBringToFront={bringPanelToFront}
          currentZIndex={panelZIndices['movement-settings-panel']}
          className="w-56 max-h-[90vh] overflow-y-auto custom-scrollbar"
        >
          <div className="flex flex-col gap-4">
            {/* Walking Engine */}
            <div className="border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Walking Engine</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[8px] text-white/50">
                  <input
                    type="checkbox"
                    checked={walkingEnabled}
                    onChange={(e) => setWalkingEnabled(e.target.checked)}
                  />
                  Enable Walking
                </label>
                {walkingEnabled && (
                  <>
                    <div className="text-[8px] text-white/50">Speed: {walkingSpeed.toFixed(1)}</div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={walkingSpeed}
                      onChange={(e) => setWalkingSpeed(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Animation Engine */}
            <div className="border-b border-white/20 pb-3">
              <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2">Animation Engine</h3>
              <div className="space-y-2 text-[8px] text-white/50">
                <div>Keyframes: 0</div>
                <div>Status: STOPPED</div>
              </div>
            </div>
          </div>
        </DraggablePanel>

        {/* Panel Quick Access */}
        <div className="flex items-center gap-1 border-l border-white/20 pl-3">
          {panelQuickAccessButtons.map(({ label, panelId }) => {
            return (
              <button
                key={label}
                onClick={() => openPanel(panelId)}
                className={`px-2 py-1 text-[8px] font-bold tracking-widest transition-all duration-200 ${panelRects[panelId]?.minimized 
                  ? 'text-white/40 hover:text-white/70' 
                  : 'text-focus-ring border-b border-focus-ring'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pose Data Display - Bottom Right of Canvas */}
      <div className="fixed bottom-4 right-4 bg-mono-darker border border-white/10 rounded p-3 z-[50]">
        <div className="text-white/40 text-[8px] uppercase mb-2">Pose_Data</div>
        <div className="text-white/70 text-[8px] whitespace-pre-wrap break-all h-40 overflow-y-auto custom-scrollbar bg-white/5 p-2 rounded border border-white/10 min-w-[200px] max-w-[300px]">
          {poseToString(activePose)}
        </div>
      </div>
    </div>
  );
};

export default App;
