
import React from 'react';
import { Bone, type BoneProps } from './Bone'; // Import BoneProps type for explicit casting
import { ANATOMY, RIGGING } from '../constants';
import { getJointPositions, getTotalRotation, calculateTensionFactor } from '../utils/kinematics';
import { PartName, PartSelection, PartVisibility, AnchorName, Pose, JointConstraint, RenderMode, PARENT_MAP, partNameToPoseKey, PinnedState } from '../types';
import { COLORS_BY_CATEGORY, COLORS } from './Bone'; // Import COLORS_BY_CATEGORY AND COLORS for pin indicator color

interface MannequinProps {
  pose: Pose;
  showOverlay?: boolean;
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

export const Mannequin: React.FC<MannequinProps> = ({
  pose,
  showOverlay = true,
  selectedParts,
  visibility,
  activePins,
  pinnedState,
  className = "text-ink",
  onMouseDownOnPart,
  onDoubleClickOnPart,
  onMouseDownOnRoot,
  jointModes,
  renderMode = 'default',
}) => {
  const joints = getJointPositions(pose, activePins);
  const offsets = pose.offsets || {};

  const PartWrapper = ({ part, children }: { part: PartName; children?: React.ReactNode }) => {
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
        onDoubleClick={handleDoubleClick} // Reintroduced
        role="button" // Indicate it's an interactive element
        aria-label={`Select ${getPartCategoryDisplayName(part)}`}
        aria-pressed={isSelected}
      >
        {React.Children.map(children, child =>
          // Explicitly cloneElement and pass `isSelected`, `renderMode`, and `jointConstraintMode`.
          React.isValidElement(child) && child.type === Bone
            ? React.cloneElement(child as React.ReactElement<BoneProps>, { 
                isSelected: isSelected,
                renderMode: renderMode,
                jointConstraintMode: jointModes[part], // Pass kinetic mode
              })
            : child
        )}
      </g>
    );
  };

  const ROOT_COLOR = "#5A5A5A"; // Darker grayscale for the root circle
  const PIN_INDICATOR_SIZE = ANATOMY.ROOT_SIZE * 0.7; // Size of the inner circle of the root graphic
  const PIN_INDICATOR_STROKE_COLOR = COLORS.SELECTION; // Light monochrome for stroke
  const PIN_INDICATOR_STROKE_WIDTH = 1;


