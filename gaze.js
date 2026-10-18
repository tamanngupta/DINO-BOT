

// initially i used a head turn approach but if your head is turned towards the screen
// and your eyes are looking away from the screen, that needs to be counted too,
// so i went with face landmarker instead (it gives iris points, not just a face box)

// so import is pulling google's code, type="module" is what lets us use import and await up here
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";


// iris base = 0.54 when looking straight (asymmetrical, because natural human eyes aren't perfectly 0.50)
// this is only the starting value, pressing C while looking at the game replaces it with MY real baseline
// dev = how far the iris is from that baseline, and these two thresholds are on dev
const IRIS_AWAY = 0.12;  

// yaw = how far the head is turned left/right. 0.20 is a guess
const YAW_AWAY = 0.20;

const HOLD_MS = 250;


// the one shared variable, bot.js reads window.gaze.away

const g = { away: false, hasFace: false, dev: 0, yaw: 0, baseline: 0.54 };
window.gaze = g;

// we can't read pixels off a video element, but here we don't even need pixels,
// the model reads the video directly. so this is just the camera feed shown small in the corner
// autoplay = as the name suggests, it plays as soon as there is something to play
// muted + playsInline are there so the browser doesn't block the autoplay
const video = document.createElement("video");
video.autoplay = true;
video.muted = true;
video.playsInline = true;
video.style.cssText =
  "position:fixed;right:8px;bottom:8px;width:160px;border-radius:8px;opacity:.85;z-index:9999";
document.body.appendChild(video);

// fileset resolver fetches the engine that runs the compiled code (webassembly, basically fast compiled code)
const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
);

// modelAssetPath is the actual trained model (the brain) 
// createFromOptions builds the detector from that brain

const landmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  },
  runningMode: "VIDEO",  // VIDEO = it's a stream of frames, not one photo
  numFaces: 1            // only me, ignore the people sitting next to me
});
console.log("model loaded");

// these live outside loop() so they remember their values from the previous frame
let smoothIris = null;
let rawAway = false;      // this frame's decision (after hysteresis)
let stableAway = false;   // the decision we actually trust (after debounce)
let rawSince = performance.now();

// press C while looking at the middle of the game to set MY "looking" baseline
// (0.54 was measured by staring at the camera lens, but the game is at a different spot on the screen)
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyC" && g.hasFace && smoothIris !== null) g.baseline = smoothIris;
});

// this is where we make the live loop
// requestAnimationFrame is not recursion: it just asks the browser "call me again before the next frame"; u confused it with recursion bruh ,
function loop() {
  const now = performance.now();

  // detectForVideo = frame in, answer out. faceLandmarks[0] is the list of 478 points for the first face
  const pts = landmarker.detectForVideo(video, now).faceLandmarks[0];

  if (pts) {
    // i am using both eyes and averaging them, so if some random wobble is present in one eye the other keeps it honest
    // each ratio = how far along the eye (corner to corner) the iris sits, about 0.5 = looking straight
    // dividing by the eye width cancels out how close i am sitting to the camera
    const left = (pts[468].x - pts[33].x) / (pts[133].x - pts[33].x);
    const right = (pts[473].x - pts[362].x) / (pts[263].x - pts[362].x);
    const iris = (left + right) / 2;

    // smoothing: keep 80% of the old value and take 20% of the new one, so one jittery frame can't move it much
    smoothIris = smoothIris === null ? iris : smoothIris * 0.8 + iris * 0.2;

    // yaw: where the nose sits between the two cheek edges (point 1 = nose tip, 234 and 454 = cheek edges)
    // if i turn my head the nose slides towards one cheek, same idea as the very first turn ratio
    const yaw = (pts[1].x - (pts[234].x + pts[454].x) / 2) / (pts[454].x - pts[234].x);

    // we are using abs as it doesn't matter which direction i look, only that the iris moved away from my baseline
    const dev = Math.abs(smoothIris - g.baseline);
    const headTurned = Math.abs(yaw) > YAW_AWAY;

    // going into AWAY uses the bigger threshold, coming back uses the smaller one (the hysteresis from above)
    // coming back also needs the head to be mostly straight again (60% of the yaw limit)
    if (!rawAway && (dev > IRIS_AWAY || headTurned)) rawAway = true;
    else if (rawAway && dev < IRIS_BACK && Math.abs(yaw) < YAW_AWAY * 0.6) rawAway = false;

    g.hasFace = true;
    g.dev = dev;
    g.yaw = yaw;
  } else {
    // no face = away (free rule, if the model can't find my face then i'm definitely not looking at the screen)
    rawAway = true;
    g.hasFace = false;
  }

  // debounce: only switch once the new state has held for HOLD_MS
  // if the raw decision matches the trusted one, just keep resetting the timer
  if (rawAway !== stableAway) {
    if (now - rawSince >= HOLD_MS) {
      stableAway = rawAway;
      rawSince = now;
    }
  } else {
    rawSince = now;
  }
  g.away = stableAway;

  requestAnimationFrame(loop);
}  

// the camera part: navigator.mediaDevices.getUserMedia is the line that asks for permission to use the cam
// it returns a promise, because the user might take 10 seconds to click Allow
// if they say yes we get the stream (the live feed) and plug it into the video, then start the loop
// the catch part runs if they don't grant access or the camera doesn't work, and then the loop never starts
// start block lives OUTSIDE loop (calling loop() from inside loop would be real recursion)
try {
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
  await video.play();  // resolves once frames are actually coming in, so the model never gets an empty video
  loop();
} catch (err) {
  console.log("camera failed:", err);
}
