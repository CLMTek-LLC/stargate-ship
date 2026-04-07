/**
 * Procedural isometric sprite generator.
 *
 * Generates sprite atlas PNGs and a manifest.json for each module type,
 * hull tiles, and background elements. Uses sharp for image composition.
 *
 * Run: npx tsx scripts/generate-sprites.ts
 */

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT = join(import.meta.dirname, '..', 'public', 'sprites')
mkdirSync(OUT, { recursive: true })

// Sprite dimensions — classic 2:1 isometric tile
const TILE_W = 64
const TILE_H = 48
// Module sprite is slightly taller to include the "building" portion
const MOD_W = 64
const MOD_H = 64

// ── Color helpers ──────────────────────────────────────────────────────

interface RGBA { r: number; g: number; b: number; a: number }

function hex(color: number): RGBA {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
    a: 255,
  }
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  }
}

function brighten(c: RGBA, factor: number): RGBA {
  return {
    r: Math.min(255, Math.round(c.r * factor)),
    g: Math.min(255, Math.round(c.g * factor)),
    b: Math.min(255, Math.round(c.b * factor)),
    a: c.a,
  }
}

function darken(c: RGBA, factor: number): RGBA {
  return brighten(c, 1 / factor)
}

/** Deterministic PRNG for reproducible sprite generation */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── SVG-based drawing (rasterized via sharp) ───────────────────────────

/** Create an isometric diamond (floor tile) as SVG */
function isoFloorSVG(w: number, h: number, fill: RGBA, stroke: RGBA): string {
  const hw = w / 2, hh = h / 2
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${hw},2 ${w - 2},${hh} ${hw},${h - 2} 2,${hh}"
      fill="rgb(${fill.r},${fill.g},${fill.b})" fill-opacity="${fill.a / 255}"
      stroke="rgb(${stroke.r},${stroke.g},${stroke.b})" stroke-width="1.5"
      stroke-opacity="${stroke.a / 255}"/>
  </svg>`
}

/** Create an isometric box (module) as SVG — top face + left face + right face */
function isoBoxSVG(
  w: number, h: number,
  boxH: number, // box "height" in pixels from top face
  top: RGBA, left: RGBA, right: RGBA,
  glow?: RGBA,
  glowIntensity = 0,
): string {
  const hw = w / 2
  const faceTop = h - boxH // Y position of top face center
  const topY = faceTop - (TILE_H / 2 - 4)

  // Top diamond
  const tCx = hw, tCy = topY + TILE_H / 4
  const tL = `${2},${topY + TILE_H / 4}`
  const tT = `${hw},${topY}`
  const tR = `${w - 2},${topY + TILE_H / 4}`
  const tB = `${hw},${topY + TILE_H / 2}`

  // Left face (parallelogram)
  const lTL = tL
  const lBL = `${2},${topY + TILE_H / 4 + boxH}`
  const lBR = `${hw},${topY + TILE_H / 2 + boxH}`
  const lTR = tB

  // Right face
  const rTL = tB
  const rBL = lBR
  const rBR = `${w - 2},${topY + TILE_H / 4 + boxH}`
  const rTR = tR

  let glowFilter = ''
  let glowCircle = ''
  if (glow && glowIntensity > 0) {
    glowFilter = `<defs><filter id="g"><feGaussianBlur stdDeviation="${4 * glowIntensity}"/></filter></defs>`
    glowCircle = `<circle cx="${hw}" cy="${topY + TILE_H / 4}" r="${12 * glowIntensity}"
      fill="rgb(${glow.r},${glow.g},${glow.b})" opacity="${0.5 * glowIntensity}" filter="url(#g)"/>`
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${glowFilter}
    ${glowCircle}
    <polygon points="${lTL} ${lTR} ${lBR} ${lBL}"
      fill="rgb(${left.r},${left.g},${left.b})" fill-opacity="${left.a / 255}"/>
    <polygon points="${rTL} ${rTR} ${rBR} ${rBL}"
      fill="rgb(${right.r},${right.g},${right.b})" fill-opacity="${right.a / 255}"/>
    <polygon points="${tT} ${tR} ${tB} ${tL}"
      fill="rgb(${top.r},${top.g},${top.b})" fill-opacity="${top.a / 255}"/>
  </svg>`
}

