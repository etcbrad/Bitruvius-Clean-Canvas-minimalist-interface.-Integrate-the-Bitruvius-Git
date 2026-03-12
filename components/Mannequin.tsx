
import React, { useMemo } from 'react';
import { Bone, type BoneProps } from './Bone';
import { ANATOMY } from '../constants';
import { getJointPositions, getTotalRotation, calculateTensionFactor } from '../utils/kinematics';
import { PartName, PartSelection, PartVisibility, AnchorName, Pose, JointConstraint, RenderMode, PinnedState } from '../types';
import { COLORS_BY_CATEGORY, COLORS } from './Bone';
import { SKELETON_GRAPH, LEG_GRAPHS, OVAL_SKELETON_GRAPH, OVAL_LEG_GRAPHS, type BoneNode } from './skeleton-config';

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

interface MannequinProps {
  pose: Pose;
  ghostPose?: Pose;
  showOverlay?: boolean;
  showPins?: boolean;
  modelStyle?: 'default' | 'oval';
  boneScale?: Record<PartName, { length: number; width: number }>;
  boneVariantOverrides?: Record<PartName, BoneProps['variant'] | null>;
  selectedParts: PartSelection;
  visibility: PartVisibility;
  activePins: AnchorName[];
  pinnedState: PinnedState;
  className?: string;
  onMouseDownOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  onDoubleClickOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  onMouseDownOnRoot?: (event: React.MouseEvent<SVGCircleElement>) => void;
  jointModes: Record<PartName, JointConstraint>;
  renderMode?: RenderMode;
}

export const getPartCategory = (part: PartName): string => { // Exported
  switch (part) {
    case PartName.RWrist:
    case PartName.LWrist: return 'hand';
    case PartName.RElbow: // This represents the forearm segment
    case PartName.LElbow: return 'forearm';
    case PartName.RShoulder: // This represents the bicep segment
    case PartName.LShoulder: return 'bicep';
    case PartName.Collar: return 'collar';
    case PartName.Torso: return 'torso';
    case PartName.Waist: return 'waist';
    case PartName.RThigh:
    case PartName.LThigh: return 'thigh';
    case PartName.RSkin: // This represents the shin/calf segment
    case PartName.LSkin: return 'shin';
    case PartName.RAnkle: // This represents the foot segment
    case PartName.LAnkle: return 'foot';
    case PartName.Head: return 'head';
    default: return 'default';
  }
};

export const getPartCategoryDisplayName = (part: PartName): string => { // Exported
  const category = getPartCategory(part);
  // Simple mapping for display purposes
  switch(category) {
    case 'bicep': return part.startsWith('r') ? 'RIGHT BICEP' : 'LEFT BICEP';
    case 'forearm': return part.startsWith('r') ? 'RIGHT FOREARM' : 'LEFT FOREARM';
    case 'hand': return part.startsWith('r') ? 'RIGHT HAND' : 'LEFT HAND';
    case 'thigh': return part.startsWith('r') ? 'RIGHT THIGH' : 'LEFT THIGH';
    case 'shin': return part.startsWith('r') ? 'RIGHT SHIN' : 'LEFT SHIN';
    case 'foot': return part.startsWith('r') ? 'RIGHT FOOT' : 'LEFT FOOT';
    case 'head': return 'HEAD';
    case 'collar': return 'COLLAR';
    case 'torso': return 'TORSO';
    case 'waist': return 'WAIST';
    default: return part.toUpperCase();
  }
};

// Utility function to create common PartWrapper props
const createPartWrapperProps = (
  part: PartName,
  selectedParts: { [key in PartName]: boolean },
  jointModes: Record<PartName, JointConstraint>,
  renderMode: RenderMode,
  onMouseDownOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void,
  onDoubleClickOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void,
) => ({
  part,
  onMouseDownOnPart,
  onDoubleClickOnPart,
  selectedParts,
  jointModes,
  renderMode,
});

// Lifted outside component to prevent remounting on every render
interface PartWrapperProps {
  part: PartName;
  children?: React.ReactNode;
  onMouseDownOnPart: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  onDoubleClickOnPart: (part: PartName, event: React.MouseEvent<SVGGElement>) => void;
  selectedParts: PartSelection;
  jointModes: Record<PartName, JointConstraint>;
  renderMode: RenderMode;
}

const PartWrapper: React.FC<PartWrapperProps> = React.memo(({ 
  part, 
  children, 
  onMouseDownOnPart,
  onDoubleClickOnPart,
  selectedParts,
  jointModes,
  renderMode
}) => {
  const isSelected = selectedParts[part];

  const handleMouseDown = (e: React.MouseEvent<SVGGElement>) => { 
    e.stopPropagation(); 
    onMouseDownOnPart?.(part, e); 
  };
  
  const handleDoubleClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    onDoubleClickOnPart?.(part, e);
  };

  return (
    <g 
      className="cursor-pointer" 
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="button"
      aria-label={`Select ${getPartCategoryDisplayName(part)}`}
      aria-pressed={isSelected}
    >
      {React.Children.map(children, child =>
        React.isValidElement(child) && child.type === Bone
          ? React.cloneElement(child as React.ReactElement<BoneProps>, { 
              isSelected: isSelected,
              renderMode: renderMode,
              jointConstraintMode: jointModes[part] || 'fk',
            })
          : child
      )}
    </g>
  );
});

