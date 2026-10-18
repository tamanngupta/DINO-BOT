// bot.js - dino autopilot + mode switch (YOU <-> BOT)
// load order in index.html:
//   <script src="index.js"></script>
//   <script src="bot.js"></script>
//   <script type="module" src="gaze.js"></script>

(function () {
  // ---- knobs (put the numbers that worked for me here) ----
  var JUMP_K = 16;      // jump when distance < JUMP_K * closing speed. why speed? the world slides faster at higher speed, so one jump covers more ground and we must start earlier
  var DUCK_K = 10;      // same idea for ducking under a mid-height bird (a guess, tune it)
  var HANDOFF_K = 32;   // give control back to me only if the next obstacle is farther than HANDOFF_K * speed
  var DEBUG = true;     // print a CRASH report when the dino dies, so tuning is data instead of guessing
  // ----------------------------------------------------------

  var game;                // the game's brain: Runner.instance_ (a singleton, only one exists)
  var mode = "HUMAN";      // state machine: always exactly one of "HUMAN" or "BOT"
  var forceBot = false;    // press B to fake "away" without the camera (to test this file alone)
  var last = null;         // what the bot saw on its latest look at an obstacle
  var jumpInfo = null;     // what it saw at the moment it last jumped
  var wasCrashed = false;  // remembers last frame's crashed, so we log only once per crash

  // B key = pretend i looked away. this lets me test the bot and the mode switch before the camera is involved
  document.addEventListener("keydown", function (e) {
    if (e.code === "KeyB") forceBot = !forceBot;
  });

  // HUD: a small box in the corner. green = i am driving, red = the bot is driving
  var hud = document.createElement("div");
  hud.style.cssText =
    "position:fixed;left:8px;top:8px;font:14px monospace;padding:6px 10px;" +
    "border-radius:8px;color:#fff;z-index:9999";
  document.body.appendChild(hud);

  // the HUD also shows the live camera numbers, so when it misfires i can see WHY (that's how we pick thresholds from data)
  function drawHud() {
    var g = window.gaze;  // set by gaze.js, it's undefined until the camera finishes loading
    hud.style.background = mode === "BOT" ? "#c0392b" : "#27ae60";
    var text = mode === "BOT" ? "BOT" : "YOU";
    if (forceBot) text += " (B key)";
    if (!g) text += "  camera loading...";
    else text += "  iris " + g.dev.toFixed(2) + "  yaw " + g.yaw.toFixed(2) + (g.hasFace ? "" : "  NO FACE");
    hud.textContent = text;
  }

  // find the first obstacle that still matters
  // why not just obstacles[0]? the game keeps an obstacle in the list until it leaves the whole screen,
  // so [0] can be a cactus the dino already jumped over. we want the first one still AHEAD of the dino
  function nextObstacle(dino) {
    var list = game.horizon.obstacles;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.xPos + o.width <= dino.xPos) continue;  // already behind us, skip
      // a bird at yPos 50 flies over a running dino, jumping would fly me INTO it, so ignore it
      if (o.typeConfig.type === "PTERODACTYL" && o.yPos === 50) continue;
      return o;
    }
    return null;  // nothing ahead (the list is also empty for the first 3 seconds)
  }

  // the game loop for the bot: runs every frame, same requestAnimationFrame idea as everything else
  function tick() {
    var dino = game.tRex;
    // tRex is built a moment after the page loads, so if it isn't there yet just try again next frame
    if (!dino) { requestAnimationFrame(tick); return; }

    var g = window.gaze;
    var wantBot = forceBot || (g && g.away);        // either the B key or the camera can ask for the bot
    var playing = game.playing && !game.crashed;    // the bot only acts while a run is live

    var o = null;
    var dist = Infinity;       // Infinity = no obstacle ahead = plenty of room
    var v = game.currentSpeed;
    if (playing) {
      o = nextObstacle(dino);
      if (o) {
        dist = o.xPos - dino.xPos;  // distance to the next obstacle = obstacle x minus dino x (both left edges)
        // birds fly at their own speed (speedOffset), so the real closing speed includes it
        v = game.currentSpeed + (o.speedOffset || 0);
      }
    }

    // ---- state machine ----
    // HUMAN -> BOT: the moment i look away
    // BOT -> HUMAN: only when i'm looking AND it's safe to hand over
    if (mode === "HUMAN" && wantBot) {
      mode = "BOT";
    } else if (mode === "BOT" && !wantBot) {
      // handoff rule: never give control back mid-jump, mid-duck, or with an obstacle about to arrive,
      // otherwise i'd take over with no time to react and eat a cactus
      var safe = !playing || (!dino.jumping && !dino.ducking && dist > HANDOFF_K * v);
      if (safe) mode = "HUMAN";
    }

    // ---- bot actions (only when the bot is the one driving) ----
    if (playing && mode === "BOT") {
      var wantDuck = false;

      if (o) {
        var type = o.typeConfig.type;
        // snapshot of what the bot is looking at, used by the CRASH report
        last = {
          type: type,
          yPos: o.yPos,
          width: o.width,
          dist: Math.round(dist),
          speed: +game.currentSpeed.toFixed(2),
          distOverSpeed: +(dist / v).toFixed(1)
        };

        if (type !== "PTERODACTYL" || o.yPos === 100) {
          // cactus, or a low bird (bird at yPos 100 hits head AND body, ducking won't save me): jump
          // !dino.jumping so it doesn't trigger again while already in the air
          if (dist < JUMP_K * v && !dino.jumping) {
            if (dino.ducking) dino.setDuck(false);  // stand up first, then jump
            dino.startJump(game.currentSpeed);
            jumpInfo = last;
          }
        } else if (o.yPos === 75) {
          // mid-height bird only reaches the head, and ducking removes the head hitbox: duck
          if (dist < DUCK_K * v && !dino.jumping) wantDuck = true;
        }
      }

      // setDuck toggles (calling it twice stands me back up), so only call it when the state actually has to change
      if (wantDuck && !dino.ducking) dino.setDuck(true);
      else if (!wantDuck && dino.ducking && !dino.jumping) dino.setDuck(false);
    }

    // CRASH report: what the bot last saw, and whether it was mid-jump when it died
    // on the ground = jumped too early (or never jumped), in the air = jumped too late
    if (DEBUG && game.crashed && !wasCrashed) {
      console.log("CRASH", {
        mode: mode,
        lastSeen: last,
        jumpedWhen: jumpInfo,
        dinoWasJumping: dino.jumping,
        dinoWasDucking: dino.ducking,
        score: game.distanceMeter.getActualDistance(Math.ceil(game.distanceRan))
      });
    }
    wasCrashed = game.crashed;

    drawHud();
    requestAnimationFrame(tick);
  }

  // wait for the page to fully load, because the game creates Runner.instance_ while loading
  // (same idea as the readyState check for the video: don't use the thing before it exists)
  window.addEventListener("load", function () {
    game = Runner.instance_;
    tick();
  });
})();
