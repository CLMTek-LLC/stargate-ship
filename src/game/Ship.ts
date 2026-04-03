import * as THREE from 'three'
import gsap from 'gsap'
import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE, type PlacedModule } from './resources/types'
import { MODULE_DEFS } from './modules/index'
import { gameStore } from './resources/ResourceManager'
import type { SpriteSheet } from './SpriteSheet'

const HULL_COLOR = 0x374151
const HULL_BORDER_COLOR = 0x1f2937
const GRID_LINE_COLOR = 0x4b5563
const OFFLINE_COLOR = 0xef4444

// World size of a single-cell sprite (matches iso tile ratio)
const SPRITE_CELL_W = 1.0
const SPRITE_CELL_H = 1.0

interface ModuleMeshEntry {
  group: THREE.Group
  mesh: THREE.Mesh
  defId: string
  isSprite: boolean
  currentAnim: string
}

export class Ship {
  group: THREE.Group
  private gridPlane: THREE.Mesh
  private moduleGroup: THREE.Group
  private hullTileGroup: THREE.Group
  private moduleMeshes: Map<string, ModuleMeshEntry> = new Map()
  private hullOutline: THREE.LineSegments
  private spriteSheet: SpriteSheet | null = null

  // Enhanced particles
  private particleSystems: Map<string, THREE.Points> = new Map()
  private particlePool: {
    positions: Float32Array
    velocities: Float32Array
    colors: Float32Array
    lifetimes: Float32Array
    points: THREE.Points
  } | null = null

  constructor(spriteSheet?: SpriteSheet) {
    this.spriteSheet = spriteSheet ?? null
    this.group = new THREE.Group()
    this.moduleGroup = new THREE.Group()
    this.hullTileGroup = new THREE.Group()

    // Grid base (hull floor)
    const gridGeo = new THREE.BoxGeometry(
      GRID_WIDTH * CELL_SIZE,
      0.15,
      GRID_HEIGHT * CELL_SIZE
    )
    const gridMat = new THREE.MeshStandardMaterial({
      color: HULL_COLOR,
      roughness: 0.8,
      metalness: 0.2,
    })
    this.gridPlane = new THREE.Mesh(gridGeo, gridMat)
    this.gridPlane.position.set(
      (GRID_WIDTH * CELL_SIZE) / 2 - CELL_SIZE / 2,
      -0.075,
      (GRID_HEIGHT * CELL_SIZE) / 2 - CELL_SIZE / 2
    )
    this.gridPlane.receiveShadow = true
    this.group.add(this.gridPlane)

    // Grid lines
    this.group.add(this.createGridLines())

    // Hull outline
    this.hullOutline = this.createHullOutline()
    this.group.add(this.hullOutline)

    // Hull sprite tiles (layered on top of the base)
    this.group.add(this.hullTileGroup)
    if (this.spriteSheet?.isLoaded()) {
      this.buildHullTiles()
    }

    this.group.add(this.moduleGroup)

    // Particle pool
    this.initParticlePool()

    // Center the ship group
    this.group.position.set(
      -(GRID_WIDTH * CELL_SIZE) / 2,
      0,
      -(GRID_HEIGHT * CELL_SIZE) / 2
    )
  }

  private buildHullTiles() {
    if (!this.spriteSheet) return

    for (let gx = 0; gx < GRID_WIDTH; gx++) {
      for (let gy = 0; gy < GRID_HEIGHT; gy++) {
        const isEdge = gx === 0 || gx === GRID_WIDTH - 1 || gy === 0 || gy === GRID_HEIGHT - 1
        const tile = this.spriteSheet.createHullTile(
          gx * CELL_SIZE,
          gy * CELL_SIZE,
          isEdge,
        )
        if (tile) {
          this.hullTileGroup.add(tile)
        }
      }
    }
  }

