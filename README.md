#DINO BOT

Look away from the screen and a bot takes over the Chrome dino game.
Look back and you get control back.

**How it works:** webcam → MediaPipe Face Landmarker → iris ratio + head yaw
→ `away` (true/false) → HUMAN/BOT state machine → rule-based autopilot.

- Runs entirely in the browser. Your video never leaves your machine.
- Safe handoff: control only returns to you when the dino isn't mid-jump and
  no obstacle is about to arrive.
- Personal calibration: press `C` while looking at the game.
- Thresholds were chosen from measured data, not guessed.

**Limits:** looking down at a keyboard isn't detected yet (no pitch signal),
and thresholds are tuned to one face.

## Run it
    python3 -m http.server 8001
    open http://localhost:8001 and allow the camera

## Credits
Game: [wayou/t-rex-runner](https://github.com/wayou/t-rex-runner) (extracted from Chromium).
Face tracking: [MediaPipe](https://ai.google.dev/edge/mediapipe) by Google.