  return (
    // The `pose.root.x` and `pose.root.y` used here are already compensated by getJointPositions
    <g 
      className={`mannequin-root ${className}`} 
      transform={`translate(${joints.root.x}, ${joints.root.y}) rotate(${pose.bodyRotation})`}
      aria-label="Mannequin figure"
    >
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
      {activePins.map((pinName, index) => {
        if (pinName === 'root') return null;
        const currentPos = joints[pinName as keyof typeof joints];
        const targetPos = pinnedState[pinName];
        if (!currentPos || !targetPos) return null;

        const tension = calculateTensionFactor(currentPos, targetPos);
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

      <PartWrapper part={PartName.Waist}>
        <Bone 
          rotation={getTotalRotation(PartName.Waist, pose)} 
          length={ANATOMY.WAIST} 
          width={ANATOMY.WAIST_WIDTH} 
          variant="waist-teardrop-pointy-up" 
          drawsUpwards 
          showOverlay={showOverlay} 
          offset={offsets[PartName.Waist]} 
          visible={visibility[PartName.Waist]} 
          partCategory={getPartCategory(PartName.Waist)}
        >
          <PartWrapper part={PartName.Torso}>
            <Bone 
              rotation={getTotalRotation(PartName.Torso, pose)} 
              length={ANATOMY.TORSO} 
              width={ANATOMY.TORSO_WIDTH} 
              variant="torso-teardrop-pointy-down" 
              drawsUpwards 
              showOverlay={showOverlay} 
              offset={offsets[PartName.Torso]} 
              visible={visibility[PartName.Torso]} 
              partCategory={getPartCategory(PartName.Torso)}
            >
              <PartWrapper part={PartName.Collar}>
                <Bone 
                  rotation={getTotalRotation(PartName.Collar, pose)} 
                  length={ANATOMY.COLLAR} 
                  width={ANATOMY.COLLAR_WIDTH} 
                  variant="collar-horizontal-oval-shape" 
                  drawsUpwards 
                  showOverlay={showOverlay} 
                  partCategory={getPartCategory(PartName.Collar)}
                  offset={offsets[PartName.Collar]} 
                  visible={visibility[PartName.Collar]} 
                >
                  
                  <g transform={`translate(0, 0)`}>
                    <PartWrapper part={PartName.Head}>
                      <Bone 
                        rotation={getTotalRotation(PartName.Head, pose)} 
                        length={ANATOMY.HEAD} 
                        width={ANATOMY.HEAD_WIDTH} 
                        variant="head-tall-oval" 
                        drawsUpwards 
                        showOverlay={showOverlay} 
                        offset={offsets[PartName.Head]} 
                        visible={visibility[PartName.Head]} 
                        partCategory={getPartCategory(PartName.Head)}
                      />
                    </PartWrapper>
                  </g>

                  <g transform={`translate(${RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER}, ${RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END}) rotate(${-getTotalRotation(PartName.Collar, pose)})`}>
                    <PartWrapper part={PartName.RShoulder}>
                      <Bone 
                        rotation={getTotalRotation(PartName.RShoulder, pose)} 
                        length={ANATOMY.UPPER_ARM} 
                        width={ANATOMY.LIMB_WIDTH_ARM} 
                        variant="deltoid-shape" 
                        showOverlay={showOverlay} 
                        offset={offsets[PartName.RShoulder]} 
                        visible={visibility[PartName.RShoulder]} 
                        partCategory={getPartCategory(PartName.RShoulder)}
                      >
                        <PartWrapper part={PartName.RElbow}>
                          <Bone 
                            rotation={getTotalRotation('rForearm', pose)} 
                            length={ANATOMY.LOWER_ARM} 
                            width={ANATOMY.LIMB_WIDTH_FOREARM} 
                            variant="limb-tapered" 
                            showOverlay={showOverlay} 
                            offset={offsets[PartName.RElbow]} 
                            visible={visibility[PartName.RElbow]} 
                            partCategory={getPartCategory(PartName.RElbow)}
                          >
                            <PartWrapper part={PartName.RWrist}>
                              <Bone 
                                rotation={getTotalRotation(PartName.RWrist, pose)} 
                                length={ANATOMY.HAND} 
                                width={ANATOMY.HAND_WIDTH} 
                                variant="hand-foot-arrowhead-shape" 
                                showOverlay={showOverlay} 
                                offset={offsets[PartName.RWrist]} 
                                visible={visibility[PartName.RWrist]} 
                                partCategory={getPartCategory(PartName.RWrist)}
                              />
                            </PartWrapper>
                          </Bone>
                        </PartWrapper>
                      </Bone>
                    </PartWrapper>
                  </g>

                  <g transform={`translate(${RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER}, ${RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END}) rotate(${-getTotalRotation(PartName.Collar, pose)})`}>
                    <PartWrapper part={PartName.LShoulder}>
                      <Bone 
                        rotation={getTotalRotation(PartName.LShoulder, pose)} 
                        length={ANATOMY.UPPER_ARM} 
                        width={ANATOMY.LIMB_WIDTH_ARM} 
                        variant="deltoid-shape" 
                        showOverlay={showOverlay} 
                        offset={offsets[PartName.LShoulder]} 
                        visible={visibility[PartName.LShoulder]} 
                        partCategory={getPartCategory(PartName.LShoulder)}
                      >
                        <PartWrapper part={PartName.LElbow}>
                          <Bone 
                            rotation={getTotalRotation('lForearm', pose)} 
                            length={ANATOMY.LOWER_ARM} 
                            width={ANATOMY.LIMB_WIDTH_FOREARM} 
                            variant="limb-tapered" 
                            showOverlay={showOverlay} 
                            offset={offsets[PartName.LElbow]} 
                            visible={visibility[PartName.LElbow]} 
                            partCategory={getPartCategory(PartName.LElbow)}
                          >
                            <PartWrapper part={PartName.LWrist}>
                              <Bone 
                                rotation={getTotalRotation(PartName.LWrist, pose)} 
                                length={ANATOMY.HAND} 
                                width={ANATOMY.HAND_WIDTH} 
                                variant="hand-foot-arrowhead-shape" 
                                showOverlay={showOverlay} 
                                offset={offsets[PartName.LWrist]} 
                                visible={visibility[PartName.LWrist]} 
                                partCategory={getPartCategory(PartName.LWrist)}
                              />
                            </PartWrapper>
                          </Bone>
                        </PartWrapper>
                      </Bone>
                    </PartWrapper>
                  </g>
                </Bone>
              </PartWrapper>
            </Bone>
          </PartWrapper>
        </Bone>
      </PartWrapper>

      <PartWrapper part={PartName.RThigh}>
        <Bone 
          rotation={getTotalRotation(PartName.RThigh, pose)} 
          length={ANATOMY.LEG_UPPER} 
          width={ANATOMY.LIMB_WIDTH_THIGH} 
          variant="limb-tapered" 
          showOverlay={showOverlay} 
          offset={offsets[PartName.RThigh]} 
          visible={visibility[PartName.RThigh]} 
          partCategory={getPartCategory(PartName.RThigh)}
        >
          <PartWrapper part={PartName.RSkin}>
            <Bone 
              rotation={getTotalRotation('rCalf', pose)} 
              length={ANATOMY.LEG_LOWER} 
              width={ANATOMY.LIMB_WIDTH_CALF} 
              variant="limb-tapered" 
              showOverlay={showOverlay} 
              offset={offsets[PartName.RSkin]} 
              visible={visibility[PartName.RSkin]} 
              partCategory={getPartCategory(PartName.RSkin)}
            >
              <PartWrapper part={PartName.RAnkle}>
                <Bone 
                  rotation={getTotalRotation(PartName.RAnkle, pose)} 
                  length={ANATOMY.FOOT} 
                  width={ANATOMY.FOOT_WIDTH} 
                  variant="hand-foot-arrowhead-shape" 
                  showOverlay={showOverlay} 
                  offset={offsets[PartName.RAnkle]} 
                  visible={visibility[PartName.RAnkle]} 
                  partCategory={getPartCategory(PartName.RAnkle)}
                />
              </PartWrapper>
            </Bone>
          </PartWrapper>
        </Bone>
      </PartWrapper>

      <PartWrapper part={PartName.LThigh}>
        <Bone 
          rotation={getTotalRotation(PartName.LThigh, pose)} 
          length={ANATOMY.LEG_UPPER} 
          width={ANATOMY.LIMB_WIDTH_THIGH} 
          variant="limb-tapered" 
          showOverlay={showOverlay} 
          offset={offsets[PartName.LThigh]} 
          visible={visibility[PartName.LThigh]} 
          partCategory={getPartCategory(PartName.LThigh)}
        >
          <PartWrapper part={PartName.LSkin}>
            <Bone 
              rotation={getTotalRotation('lCalf', pose)} 
              length={ANATOMY.LEG_LOWER} 
              width={ANATOMY.LIMB_WIDTH_CALF} 
              variant="limb-tapered" 
              showOverlay={showOverlay} 
              offset={offsets[PartName.LSkin]} 
              visible={visibility[PartName.LSkin]} 
              partCategory={getPartCategory(PartName.LSkin)}
            >
              <PartWrapper part={PartName.LAnkle}>
                <Bone 
                  rotation={getTotalRotation(PartName.LAnkle, pose)} 
                  length={ANATOMY.FOOT} 
                  width={ANATOMY.FOOT_WIDTH} 
                  variant="hand-foot-arrowhead-shape" 
                  showOverlay={showOverlay} 
                  offset={offsets[PartName.LAnkle]} 
                  visible={visibility[PartName.LAnkle]} 
                  partCategory={getPartCategory(PartName.LAnkle)}
                />
              </PartWrapper>
            </Bone>
          </PartWrapper>
        </Bone>
      </PartWrapper>
    </g>
  );
};