// Recursive renderer for bone nodes
const renderBoneNode = (
  node: BoneNode, 
  pose: Pose, 
  offsets: Record<PartName, import('../types').Vector2D | undefined>,
  visibility: PartVisibility,
  showOverlay: boolean,
  boneScale: Record<PartName, { length: number; width: number }> | undefined,
  boneVariantOverrides: Record<PartName, BoneProps['variant'] | null> | undefined,
  selectedParts: PartSelection,
  jointModes: Record<PartName, JointConstraint>,
  renderMode: RenderMode,
  onMouseDownOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void,
  onDoubleClickOnPart?: (part: PartName, event: React.MouseEvent<SVGGElement>) => void,
): React.ReactNode => {
  const collarCounterRotate = node.attachPoint 
    ? -getTotalRotation(PartName.Collar, pose) 
    : 0;

  const scale = boneScale?.[node.part] || { length: 1, width: 1 };
  const scaledBoneProps = {
    ...node.boneProps,
    length: node.boneProps.length * scale.length,
    width: node.boneProps.width ? node.boneProps.width * scale.width : node.boneProps.width,
  };
  const variantOverride = boneVariantOverrides?.[node.part];
  if (variantOverride !== undefined) {
    scaledBoneProps.variant = variantOverride;
  }
  if (node.part === PartName.Collar && typeof node.boneProps.width === 'number') {
    const leftOffsetX = offsets?.[PartName.LShoulder]?.x ?? 0;
    const rightOffsetX = offsets?.[PartName.RShoulder]?.x ?? 0;
    const baseWidth = node.boneProps.width;
    const widthDelta = (rightOffsetX - leftOffsetX) * 0.6;
    const dynamicWidth = clampNumber(baseWidth + widthDelta, baseWidth * 0.6, baseWidth * 1.8);
    scaledBoneProps.width = dynamicWidth * scale.width;
  }

  const bone = (
    <PartWrapper 
      {...createPartWrapperProps(
        node.part,
        onMouseDownOnPart,
        onDoubleClickOnPart,
        selectedParts,
        jointModes,
        renderMode
      )}
    >
      <Bone
        rotation={getTotalRotation(node.rotationKey, pose)}
        {...scaledBoneProps}
        offset={offsets?.[node.part]}
        visible={visibility[node.part]}
        showOverlay={showOverlay}
        partCategory={getPartCategory(node.part)}
      >
        {node.children.map(child => renderBoneNode(
          child, 
          pose, 
          offsets, 
          visibility, 
          showOverlay,
          boneScale,
          boneVariantOverrides,
          selectedParts,
          jointModes,
          renderMode,
          onMouseDownOnPart,
          onDoubleClickOnPart
        ))}
      </Bone>
    </PartWrapper>
  );

  return node.attachPoint 
    ? <g transform={`translate(${node.attachPoint.x}, ${node.attachPoint.y}) rotate(${collarCounterRotate})`}>{bone}</g>
    : bone;
};