/** Create a "detail" overlay — lines, dots, panels on the module face */
function detailOverlaySVG(w: number, h: number, color: RGBA, variant: string): string {
  const hw = w / 2
  let details = ''
  const c = `rgb(${color.r},${color.g},${color.b})`

  switch (variant) {
    case 'laser':
      // Diagonal line suggesting a laser barrel
      details = `<line x1="${hw - 8}" y1="${h - 32}" x2="${hw + 12}" y2="${h - 44}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${hw + 12}" cy="${h - 44}" r="2" fill="${c}"/>
        <circle cx="${hw - 2}" cy="${h - 28}" r="3" fill="${c}" opacity="0.5"/>`
      break
    case 'refinery':
      // Smokestack / pipes
      details = `<rect x="${hw - 6}" y="${h - 48}" width="4" height="16" rx="1" fill="${c}" opacity="0.7"/>
        <rect x="${hw + 4}" y="${h - 44}" width="4" height="12" rx="1" fill="${c}" opacity="0.7"/>
        <circle cx="${hw - 4}" cy="${h - 50}" r="3" fill="${c}" opacity="0.4"/>
        <circle cx="${hw + 6}" cy="${h - 46}" r="2.5" fill="${c}" opacity="0.4"/>`
      break
    case 'solar':
      // Grid lines on top suggesting panels
      details = `<line x1="${hw - 14}" y1="${h - 40}" x2="${hw + 14}" y2="${h - 40}" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
        <line x1="${hw - 10}" y1="${h - 36}" x2="${hw + 10}" y2="${h - 36}" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
        <line x1="${hw}" y1="${h - 46}" x2="${hw}" y2="${h - 32}" stroke="${c}" stroke-width="0.8" opacity="0.6"/>`
      break
    case 'reactor':
      // Core circle glow
      details = `<circle cx="${hw}" cy="${h - 38}" r="6" fill="none" stroke="${c}" stroke-width="1.5"/>
        <circle cx="${hw}" cy="${h - 38}" r="3" fill="${c}" opacity="0.8"/>
        <circle cx="${hw}" cy="${h - 38}" r="9" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.4"/>`
      break
    case 'storage':
      // Crate lines
      details = `<rect x="${hw - 10}" y="${h - 40}" width="20" height="12" rx="1" fill="none" stroke="${c}" stroke-width="1"/>
        <line x1="${hw}" y1="${h - 40}" x2="${hw}" y2="${h - 28}" stroke="${c}" stroke-width="0.8"/>
        <line x1="${hw - 10}" y1="${h - 34}" x2="${hw + 10}" y2="${h - 34}" stroke="${c}" stroke-width="0.8"/>`
      break
    case 'crew':
      // Window lights
      details = `<rect x="${hw - 8}" y="${h - 42}" width="5" height="4" rx="1" fill="${c}" opacity="0.8"/>
        <rect x="${hw + 3}" y="${h - 42}" width="5" height="4" rx="1" fill="${c}" opacity="0.6"/>
        <rect x="${hw - 3}" y="${h - 35}" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>`
      break
    case 'crystal':
      // Crystal shard shapes
      details = `<polygon points="${hw - 2},${h - 48} ${hw + 3},${h - 38} ${hw - 4},${h - 36}" fill="${c}" opacity="0.8"/>
        <polygon points="${hw + 5},${h - 46} ${hw + 9},${h - 37} ${hw + 2},${h - 35}" fill="${c}" opacity="0.6"/>
        <polygon points="${hw - 8},${h - 42} ${hw - 5},${h - 34} ${hw - 10},${h - 34}" fill="${c}" opacity="0.5"/>`
      break
    case 'stargate':
      // Ring / portal
      details = `<circle cx="${hw}" cy="${h - 40}" r="12" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.8"/>
        <circle cx="${hw}" cy="${h - 40}" r="8" fill="${c}" opacity="0.25"/>
        <circle cx="${hw}" cy="${h - 40}" r="4" fill="${c}" opacity="0.4"/>
        <line x1="${hw - 14}" y1="${h - 40}" x2="${hw - 8}" y2="${h - 40}" stroke="${c}" stroke-width="1"/>
        <line x1="${hw + 8}" y1="${h - 40}" x2="${hw + 14}" y2="${h - 40}" stroke="${c}" stroke-width="1"/>
        <line x1="${hw}" y1="${h - 54}" x2="${hw}" y2="${h - 48}" stroke="${c}" stroke-width="1"/>
        <line x1="${hw}" y1="${h - 32}" x2="${hw}" y2="${h - 26}" stroke="${c}" stroke-width="1"/>`
      break
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${details}</svg>`
}

// ── Module config ──────────────────────────────────────────────────────

interface ModuleSpriteConfig {
  id: string
  color: number
  detailVariant: string
  boxHeight: number       // pixel height of the 3D box portion
  frameWidth: number      // total sprite width (for 2x1: 128, 3x2: 192)
  frameHeight: number     // total sprite height
  idleFrames: number
  activeFrames: number
  offlineFrames: number
}

const MODULES: ModuleSpriteConfig[] = [
  { id: 'mining_laser',     color: 0x4ade80, detailVariant: 'laser',    boxHeight: 22, frameWidth: MOD_W, frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'refinery',         color: 0x22c55e, detailVariant: 'refinery',  boxHeight: 26, frameWidth: 128,  frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'solar_panel',      color: 0xfbbf24, detailVariant: 'solar',    boxHeight: 16, frameWidth: MOD_W, frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'fusion_reactor',   color: 0xf59e0b, detailVariant: 'reactor',  boxHeight: 28, frameWidth: 128,  frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'storage_bay',      color: 0xfb923c, detailVariant: 'storage',  boxHeight: 20, frameWidth: MOD_W, frameHeight: MOD_H, idleFrames: 4, activeFrames: 4, offlineFrames: 2 },
  { id: 'crew_quarters',    color: 0x60a5fa, detailVariant: 'crew',     boxHeight: 24, frameWidth: MOD_W, frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'crystal_extractor',color: 0x818cf8, detailVariant: 'crystal',  boxHeight: 24, frameWidth: MOD_W, frameHeight: MOD_H, idleFrames: 4, activeFrames: 8, offlineFrames: 2 },
  { id: 'stargate_core',    color: 0xc084fc, detailVariant: 'stargate', boxHeight: 32, frameWidth: 192,  frameHeight: 96,    idleFrames: 6, activeFrames: 12, offlineFrames: 2 },
]

// ── Frame generation ───────────────────────────────────────────────────

async function generateModuleFrame(
  cfg: ModuleSpriteConfig,
  state: 'idle' | 'active' | 'offline',
  frameIndex: number,
  totalFrames: number,
): Promise<Buffer> {
  const base = hex(cfg.color)
  const t = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0

  let topColor: RGBA
  let leftColor: RGBA
  let rightColor: RGBA
  let glow: RGBA | undefined
  let glowIntensity = 0
  let detailColor: RGBA

  if (state === 'offline') {
    const red = hex(0xef4444)
    const gray = hex(0x555555)
    const blend = t // flicker between red and gray
    topColor = lerpColor(gray, darken(red, 1.2), blend)
    leftColor = darken(topColor, 1.4)
    rightColor = darken(topColor, 1.2)
    detailColor = lerpColor(hex(0x666666), hex(0xcc3333), blend)
    glow = red
    glowIntensity = 0.3 + blend * 0.3
  } else if (state === 'active') {
    // Pulse/cycle the brightness
    const pulse = Math.sin(t * Math.PI * 2) * 0.5 + 0.5
    topColor = brighten(base, 1.0 + pulse * 0.3)
    leftColor = darken(base, 1.3 - pulse * 0.1)
    rightColor = darken(base, 1.15 - pulse * 0.05)
    detailColor = brighten(base, 1.4 + pulse * 0.4)
    glow = brighten(base, 1.5)
    glowIntensity = 0.4 + pulse * 0.6
  } else {
    // Idle: gentle pulse
    const pulse = Math.sin(t * Math.PI * 2) * 0.5 + 0.5
    topColor = brighten(base, 0.9 + pulse * 0.15)
    leftColor = darken(base, 1.4)
    rightColor = darken(base, 1.2)
    detailColor = brighten(base, 1.2 + pulse * 0.2)
    glow = base
    glowIntensity = 0.1 + pulse * 0.2
  }

  const w = cfg.frameWidth
  const h = cfg.frameHeight

  // Render box SVG
  const boxSvg = isoBoxSVG(w, h, cfg.boxHeight, topColor, leftColor, rightColor, glow, glowIntensity)
  const boxBuf = Buffer.from(boxSvg)

  // Render detail SVG
  const detSvg = detailOverlaySVG(w, h, detailColor, cfg.detailVariant)
  const detBuf = Buffer.from(detSvg)

  // Composite
  const result = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: await sharp(boxBuf).resize(w, h).png().toBuffer(), top: 0, left: 0 },
      { input: await sharp(detBuf).resize(w, h).png().toBuffer(), top: 0, left: 0 },
    ])
    .png()
    .toBuffer()

  return result
}

// ── Atlas stitching ────────────────────────────────────────────────────

interface AtlasEntry {
  state: string
  frames: number
  fps: number
  loop: boolean
  y: number
  frameWidth: number
  frameHeight: number
}

interface ManifestModule {
  id: string
  file: string
  width: number
  height: number
  animations: Record<string, AtlasEntry>
}

interface Manifest {
  tileWidth: number
  tileHeight: number
  modules: Record<string, ManifestModule>
  hull: { file: string; width: number; height: number }
  nebula: { file: string; width: number; height: number }
}

async function generateModuleAtlas(cfg: ModuleSpriteConfig): Promise<ManifestModule> {
  const states: { name: string; frames: number; fps: number; loop: boolean }[] = [
    { name: 'idle', frames: cfg.idleFrames, fps: 4, loop: true },
    { name: 'active', frames: cfg.activeFrames, fps: 8, loop: true },
    { name: 'offline', frames: cfg.offlineFrames, fps: 2, loop: true },
  ]

  const fw = cfg.frameWidth
  const fh = cfg.frameHeight
  const totalFrames = states.reduce((s, st) => s + st.frames, 0)
  const maxCols = Math.max(...states.map((s) => s.frames))
  const atlasW = maxCols * fw
  const atlasH = states.length * fh

  // Generate all frames
  const composites: sharp.OverlayOptions[] = []
  const animations: Record<string, AtlasEntry> = {}
  let rowY = 0

  for (const st of states) {
    animations[st.name] = {
      state: st.name,
      frames: st.frames,
      fps: st.fps,
      loop: st.loop,
      y: rowY,
      frameWidth: fw,
      frameHeight: fh,
    }

    for (let f = 0; f < st.frames; f++) {
      const buf = await generateModuleFrame(
        cfg,
        st.name as 'idle' | 'active' | 'offline',
        f,
        st.frames,
      )
      composites.push({ input: buf, top: rowY, left: f * fw })
    }
    rowY += fh
  }

  const atlas = await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()

  const filename = `${cfg.id}.png`
  writeFileSync(join(OUT, filename), atlas)

  return {
    id: cfg.id,
    file: filename,
    width: atlasW,
    height: atlasH,
    animations,
  }
}

// ── Hull tile ──────────────────────────────────────────────────────────

async function generateHullTile(): Promise<void> {
  const fill = hex(0x2a2a3e)
  const stroke = { ...hex(0x4b5563), a: 180 }
  const svg = isoFloorSVG(TILE_W, TILE_H, fill, stroke)

  // Also generate an "edge" variant with brighter border
  const edgeStroke = { ...hex(0x7c3aed), a: 120 }
  const edgeSvg = isoFloorSVG(TILE_W, TILE_H, fill, edgeStroke)

  // Stitch into a 2-tile strip: normal | edge
  const normalBuf = await sharp(Buffer.from(svg)).resize(TILE_W, TILE_H).png().toBuffer()
  const edgeBuf = await sharp(Buffer.from(edgeSvg)).resize(TILE_W, TILE_H).png().toBuffer()

  const atlas = await sharp({
    create: { width: TILE_W * 2, height: TILE_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: normalBuf, top: 0, left: 0 },
      { input: edgeBuf, top: 0, left: TILE_W },
    ])
    .png()
    .toBuffer()

  writeFileSync(join(OUT, 'hull.png'), atlas)
}

// ── Nebula ─────────────────────────────────────────────────────────────

async function generateNebula(): Promise<void> {
  const w = 512, h = 256
  // Create a soft nebula cloud using overlapping SVG ellipses.
  // Use a deterministic PRNG so the tracked asset is stable across builds.
  const rand = mulberry32(0x5e7a1c2d)
  const blobs: string[] = []
  const colors = [
    { r: 80, g: 40, b: 140 },
    { r: 40, g: 60, b: 120 },
    { r: 100, g: 30, b: 100 },
    { r: 60, g: 80, b: 160 },
  ]

  for (let i = 0; i < 12; i++) {
    const c = colors[i % colors.length]
    const cx = 80 + rand() * (w - 160)
    const cy = 40 + rand() * (h - 80)
    const rx = 60 + rand() * 120
    const ry = 30 + rand() * 60
    blobs.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgb(${c.r},${c.g},${c.b})" opacity="${0.15 + rand() * 0.15}" filter="url(#nb)"/>`)
  }

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="nb"><feGaussianBlur stdDeviation="30"/></filter></defs>
    ${blobs.join('\n')}
  </svg>`

  const buf = await sharp(Buffer.from(svg)).resize(w, h).png().toBuffer()
  writeFileSync(join(OUT, 'nebula.png'), buf)
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating sprites...')

  const manifest: Manifest = {
    tileWidth: TILE_W,
    tileHeight: TILE_H,
    modules: {},
    hull: { file: 'hull.png', width: TILE_W * 2, height: TILE_H },
    nebula: { file: 'nebula.png', width: 512, height: 256 },
  }

  // Generate all module atlases
  for (const cfg of MODULES) {
    console.log(`  ${cfg.id}...`)
    const entry = await generateModuleAtlas(cfg)
    manifest.modules[cfg.id] = entry
  }

  // Hull
  console.log('  hull tiles...')
  await generateHullTile()

  // Nebula
  console.log('  nebula...')
  await generateNebula()

  // Write manifest
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`Done! Output: ${OUT}`)
}

main().catch((err) => {
  console.error('Sprite generation failed:', err)
  process.exit(1)
})
