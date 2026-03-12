Original prompt: look at unzips and fix our proc gen features. Build the version that uses our physics best

- Added grounded pin blending + IK foot locking in walking engine (App.tsx). Locks now ease in/out, allow controlled slide, root correction is weighted, and legs use IK to honor pins.
- Updated walking foot lock state to track blend strength.

Tests:
- Playwright client run on http://localhost:3000 with actions file; no screenshots produced and the client appeared to hang with no output.