  private createGridLines(): THREE.LineSegments {
    const points: THREE.Vector3[] = []

    for (let x = 0; x <= GRID_WIDTH; x++) {
      points.push(
        new THREE.Vector3(x * CELL_SIZE - CELL_SIZE / 2, 0.01, -CELL_SIZE / 2),
        new THREE.Vector3(x * CELL_SIZE - CELL_SIZE / 2, 0.01, GRID_HEIGHT * CELL_SIZE - CELL_SIZE / 2)
      )
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      points.push(
        new THREE.Vector3(-CELL_SIZE / 2, 0.01, y * CELL_SIZE - CELL_SIZE / 2),
        new THREE.Vector3(GRID_WIDTH * CELL_SIZE - CELL_SIZE / 2, 0.01, y * CELL_SIZE - CELL_SIZE / 2)
      )
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({
      color: GRID_LINE_COLOR,
      transparent: true,
      opacity: 0.3,
    })
    return new THREE.LineSegments(geo, mat)
  }

  private createHullOutline(): THREE.LineSegments {
    const w = GRID_WIDTH * CELL_SIZE
    const h = GRID_HEIGHT * CELL_SIZE
    const off = CELL_SIZE / 2
    const y = 0.02

    const points = [
      new THREE.Vector3(-off, y, -off),
      new THREE.Vector3(w - off, y, -off),
      new THREE.Vector3(w - off, y, -off),
      new THREE.Vector3(w - off, y, h - off),
      new THREE.Vector3(w - off, y, h - off),
      new THREE.Vector3(-off, y, h - off),
      new THREE.Vector3(-off, y, h - off),
      new THREE.Vector3(-off, y, -off),
    ]

    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: HULL_BORDER_COLOR, linewidth: 2 })
    return new THREE.LineSegments(geo, mat)
  }

  // ── Particle pool (enhanced) ──────────────────────────────────────

  private initParticlePool() {
    const count = 400
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const lifetimes = new Float32Array(count) // remaining life 0..1

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -20 // hidden
      lifetimes[i] = 0
      colors[i * 3] = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geo, mat)
    this.group.add(points)

    this.particlePool = { positions, velocities, colors, lifetimes, points }
  }

  private spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
  ) {
    if (!this.particlePool) return
    const { positions, velocities, colors, lifetimes } = this.particlePool

    // Find a dead particle
    const count = lifetimes.length
    for (let i = 0; i < count; i++) {
      if (lifetimes[i] <= 0) {
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z
        velocities[i * 3] = vx
        velocities[i * 3 + 1] = vy
        velocities[i * 3 + 2] = vz
        colors[i * 3] = r
        colors[i * 3 + 1] = g
        colors[i * 3 + 2] = b
        lifetimes[i] = 1.0
        return
      }
    }
  }

  updateParticles(dt: number, modules: PlacedModule[]) {
    if (!this.particlePool) return
    const { positions, velocities, colors, lifetimes, points } = this.particlePool
    const count = lifetimes.length

    // Update existing particles
    for (let i = 0; i < count; i++) {
      if (lifetimes[i] <= 0) continue

      lifetimes[i] -= dt * 0.8
      if (lifetimes[i] <= 0) {
        positions[i * 3 + 1] = -20
        continue
      }

      positions[i * 3] += velocities[i * 3] * dt
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt

      // Fade alpha by modulating color toward 0
      const fade = lifetimes[i]
      colors[i * 3] *= (0.98 + fade * 0.02)
      colors[i * 3 + 1] *= (0.98 + fade * 0.02)
      colors[i * 3 + 2] *= (0.98 + fade * 0.02)
    }

    // Spawn new particles from modules
    for (const mod of modules) {
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue

      const cx = mod.gridX * CELL_SIZE + (def.width - 1) * CELL_SIZE / 2
      const cz = mod.gridY * CELL_SIZE + (def.height - 1) * CELL_SIZE / 2

      if (mod.online) {
        // Active glow particles — color based on module type
        if (Math.random() < dt * 8) {
          const color = def.color
          const r = ((color >> 16) & 0xff) / 255
          const g = ((color >> 8) & 0xff) / 255
          const b = (color & 0xff) / 255

          this.spawnParticle(
            cx + (Math.random() - 0.5) * def.width * 0.6,
            0.3 + Math.random() * 0.2,
            cz + (Math.random() - 0.5) * def.height * 0.6,
            (Math.random() - 0.5) * 0.3,
            0.5 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.3,
            r, g, b,
          )
        }

        // Stargate gets extra purple/white vortex particles
        if (mod.defId === 'stargate_core' && Math.random() < dt * 20) {
          const angle = Math.random() * Math.PI * 2
          const radius = 0.3 + Math.random() * 0.8
          const white = Math.random() > 0.5
          this.spawnParticle(
            cx + Math.cos(angle) * radius,
            0.5 + Math.random() * 0.5,
            cz + Math.sin(angle) * radius,
            -Math.sin(angle) * 1.5,
            1.0 + Math.random(),
            Math.cos(angle) * 1.5,
            white ? 1 : 0.75, white ? 1 : 0.52, white ? 1 : 0.98,
          )
        }
      } else {
        // Offline: red sparks
        if (Math.random() < dt * 4) {
          this.spawnParticle(
            cx + (Math.random() - 0.5) * def.width * 0.5,
            0.2 + Math.random() * 0.1,
            cz + (Math.random() - 0.5) * def.height * 0.5,
            (Math.random() - 0.5) * 0.8,
            1.0 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.8,
            1.0, 0.2, 0.15,
          )
        }
      }
    }

    ;(points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }

  // ── Module mesh management ────────────────────────────────────────

  syncModules(modules: PlacedModule[]) {
    const currentKeys = new Set<string>()

    for (const mod of modules) {
      const key = `${mod.gridX},${mod.gridY}`
      currentKeys.add(key)

      if (!this.moduleMeshes.has(key)) {
        this.createModuleMesh(mod)
      }

      // Update animation state
      const entry = this.moduleMeshes.get(key)
      if (entry) {
        const targetAnim = mod.online ? 'active' : 'offline'
        if (entry.isSprite && entry.currentAnim !== targetAnim) {
          this.spriteSheet?.play(entry.mesh, entry.defId, targetAnim)
          entry.currentAnim = targetAnim
        } else if (!entry.isSprite) {
          // Fallback: update box color
          const mat = entry.mesh.material as THREE.MeshStandardMaterial
          const def = MODULE_DEFS[mod.defId]
          if (def) {
            if (mod.online) {
              mat.color.setHex(def.color)
              mat.emissive.setHex(def.color)
              mat.emissiveIntensity = 0.15
            } else {
              mat.color.setHex(OFFLINE_COLOR)
              mat.emissive.setHex(OFFLINE_COLOR)
              mat.emissiveIntensity = 0.3
            }
          }
        }
      }
    }

    // Remove deleted modules
    for (const [key, entry] of this.moduleMeshes) {
      if (!currentKeys.has(key)) {
        if (entry.isSprite) {
          this.spriteSheet?.stop(entry.mesh)
        }
        this.moduleGroup.remove(entry.group)
        this.moduleMeshes.delete(key)
      }
    }

    // Depth sort: sort module children back-to-front for correct isometric overlap
    this.moduleGroup.children.sort((a, b) => {
      const az = a.position.z + a.position.x
      const bz = b.position.z + b.position.x
      return az - bz // farther from camera first
    })
  }

  private createModuleMesh(mod: PlacedModule) {
    const def = MODULE_DEFS[mod.defId]
    if (!def) return

    const key = `${mod.gridX},${mod.gridY}`
    const grp = new THREE.Group()
    grp.position.set(mod.gridX * CELL_SIZE, 0, mod.gridY * CELL_SIZE)
    grp.userData = { gridX: mod.gridX, gridY: mod.gridY, defId: mod.defId }

    let mesh: THREE.Mesh
    let isSprite = false

    // Try sprite-based rendering
    if (this.spriteSheet?.isLoaded()) {
      const spriteWorldW = def.width * SPRITE_CELL_W
      const spriteWorldH = def.width * SPRITE_CELL_W // keep square for billboard
      const spriteMesh = this.spriteSheet.createModuleMesh(
        mod.defId,
        spriteWorldW,
        spriteWorldH,
      )

      if (spriteMesh) {
        // Billboard: face the camera (rotate to face forward in isometric)
        // The plane stands upright, we position its base at the grid cell
        spriteMesh.position.set(
          (def.width - 1) * CELL_SIZE / 2,
          spriteWorldH / 2,
          (def.height - 1) * CELL_SIZE / 2,
        )
        // Make billboard face the camera direction (isometric top-right)
        spriteMesh.rotation.y = Math.PI / 4
        spriteMesh.renderOrder = mod.gridX + mod.gridY

        mesh = spriteMesh
        isSprite = true

        this.spriteSheet.play(mesh, mod.defId, mod.online ? 'active' : 'idle')
      } else {
        mesh = this.createFallbackBox(def)
      }
    } else {
      mesh = this.createFallbackBox(def)
    }

    grp.add(mesh)
    this.moduleGroup.add(grp)
    this.animatePlacement(grp, mesh, isSprite)
    this.moduleMeshes.set(key, {
      group: grp,
      mesh,
      defId: mod.defId,
      isSprite,
      currentAnim: mod.online ? 'active' : 'idle',
    })
  }

  private animatePlacement(group: THREE.Group, mesh: THREE.Mesh, isSprite: boolean) {
    group.scale.setScalar(0.82)
    gsap.to(group.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.42,
      ease: 'back.out(2.2)',
    })

    if (isSprite) {
      const mat = mesh.material as THREE.MeshBasicMaterial
      const originalOpacity = mat.opacity
      mat.transparent = true
      mat.opacity = 0
      gsap.to(mat, {
        opacity: originalOpacity,
        duration: 0.22,
        ease: 'power1.out',
      })
      return
    }

    const mat = mesh.material as THREE.MeshStandardMaterial
    const originalIntensity = mat.emissiveIntensity
    mat.emissiveIntensity = Math.max(originalIntensity, 0.8)
    gsap.to(mat, {
      emissiveIntensity: originalIntensity,
      duration: 0.45,
      ease: 'power2.out',
    })
  }

  private createFallbackBox(def: { width: number; height: number; color: number }): THREE.Mesh {
    const geo = new THREE.BoxGeometry(
      def.width * CELL_SIZE - 0.08,
      0.5,
      def.height * CELL_SIZE - 0.08
    )
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.5,
      metalness: 0.3,
      emissive: def.color,
      emissiveIntensity: 0.1,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(
      (def.width - 1) * CELL_SIZE / 2,
      0.25,
      (def.height - 1) * CELL_SIZE / 2
    )
    mesh.castShadow = true
    return mesh
  }

  // ── Coordinate helpers ────────────────────────────────────────────

  worldToGrid(worldPos: THREE.Vector3): { x: number; y: number } | null {
    const localX = worldPos.x - this.group.position.x
    const localZ = worldPos.z - this.group.position.z
    const gx = Math.round(localX / CELL_SIZE)
    const gy = Math.round(localZ / CELL_SIZE)
    if (gx < 0 || gx >= GRID_WIDTH || gy < 0 || gy >= GRID_HEIGHT) return null
    return { x: gx, y: gy }
  }

  getModuleWorldCenter(mod: PlacedModule, lift = 0.95): THREE.Vector3 {
    const def = MODULE_DEFS[mod.defId]
    const width = def?.width ?? 1
    const height = def?.height ?? 1
    const localX = (mod.gridX + width / 2 - 0.5) * CELL_SIZE
    const localZ = (mod.gridY + height / 2 - 0.5) * CELL_SIZE
    return new THREE.Vector3(
      this.group.position.x + localX,
      lift,
      this.group.position.z + localZ,
    )
  }

  canPlace(defId: string, gridX: number, gridY: number): boolean {
    const def = MODULE_DEFS[defId]
    if (!def) return false
    const state = gameStore.getState()

    if (gridX < 0 || gridX + def.width > GRID_WIDTH) return false
    if (gridY < 0 || gridY + def.height > GRID_HEIGHT) return false
    if (state.resources.iron < def.costIron) return false
    if (state.resources.crystal < def.costCrystal) return false

    for (const m of state.modules) {
      const mDef = MODULE_DEFS[m.defId]
      if (!mDef) continue
      if (
        gridX < m.gridX + mDef.width &&
        gridX + def.width > m.gridX &&
        gridY < m.gridY + mDef.height &&
        gridY + def.height > m.gridY
      ) return false
    }
    return true
  }
}
