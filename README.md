# Stargate Ship

A mobile-first ship management game built with Three.js. Build and manage your factory ship, gather resources, and activate the Stargate to travel to a new star system.

**Play now:** [stargate-ship.coredumped.org](https://stargate-ship.coredumped.org)

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
- F key — Toggle FPS debug overlay (current, 2-min average, min, % ≥58fps)

## How to Play

1. Start with 50 Iron, 4 crew, plus 2 Solar Panels, Storage Bay, and Crew Quarters pre-built
2. Tap **BUILD** to open the build panel
3. Select a module, then tap a grid cell to place it
4. Build Solar Panels first for power, then Mining Lasers for iron
5. Build a **Crystal Extractor** early to start generating Crystal (also needed for the Stargate)
6. Add Crew Quarters as your ship grows (1 crew per 3 modules)
7. Build Storage Bays to increase resource capacity
8. Work toward the **Stargate Core** — costs 500 Iron + 200 Crystal
9. Fill the Stargate progress bar to 100% to win!

### Game Systems

**Progressive Power Brownout:** When energy drops below 30%, low-priority modules throttle to 50%. At <15%, low-priority modules go offline entirely. Power producers never shut down so you always have a recovery path.

**Crew Shortage:** When crew falls below 75% of required, production throttles to 50%. At <50% → 25%, at <25% → 10%. Combines multiplicatively with the power brownout system.

**Tutorial Tooltips:** First-time players get a 4-step guided tour (Welcome → Resources → Building → Stargate). Returning players with existing saves skip the tutorial automatically.

**Placement Feedback:** Module placement triggers a satisfying glow burst ring animation in the module's color.

**Hull Ambient Glow:** Ship hull has a breathing purple emissive glow that pulses at 1.2 Hz.

## Modules

| Module | Size | Power | Effect | Cost |
|--------|------|-------|--------|------|
| Solar Panel | 1×1 | +5/s | Energy production | 30 Iron |
| Mining Laser | 1×1 | -2/s | 1 Iron/s | 50 Iron |
| Refinery | 2×1 | -3/s | 2 Iron/s | **150 Iron** |
| Storage Bay | 1×1 | -1/s | +500 capacity | 40 Iron |
| Crew Quarters | 1×1 | -1/s | +2 crew | 60 Iron |
| Fusion Reactor | 2×1 | +20/s | High energy | **500 Iron** |
| Crystal Extractor | 1×1 | -4/s | 0.5 Crystal/s | **350 Iron** |
| Stargate Core | 3×2 | -10/s | Win condition | 500 Iron + 200 Crystal |

**Crystal** is a secondary resource produced by Crystal Extractors (0.5/s each) and is required only for the Stargate Core.

## Stargate Progress Bar

The stargate progress bar shows your advancement toward the win condition:
- **Diamond milestones** at 25%, 50%, and 75% that glow purple when reached
- **Per-resource breakdown** bars (Iron, Crystal, Energy, Crew) visible after placing the Stargate Core
- Animated shimmer sweep effect across the bar

## Build for iOS

```bash
bun run build
npx cap sync
npx cap open ios
```

Then build and run from Xcode.

## PWA

The game is a fully installable Progressive Web App with:
- Service worker for offline support
- Manifest with app icons (192px, 512px, apple-touch-icon)
- Optimized Cloudflare cache headers for content-hashed assets

## Tech Stack

- Three.js — 3D rendering with isometric camera
- Vite — Build tool
- TypeScript — Type safety
- Zustand — State management
- Hammer.js — Touch gestures
- GSAP — Animations
- Capacitor — iOS/Android wrapper
- Cloudflare Pages — Deployment