export const Mannequin: React.FC<MannequinProps> = ({
  pose,
  ghostPose,
  showOverlay = true,
  showPins = true,
  modelStyle = 'default',
  boneScale,
  boneVariantOverrides,
  selectedParts,
  visibility,
  activePins,
  pinnedState,
  className = "text-ink",
  onMouseDownOnPart = () => {},
  onDoubleClickOnPart = () => {},
  onMouseDownOnRoot,
  jointModes,
  renderMode = 'default',
}) => {
  const joints = getJointPositions(pose, activePins);
  const offsets = pose.offsets || {};
  const skeletonGraph = modelStyle === 'oval' ? OVAL_SKELETON_GRAPH : SKELETON_GRAPH;
  const legGraphs = modelStyle === 'oval' ? OVAL_LEG_GRAPHS : LEG_GRAPHS;

  // Memoize tension calculations to prevent recalculation on every frame
  const pinTensions = useMemo(() => 
    activePins.map((pinName) => {
      if (pinName === 'root') return null;
      const currentPos = joints[pinName as keyof typeof joints];
      const targetPos = pinnedState[pinName];
      if (!currentPos || !targetPos) return null;
      return {
        pinName,
        tension: calculateTensionFactor(currentPos, targetPos),
        currentPos,
        targetPos
      };
    }).filter(Boolean),
    [joints, activePins, pinnedState]
  );

  const ROOT_COLOR = "#5A5A5A"; // Darker grayscale for the root circle
  const PIN_INDICATOR_SIZE = ANATOMY.ROOT_SIZE * 0.7; // Size of the inner circle of the root graphic
  const PIN_INDICATOR_STROKE_COLOR = COLORS.SELECTION; // Light monochrome for stroke
  const PIN_INDICATOR_STROKE_WIDTH = 1;

  const ghostOffsets = ghostPose?.offsets || {};

  // The `pose.root.x` and `pose.root.y` used here are already compensated by getJointPositions
  return (
    <g 
      className={`mannequin-root ${className}`} 
      transform={`translate(${joints.root.x}, ${joints.root.y}) rotate(${pose.bodyRotation})`}
      aria-label="Mannequin figure"
    >
      {ghostPose && (
        <g className="ghost-skeleton opacity-30 pointer-events-none">
          {renderBoneNode(
            skeletonGraph, 
            ghostPose, 
            ghostOffsets, 
            visibility, 
            false,
            boneScale,
            boneVariantOverrides,
            selectedParts,
            jointModes,
            renderMode as RenderMode
          )}
          {legGraphs.map(legGraph => renderBoneNode(
            legGraph,
            ghostPose, 
            ghostOffsets, 
            visibility, 
            false,
            boneScale,
            boneVariantOverrides,
            selectedParts,
            jointModes,
            renderMode as RenderMode
          ))}
        </g>
      )}
      {showPins && (
        <React.Fragment>
          {/* Root circle for drag */}
          <g 
            onMouseDown={onMouseDownOnRoot} 
            className={'cursor-pointer'} 
            data-no-export={true}
            role="button"
            aria-label="Drag mannequin root"
          >
            <circle cx="0" cy="0" r={ANATOMY.ROOT_SIZE} fill="currentColor" opacity="0.1" />
            <circle 
              cx="0" cy="0" r={PIN_INDICATOR_SIZE} 
              fill={activePins.includes('root') ? COLORS.ANCHOR_RED : ROOT_COLOR}
              stroke={PIN_INDICATOR_STROKE_COLOR} 
              strokeWidth={PIN_INDICATOR_STROKE_WIDTH} 
            />
          </g>

          {/* Multi-Pin Indicators with Tension Visualization */}
          {pinTensions.map((pinData, index) => {
            if (!pinData) return null;
            const { pinName, tension, currentPos, targetPos } = pinData;
            const isPrimary = index === 0;
            
            // Tension visual: Scale and luminance
            const scale = 1 + tension * 0.5;
            const opacity = 0.5 + tension * 0.5;
            const color = isPrimary ? COLORS.ANCHOR_RED : "#FF4488"; // Pinkish-red for secondary pins

            return (
              <g 
                key={pinName}
                transform={`translate(${currentPos.x - pose.root.x}, ${currentPos.y - pose.root.y})`} 
                data-no-export={true}
              >
                {/* Rubber band line if tension exists */}
                {tension > 0.05 && (
                  <line 
                    x1={0} y1={0} 
                    x2={targetPos.x - currentPos.x} 
                    y2={targetPos.y - currentPos.y}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="2,2"
                    opacity={opacity}
                  />
                )}
                
                {/* Target pin (ghost) */}
                <circle 
                  cx={targetPos.x - currentPos.x} 
                  cy={targetPos.y - currentPos.y} 
                  r={PIN_INDICATOR_SIZE * 0.5} 
                  fill={color} 
                  opacity={0.3} 
                />

                {/* Active joint pin */}
                <circle cx="0" cy="0" r={ANATOMY.ROOT_SIZE} fill="currentColor" opacity="0.1" />
                <circle 
                  cx="0" cy="0" r={PIN_INDICATOR_SIZE * scale} 
                  fill={color}
                  stroke={PIN_INDICATOR_STROKE_COLOR} 
                  strokeWidth={PIN_INDICATOR_STROKE_WIDTH}
                  opacity={opacity}
                />
              </g>
            );
          })}
        </React.Fragment>
      )}

      {/* Data-driven skeleton rendering */}
      {renderBoneNode(
        skeletonGraph, 
        pose, 
        offsets, 
        visibility, 
        showOverlay,
        boneScale,
        boneVariantOverrides,
        selectedParts,
        jointModes,
        renderMode as RenderMode,
        onMouseDownOnPart,
        onDoubleClickOnPart
      )}

      {/* Render legs as separate chains */}
      {legGraphs.map(legGraph => renderBoneNode(
        legGraph,
        pose,
        offsets,
        visibility,
        showOverlay,
        boneScale,
        boneVariantOverrides,
        selectedParts,
        jointModes,
        renderMode as RenderMode,
        onMouseDownOnPart,
        onDoubleClickOnPart
      ))}

      {/* Debug overlay - remove for production */}
      {process.env.NODE_ENV === 'development' && Object.entries(joints).map(([name, pos]) => (
        <circle 
          key={name} 
          cx={pos.x - joints.root.x} 
          cy={pos.y - joints.root.y} 
          r={3} 
          fill="lime" 
          opacity={0.8} 
          className="pointer-events-none" 
        />
      ))}
    </g>
  );
};
