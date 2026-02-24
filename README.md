# Stargate Ship

A mobile-first ship management game built with Three.js. Build and manage your factory ship, gather resources, and activate the Stargate to travel to a new star system.

## Quick Start

> This project uses [Bun](https://bun.sh) as the package manager and runtime.
> Install Bun if you haven't already: `curl -fsSL https://bun.sh/install | bash`

```bash
bun install
bun run dev
```

Open http://localhost:5173 in your browser (works best on iPad/tablet).

> **Note:** `bun.lock` is the canonical lockfile for this project. `package-lock.json` may also be present but is not used.

## Controls

**Touch (iPad/Tablet):**
- Tap — Select module / place module (in build mode)
- Long press — Open build menu
- Pinch — Zoom in/out
- Two-finger pan — Move camera

**Desktop (Mouse):**
- Left click — Select / place
- Right-click drag — Pan camera
- Scroll wheel — Zoom

## How to Play

1. Start with 100 Iron and 2 crew
2. Tap **BUILD** to open the build panel
3. Select a module, then tap a grid cell to place it
4. Build Solar Panels first for power, then Mining Lasers for iron
5. Add Crew Quarters as your ship grows (1 crew per 3 modules)
6. Build Storage Bays to increase resource capacity
7. Work toward the **Stargate Core** — costs 500 Iron + 200 Crystal
8. Fill the Stargate progress bar to 100% to win!

## Modules

| Module | Size | Power | Effect | Cost |
|--------|------|-------|--------|------|
| Solar Panel | 1×1 | +5/s | Energy production | 30 Iron |
| Mining Laser | 1×1 | -2/s | 1 Iron/s | 50 Iron |
| Refinery | 2×1 | -3/s | 2 Iron/s | 100 Iron |
| Storage Bay | 1×1 | -1/s | +500 capacity | 40 Iron |
| Crew Quarters | 1×1 | -1/s | +2 crew | 60 Iron |
| Fusion Reactor | 2×1 | +20/s | High energy | 200 Iron |
| Crystal Extractor | 1×1 | -4/s | 0.5 Crystal/s | 150 Iron |
| Stargate Core | 3×2 | -10/s | Win condition | 500 Iron + 200 Crystal |

## Build for iOS

```bash
bun run build
bunx cap sync
bunx cap open ios
```

Then build and run from Xcode.

## Tech Stack

- Three.js — 3D rendering with isometric camera
- Vite — Build tool
- TypeScript — Type safety
- Zustand — State management
- Hammer.js — Touch gestures
- GSAP — Animations
- Capacitor — iOS/Android wrapper
