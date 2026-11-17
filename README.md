# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mattxzte/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mattxzte/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR HEAT — an open-world crime game in the spirit of GTA 6, built for the make.fun bounty. Jax Marlowe is back in Solmar, a sun-soaked coastal city, with empty pockets and a crew that owes everybody. Mara Voss has five jobs lined up: borrowed wheels, three drops, a hot pursuit, a rival crew, and one last grab at the Solmar Grand.

## What is in the game

- A 9×9-block coastal city to explore on foot and by car: tower plaza, parks, beach and ocean, marina with boats
- Traffic cars circling the roads and pedestrians who flee gunfire and speeding cars
- Steal any car (jack one with a driver and the cops come), arcade driving with a chase camera
- A 0–5 star wanted system: pursuing cruisers with flashing light bars and sirens, foot officers, heat that cools off when you lay low
- Five story missions with a gold beacon, timers and rewards: Borrowed Wheels, Three Drops, Hot Pursuit, Mara's Ride, The Solmar Job
- Combat: pistol with tracers and muzzle flash, punching, rival gunmen, cash drops, hospital respawn
- HUD with cash, health, ammo, wanted stars, speed, objective + distance + timer, and a live minimap
- Start menu, pause, autosave and Continue (localStorage), synthesized WebAudio music and sound effects — no audio files
- Plays offline from static files, keyboard + mouse, no network requests

## Run it

Serve `game/` with any static server and open `game/index.html` in a desktop browser, for example:

```sh
cd game && python3 -m http.server 8080
```

Then open http://localhost:8080. Or run `node main.ts` with `MAKEFUN_OUTPUT_DIR=out` to build the submission bundle.

## How to play

- WASD move / drive, mouse drag orbits the camera, wheel zooms
- E steal a car / get out, click shoot, F punch, R reload
- Shift sprint, Space jump / handbrake, M next mission, N sound, Esc pause
- Follow the gold beacon and the minimap to each job

## Shots

The screenshots under screenshots/ are real renders of the game, taken with `?shot=cover|foot|mission|city&seed=1` — a chase with the wanted level up, Jax on foot with the police nearby, a mission in progress, and the city from above.

## Layout

- `game/` — the playable game (static files, `game/index.html`)
- `game/src/` — the game's own source, one job per file: city, player, vehicles, traffic, police, missions, combat, hud, audio, save, shots
- `game/vendor/three/three.module.min.js` — vendored three.js (r187, minified)
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

---

<sub>Entered on [make.fun](https://make.fun/?ref=nv10mx49&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
