# Walking Engine Calibration Guide

## Overview
The walking engine calibration system provides fine-grained control over every aspect of character movement. Use the **Calibrate** button in the Movement Settings panel to access these controls.

## Quick Start

### 1. Choose a Preset
Start with one of the calibrated presets:
- **Balanced**: Natural walking motion (default)
- **Athletic**: Energetic, sporty movement
- **Casual**: Relaxed, everyday walking
- **Elderly**: Gentle, careful movement
- **Robotic**: Mechanical, precise motion

### 2. Fine-Tune Parameters
Use the **Manual Tuning** tab to adjust individual parameters for your specific model.

## Parameter Categories

### 🚀 Speed & Timing
- **Frequency**: Steps per second (0.5-3.0)
  - Higher = faster walking/running
  - Lower = slower, deliberate movement

### 🎭 Movement Characteristics
- **Intensity**: Energy/enthusiasm (0.0-1.5)
  - Higher = more dynamic, exaggerated movement
  - Lower = subdued, conservative motion

- **Stride**: Step length (0.1-1.2)
  - Higher = longer steps, covers more distance
  - Lower = shorter, more frequent steps

- **Lean**: Forward/backward body tilt (-0.5 to 0.5)
  - Positive = forward lean (running)
  - Negative = backward lean (cautious)

- **Mood**: Movement style/character (0.0-1.0)
  - Higher = confident, upright posture
  - Lower = hesitant, rounded posture

### ⚖️ Physics & Weight
- **Gravity**: Ground impact force (0.0-1.0)
  - Higher = heavier, more grounded movement
  - Lower = lighter, more floaty motion

- **Bounce**: Upward rebound after ground contact (0.0-1.0)
  - Higher = springy, energetic movement
  - Lower = flat, grounded motion

- **Ground Drag**: Foot friction/drag (0.0-1.0)
  - Higher = more foot sliding, less lift
  - Lower = cleaner foot lift-off

- **Bends**: Overall joint flexibility (0.0-1.5)
  - Higher = more knee/hip bending
  - Lower = stiffer, straighter legs

### 💪 Arm Movement
- **Arm Swing**: Arm motion amplitude (0.0-1.5)
  - Higher = exaggerated arm movement
  - Lower = minimal arm motion

- **Elbow Bend**: Arm flexion (0.0-1.0)
  - Higher = more bent arms during movement
  - Lower = straighter arms

- **Wrist Swing**: Hand rotation (0.0-1.0)
  - Higher = more hand/wrist movement
  - Lower = rigid hand position

### 🦵 Leg & Foot Details
- **Foot Angle**: Foot placement on ground (-10° to 10°)
  - Positive = toes up, heel-first landing
  - Negative = toes down, flat-footed landing

- **Foot Roll**: Ankle rotation (0.0-1.0)
  - Higher = more ankle movement during step
  - Lower = rigid foot position

- **Toe Lift**: Toe extension during swing (0.0-1.0)
  - Higher = more pointed toes
  - Lower = relaxed foot position

- **Hover Height**: Foot clearance above ground (0.0-0.5)
  - Higher = higher leg lift, more energy
  - Lower = closer to ground, efficient movement

## Calibration Workflow

### For Your Specific Model:

1. **Start with Balanced preset**
2. **Adjust based on model characteristics**:
   - **Heavy models**: Increase gravity, decrease bounce
   - **Athletic models**: Increase intensity, stride, and arm swing
   - **Elderly models**: Decrease intensity, increase ground drag
   - **Mechanical models**: Set bounce to 0, increase precision parameters

3. **Test in real-time**:
   - Enable walking engine
   - Observe foot placement, body movement, and naturalness
   - Make incremental adjustments

4. **Save your configuration**:
   - Note the parameter values that work best
   - Create custom presets for different scenarios

## Common Calibration Issues

### ❌ Feet Sliding
- **Solution**: Increase `ground_drag`, decrease `foot_slide`
- **Also check**: `gravity` and `bounce` balance

### ❌ Unnatural Bounce
- **Solution**: Decrease `bounce` and `intensity`
- **Also check**: `gravity` should be higher

### ❌ Stiff Movement
- **Solution**: Increase `bends` and `mood`
- **Also check**: `arm_swing` and `foot_roll`

### ❌ Exaggerated Motion
- **Solution**: Decrease `intensity` and `arm_swing`
- **Also check**: `stride` and `hip_sway`

## Pro Tips

### 🎯 Character-Specific Tuning
- **Children**: Higher frequency, lower stride, more bounce
- **Athletes**: Higher intensity, longer stride, less ground drag
- **Elderly**: Lower intensity, higher ground drag, more bends
- **Robots**: Zero bounce, precise timing, mechanical movement

### 🔄 Animation Integration
- Calibrate with timeline recording enabled
- Test with different animation speeds
- Ensure smooth transitions between poses

### 📊 Performance Considerations
- Extreme values may cause unrealistic movement
- Balance between naturalness and performance
- Test with different walking speeds

## Save & Share

Once calibrated:
1. **Save to Timeline**: Preserve your calibrated walk cycle
2. **Note Parameters**: Keep a record of successful settings
3. **Create Variations**: Make presets for different scenarios
4. **Test Integration**: Ensure compatibility with other animations

---

**Remember**: Calibration is iterative. Start with presets, make small adjustments, and test thoroughly. The goal is natural, believable movement that matches your character's physical characteristics.
