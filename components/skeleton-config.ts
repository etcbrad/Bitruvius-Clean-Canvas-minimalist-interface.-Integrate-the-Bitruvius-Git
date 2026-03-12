import { PartName } from '../types';
import { ANATOMY, RIGGING } from '../constants';

export interface BoneNode {
  part: PartName;
  boneProps: Omit<import('./Bone').BoneProps, 'rotation' | 'isSelected' | 'renderMode' | 'jointConstraintMode'>;
  rotationKey: string;           // key into pose for getTotalRotation
  attachPoint?: { x: number; y: number }; // offset from parent tip (for shoulders)
  children: BoneNode[];
}

export const SKELETON_GRAPH: BoneNode = {
  part: PartName.Waist,
  rotationKey: PartName.Waist,
  boneProps: { 
    length: ANATOMY.WAIST, 
    width: ANATOMY.WAIST_WIDTH, 
    variant: 'waist-teardrop-pointy-up', 
    drawsUpwards: true 
  },
  children: [
    {
      part: PartName.Torso,
      rotationKey: PartName.Torso,
      boneProps: { 
        length: ANATOMY.TORSO, 
        width: ANATOMY.TORSO_WIDTH, 
        variant: 'torso-teardrop-pointy-down', 
        drawsUpwards: true 
      },
      children: [
        {
          part: PartName.Collar,
          rotationKey: PartName.Collar,
          boneProps: { 
            length: ANATOMY.COLLAR, 
            width: ANATOMY.COLLAR_WIDTH, 
            variant: 'collar-horizontal-oval-shape', 
            drawsUpwards: true 
          },
          children: [
            {
              part: PartName.Head,
              rotationKey: PartName.Head,
              boneProps: { 
                length: ANATOMY.HEAD, 
                width: ANATOMY.HEAD_WIDTH, 
                variant: 'head-tall-oval', 
                drawsUpwards: true 
              },
              children: []
            },
            {
              part: PartName.RShoulder,
              rotationKey: PartName.RShoulder,
              attachPoint: { 
                x: RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER, 
                y: RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END 
              },
              boneProps: { 
                length: ANATOMY.UPPER_ARM, 
                width: ANATOMY.LIMB_WIDTH_ARM, 
                variant: 'deltoid-shape' 
              },
              children: [
                {
                  part: PartName.RElbow,
                  rotationKey: 'rForearm',
                  boneProps: { 
                    length: ANATOMY.LOWER_ARM, 
                    width: ANATOMY.LIMB_WIDTH_FOREARM, 
                    variant: 'limb-tapered' 
                  },
                  children: [
                    {
                      part: PartName.RWrist,
                      rotationKey: PartName.RWrist,
                      boneProps: { 
                        length: ANATOMY.HAND, 
                        width: ANATOMY.HAND_WIDTH, 
                        variant: 'hand-foot-arrowhead-shape' 
                      },
                      children: []
                    }
                  ]
                }
              ]
            },
            {
              part: PartName.LShoulder,
              rotationKey: PartName.LShoulder,
              attachPoint: { 
                x: RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER, 
                y: RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END 
              },
              boneProps: { 
                length: ANATOMY.UPPER_ARM, 
                width: ANATOMY.LIMB_WIDTH_ARM, 
                variant: 'deltoid-shape' 
              },
              children: [
                {
                  part: PartName.LElbow,
                  rotationKey: 'lForearm',
                  boneProps: { 
                    length: ANATOMY.LOWER_ARM, 
                    width: ANATOMY.LIMB_WIDTH_FOREARM, 
                    variant: 'limb-tapered' 
                  },
                  children: [
                    {
                      part: PartName.LWrist,
                      rotationKey: PartName.LWrist,
                      boneProps: { 
                        length: ANATOMY.HAND, 
                        width: ANATOMY.HAND_WIDTH, 
                        variant: 'hand-foot-arrowhead-shape' 
                      },
                      children: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

// Add the legs as separate top-level chains (they attach to root, not torso)
export const LEG_GRAPHS: BoneNode[] = [
  {
    part: PartName.RThigh,
    rotationKey: PartName.RThigh,
    boneProps: { 
      length: ANATOMY.LEG_UPPER, 
      width: ANATOMY.LIMB_WIDTH_THIGH, 
      variant: 'limb-tapered' 
    },
    children: [
      {
        part: PartName.RSkin,
        rotationKey: 'rCalf',
        boneProps: { 
          length: ANATOMY.LEG_LOWER, 
          width: ANATOMY.LIMB_WIDTH_CALF, 
          variant: 'limb-tapered' 
        },
        children: [
          {
            part: PartName.RAnkle,
            rotationKey: PartName.RAnkle,
            boneProps: { 
              length: ANATOMY.FOOT, 
              width: ANATOMY.FOOT_WIDTH, 
              variant: 'hand-foot-arrowhead-shape' 
            },
            children: []
          }
        ]
      }
    ]
  },
  {
    part: PartName.LThigh,
    rotationKey: PartName.LThigh,
    boneProps: { 
      length: ANATOMY.LEG_UPPER, 
      width: ANATOMY.LIMB_WIDTH_THIGH, 
      variant: 'limb-tapered' 
    },
    children: [
      {
        part: PartName.LSkin,
        rotationKey: 'lCalf',
        boneProps: { 
          length: ANATOMY.LEG_LOWER, 
          width: ANATOMY.LIMB_WIDTH_CALF, 
          variant: 'limb-tapered' 
        },
        children: [
          {
            part: PartName.LAnkle,
            rotationKey: PartName.LAnkle,
            boneProps: { 
              length: ANATOMY.FOOT, 
              width: ANATOMY.FOOT_WIDTH, 
              variant: 'hand-foot-arrowhead-shape' 
            },
            children: []
          }
        ]
      }
    ]
  }
];

export const OVAL_SKELETON_GRAPH: BoneNode = {
  part: PartName.Waist,
  rotationKey: PartName.Waist,
  boneProps: { 
    length: ANATOMY.WAIST, 
    width: ANATOMY.WAIST_WIDTH, 
    variant: 'oval-waist', 
    drawsUpwards: true 
  },
  children: [
    {
      part: PartName.Torso,
      rotationKey: PartName.Torso,
      boneProps: { 
        length: ANATOMY.TORSO, 
        width: ANATOMY.TORSO_WIDTH, 
        variant: 'oval-torso', 
        drawsUpwards: true 
      },
      children: [
        {
          part: PartName.Collar,
          rotationKey: PartName.Collar,
          boneProps: { 
            length: ANATOMY.COLLAR, 
            width: ANATOMY.COLLAR_WIDTH, 
            variant: 'collar-horizontal-oval-shape', 
            drawsUpwards: true 
          },
          children: [
            {
              part: PartName.Head,
              rotationKey: PartName.Head,
              boneProps: { 
                length: ANATOMY.HEAD, 
                width: ANATOMY.HEAD_WIDTH, 
                variant: 'head-tall-oval', 
                drawsUpwards: true 
              },
              children: []
            },
            {
              part: PartName.RShoulder,
              rotationKey: PartName.RShoulder,
              attachPoint: { 
                x: RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER, 
                y: RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END 
              },
              boneProps: { 
                length: ANATOMY.UPPER_ARM, 
                width: ANATOMY.LIMB_WIDTH_ARM, 
                variant: 'oval-limb' 
              },
              children: [
                {
                  part: PartName.RElbow,
                  rotationKey: 'rForearm',
                  boneProps: { 
                    length: ANATOMY.LOWER_ARM, 
                    width: ANATOMY.LIMB_WIDTH_FOREARM, 
                    variant: 'oval-limb' 
                  },
                  children: [
                    {
                      part: PartName.RWrist,
                      rotationKey: PartName.RWrist,
                      boneProps: { 
                        length: ANATOMY.HAND, 
                        width: ANATOMY.HAND_WIDTH, 
                        variant: 'oval-hand-foot' 
                      },
                      children: []
                    }
                  ]
                }
              ]
            },
            {
              part: PartName.LShoulder,
              rotationKey: PartName.LShoulder,
              attachPoint: { 
                x: RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER, 
                y: RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END 
              },
              boneProps: { 
                length: ANATOMY.UPPER_ARM, 
                width: ANATOMY.LIMB_WIDTH_ARM, 
                variant: 'oval-limb' 
              },
              children: [
                {
                  part: PartName.LElbow,
                  rotationKey: 'lForearm',
                  boneProps: { 
                    length: ANATOMY.LOWER_ARM, 
                    width: ANATOMY.LIMB_WIDTH_FOREARM, 
                    variant: 'oval-limb' 
                  },
                  children: [
                    {
                      part: PartName.LWrist,
                      rotationKey: PartName.LWrist,
                      boneProps: { 
                        length: ANATOMY.HAND, 
                        width: ANATOMY.HAND_WIDTH, 
                        variant: 'oval-hand-foot' 
                      },
                      children: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

export const OVAL_LEG_GRAPHS: BoneNode[] = [
  {
    part: PartName.RThigh,
    rotationKey: PartName.RThigh,
    boneProps: { 
      length: ANATOMY.LEG_UPPER, 
      width: ANATOMY.LIMB_WIDTH_THIGH, 
      variant: 'oval-limb' 
    },
    children: [
      {
        part: PartName.RSkin,
        rotationKey: 'rCalf',
        boneProps: { 
          length: ANATOMY.LEG_LOWER, 
          width: ANATOMY.LIMB_WIDTH_CALF, 
          variant: 'oval-limb' 
        },
        children: [
          {
            part: PartName.RAnkle,
            rotationKey: PartName.RAnkle,
            boneProps: { 
              length: ANATOMY.FOOT, 
              width: ANATOMY.FOOT_WIDTH, 
              variant: 'oval-hand-foot' 
            },
            children: []
          }
        ]
      }
    ]
  },
  {
    part: PartName.LThigh,
    rotationKey: PartName.LThigh,
    boneProps: { 
      length: ANATOMY.LEG_UPPER, 
      width: ANATOMY.LIMB_WIDTH_THIGH, 
      variant: 'oval-limb' 
    },
    children: [
      {
        part: PartName.LSkin,
        rotationKey: 'lCalf',
        boneProps: { 
          length: ANATOMY.LEG_LOWER, 
          width: ANATOMY.LIMB_WIDTH_CALF, 
          variant: 'oval-limb' 
        },
        children: [
          {
            part: PartName.LAnkle,
            rotationKey: PartName.LAnkle,
            boneProps: { 
              length: ANATOMY.FOOT, 
              width: ANATOMY.FOOT_WIDTH, 
              variant: 'oval-hand-foot' 
            },
            children: []
          }
        ]
      }
    ]
  }
];
