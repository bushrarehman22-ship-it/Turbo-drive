# 🏎️ Turbo Drive

A **realistic open-city driving simulator** running entirely in the browser —
built with **Next.js**, **Three.js** (WebGL) and **Rapier** physics.

## What it is

- **True car physics** — Rapier's `DynamicRayCastVehicleController` drives a
  real rigid-body chassis with per-wheel suspension, tire friction, weight
  transfer, and ray-cast wheel contacts. It's a simulation, not an arcade.
- **Procedural city (~99 km²)** — a bounded ~10×10 km grid of roads,
  sidewalks and buildings, streamed in chunks around the car with instanced
  meshes + matching static collision colliders.
- **Visuals-first rendering** — PBR materials, ACES tone mapping, soft
  shadows, exponential fog, gradient sky, and a full **day/night cycle**.
- **Gameplay** — free drive, chase/hood/cockpit/orbit cameras, HUD
  speedometer, keyboard + gamepad input.

## Tech stack

| Concern  | Choice |
|----------|--------|
| App shell | Next.js (App Router) |
| 3D engine | Three.js (WebGL) |
| Physics  | @dimforge/rapier3d-compat |
| State    | Zustand |

## Controls

| Action | Key |
|--------|-----|
| Accelerate | `W` / `↑` |
| Brake / reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake | `Space` |
| Reset car | `R` |
| Cycle camera | `C` |

## Running

```bash
npm install
npm run dev      # http://localhost:3000
```

## Project structure

```
src/
  app/            Next.js pages + globals
  components/     Game mount, HUD, menu (React)
  game/
    engine.ts     render loop + orchestration
    physics.ts    Rapier world + vehicle controller
    car.ts        procedural car model + wheel rig
    city.ts       procedural city (roads, buildings, chunk streaming)
    sky.ts        sky dome + sun/moon + day/night
    camera.ts     chase camera
    input.ts      keyboard + gamepad
    textures.ts   procedural canvas textures (asphalt, facades, …)
    store.ts      Zustand state + HUD telemetry
```

## Roadmap

- [x] Core engine, physics, procedural city, day/night
- [ ] AI traffic + pedestrians
- [ ] Checkpoints / timed laps
- [ ] Post-processing (bloom, SSAO)
- [ ] AI-generated PBR textures (asphalt, facades, skybox)
- [ ] Engine audio
