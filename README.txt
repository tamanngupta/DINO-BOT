dino-bot: Chrome dino + gaze-controlled autopilot

RUN
  1. cd into this folder
  2. python3 -m http.server 8000
  3. open http://localhost:8000   (must be localhost, the camera is blocked on file:// paths)
  4. hard refresh (Cmd+Shift+R), click Allow on the camera, then click on the page and press space

KEYS
  space / up  jump        down  duck
  B           fake "I looked away" (tests the bot with no camera)
  C           look at the middle of the game, press C = set your "looking" baseline

FILES
  index.html, index.js, index.css, assets/   the game (wayou's t-rex-runner), only index.html's bottom script tags changed
  bot.js    autopilot + YOU/BOT mode switch + HUD
  gaze.js   camera -> window.gaze.away
