import * as THREE from 'three'
import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE, type PlacedModule } from './resources/types'
import { MODULE_DEFS } from './modules/index'
import { gameStore } from './resources/ResourceManager'

const HULL_COLOR = 0x374151 // gray-700
const HULL_BORDER_COLOR = 0x1f2937 // gray-800
const GRID_LINE_COLOR = 0x4b5563 // gray-600
const OFFLINE_COLOR = 0xef4444 // red

export class Ship {
  group: THREE.Group
  private gridPlane: THREE.Mesh
  private moduleGroup: THREE.Group
  private moduleMeshes: Map<string, THREE.Group> = new Map()
  private hullOutline: THREE.LineSegments
  private particleSystem: THREE.Points | null = null
  private particlePositions: Float32Array | null = null
  private particleVelocities: Float32Array | null = null

  constructor() {
    this.group = new THREE.Group()
    this.moduleGroup = new THREE.Group()

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
    const gridLines = this.createGridLines()
    this.group.add(gridLines)

    // Hull outline
    this.hullOutline = this.createHullOutline()
    this.group.add(this.hullOutline)

    this.group.add(this.moduleGroup)

    // Initialize particle system for active module effects
    this.initParticles()

    // Center the ship group
    this.group.position.set(
      -(GRID_WIDTH * CELL_SIZE) / 2,
      0,
      -(GRID_HEIGHT * CELL_SIZE) / 2
    )
  }

  private createGridLines(): THREE.LineSegments {
    const points: THREE.Vector3[] = []

    // Vertical lines
    for (let x = 0; x <= GRID_WIDTH; x++) {
      points.push(
        new THREE.Vector3(x * CELL_SIZE - CELL_SIZE / 2, 0.01, -CELL_SIZE / 2),
        new THREE.Vector3(x * CELL_SIZE - CELL_SIZE / 2, 0.01, GRID_HEIGHT * CELL_SIZE - CELL_SIZE / 2)
      )
    }
    // Horizontal lines
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
    const mat = new THREE.LineBasicMaterial({
      color: HULL_BORDER_COLOR,
      linewidth: 2,
    })
    return new THREE.LineSegments(geo, mat)
  }

  private initParticles() {
    const count = 200
    this.particlePositions = new Float32Array(count * 3)
    this.particleVelocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      this.particlePositions[i * 3] = 0
      this.particlePositions[i * 3 + 1] = -10 // hidden below
      this.particlePositions[i * 3 + 2] = 0
      this.particleVelocities[i * 3] = 0
      this.particleVelocities[i * 3 + 1] = Math.random() * 0.02 + 0.01
      this.particleVelocities[i * 3 + 2] = 0
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
    })
    this.particleSystem = new THREE.Points(geo, mat)
    this.group.add(this.particleSystem)
  }

  syncModules(modules: PlacedModule[]) {
    // Track which keys still exist
    const currentKeys = new Set<string>()

    for (const mod of modules) {
      const key = `${mod.gridX},${mod.gridY}`
      currentKeys.add(key)

      if (!this.moduleMeshes.has(key)) {
        // Create new mesh
        const def = MODULE_DEFS[mod.defId]
        if (!def) continue

        const grp = new THREE.Group()

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

        grp.add(mesh)
        grp.position.set(
          mod.gridX * CELL_SIZE,
          0,
          mod.gridY * CELL_SIZE
        )
        grp.userData = { gridX: mod.gridX, gridY: mod.gridY, defId: mod.defId }

        this.moduleGroup.add(grp)
        this.moduleMeshes.set(key, grp)
      }

      // Update online status
      const grp = this.moduleMeshes.get(key)!
      const mesh = grp.children[0] as THREE.Mesh
      const mat = mesh.material as THREE.MeshStandardMaterial
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

    // Remove meshes for deleted modules
    for (const [key, grp] of this.moduleMeshes) {
      if (!currentKeys.has(key)) {
        this.moduleGroup.remove(grp)
        this.moduleMeshes.delete(key)
      }
    }
  }

  updateParticles(dt: number, modules: PlacedModule[]) {
    if (!this.particlePositions || !this.particleVelocities || !this.particleSystem) return

    const onlineModules = modules.filter((m) => m.online)
    const count = this.particlePositions.length / 3

    for (let i = 0; i < count; i++) {
      // Move particle up
      this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * dt * 60

      // If particle goes too high or is hidden, respawn on a random online module
      if (this.particlePositions[i * 3 + 1] > 1.5 || this.particlePositions[i * 3 + 1] < -5) {
        if (onlineModules.length > 0) {
          const mod = onlineModules[Math.floor(Math.random() * onlineModules.length)]
          const def = MODULE_DEFS[mod.defId]
          if (def) {
            this.particlePositions[i * 3] = mod.gridX * CELL_SIZE + (Math.random() - 0.5) * def.width * CELL_SIZE
            this.particlePositions[i * 3 + 1] = 0.5 + Math.random() * 0.2
            this.particlePositions[i * 3 + 2] = mod.gridY * CELL_SIZE + (Math.random() - 0.5) * def.height * CELL_SIZE

            this.particleVelocities[i * 3] = (Math.random() - 0.5) * 0.01
            this.particleVelocities[i * 3 + 1] = Math.random() * 0.02 + 0.01
            this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01
          }
        }
      }

      // Drift
      this.particlePositions[i * 3] += this.particleVelocities[i * 3] * dt * 60
      this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * dt * 60
    }

    ;(this.particleSystem.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }

  /** Convert world position to grid coordinates, returns null if outside grid */
  worldToGrid(worldPos: THREE.Vector3): { x: number; y: number } | null {
    // Undo group offset
    const localX = worldPos.x - this.group.position.x
    const localZ = worldPos.z - this.group.position.z

    const gx = Math.round(localX / CELL_SIZE)
    const gy = Math.round(localZ / CELL_SIZE)

    if (gx < 0 || gx >= GRID_WIDTH || gy < 0 || gy >= GRID_HEIGHT) {
      return null
    }
    return { x: gx, y: gy }
  }

  /** Check if a module can be placed at grid position */
  canPlace(defId: string, gridX: number, gridY: number): boolean {
    const def = MODULE_DEFS[defId]
    if (!def) return false

    const state = gameStore.getState()

    // Check bounds
    if (gridX < 0 || gridX + def.width > GRID_WIDTH) return false
    if (gridY < 0 || gridY + def.height > GRID_HEIGHT) return false

    // Check cost
    if (state.resources.iron < def.costIron) return false
    if (state.resources.crystal < def.costCrystal) return false

    // Check overlap
    for (const m of state.modules) {
      const mDef = MODULE_DEFS[m.defId]
      if (!mDef) continue
      if (
        gridX < m.gridX + mDef.width &&
        gridX + def.width > m.gridX &&
        gridY < m.gridY + mDef.height &&
        gridY + def.height > m.gridY
      ) {
        return false
      }
    }

    return true
  }
}
