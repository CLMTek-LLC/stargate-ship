import * as THREE from 'three'
import { IsometricCamera } from './camera/IsometricCamera'
import { Ship } from './Ship'
import { SpriteSheet } from './SpriteSheet'
import { TouchInput } from './input/TouchInput'
import { HUD } from './ui/HUD'
import { gameStore } from './resources/ResourceManager'
import { MODULE_DEFS } from './modules/index'
import type { PlacedModule, GameState } from './resources/types'
import gsap from 'gsap'

const SAVE_KEY = 'stargate-ship-save'
const SAVE_INTERVAL = 30_000
const TICK_INTERVAL = 1000

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private isoCamera!: IsometricCamera
  private ship!: Ship
  private spriteSheet: SpriteSheet
  private input!: TouchInput
  private hud!: HUD
  private clock = new THREE.Clock()
  private tickTimer = 0
  private saveTimer = 0
  private selectedBuildDef: string | null = null
  private won = false

  // Parallax layers
  private bgLayer0: THREE.Points | null = null // deep starfield
  private bgLayer1: THREE.Mesh | null = null   // nebula
  private bgLayer2: THREE.Points | null = null  // close twinkling stars
  private bgLayer2Colors: Float32Array | null = null
  private bgLayer2BaseColors: Float32Array | null = null
  private parallaxOrigin = new THREE.Vector2(0, 0)

  constructor(container: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(0x0a0a1a)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    // Scene
    this.scene = new THREE.Scene()

    // Sprite sheet (async load)
    this.spriteSheet = new SpriteSheet()

    // Initialize synchronously first with fallback, then upgrade when sprites load
    this.initScene()
    this.loadSpritesAndUpgrade()
  }

  private initScene() {
    // Parallax background layers
    this.createBgLayer0() // deep starfield
    this.createBgLayer2() // close stars

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 1.5)
    this.scene.add(ambient)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(10, 15, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 50
    dirLight.shadow.camera.left = -15
    dirLight.shadow.camera.right = 15
    dirLight.shadow.camera.top = 15
    dirLight.shadow.camera.bottom = -15
    this.scene.add(dirLight)

    const rimLight = new THREE.DirectionalLight(0x7c3aed, 0.4)
    rimLight.position.set(-10, 5, -10)
    this.scene.add(rimLight)

    // Camera
    const aspect = window.innerWidth / window.innerHeight
    this.isoCamera = new IsometricCamera(aspect)
    this.isoCamera.setZoom(1.2)

    // Ship (starts with fallback rendering)
    this.ship = new Ship()
    this.scene.add(this.ship.group)

    // Touch input
    this.input = new TouchInput(this.renderer.domElement, this.isoCamera)
    this.setupInput()

    // HUD
    this.hud = new HUD()
    this.setupHUD()

    // Load saved state
    this.loadGame()

    // Resize
    window.addEventListener('resize', () => this.onResize())

    // Start loop
    this.animate()
  }

  private async loadSpritesAndUpgrade() {
    const loaded = await this.spriteSheet.load()
    if (!loaded) {
      console.log('Sprites not available, using fallback box rendering')
      return
    }

    console.log('Sprites loaded, upgrading visuals')

    // Remove old ship, create new one with sprite sheet
    this.scene.remove(this.ship.group)
    this.ship = new Ship(this.spriteSheet)
    this.scene.add(this.ship.group)

    // Add nebula layer (needs sprite texture)
    this.createBgLayer1()

    // Force sync with current game state
    const state = gameStore.getState()
    this.ship.syncModules(state.modules)
  }

  // ── Parallax backgrounds ──────────────────────────────────────────

  /** Layer 0: Deep starfield — many dim tiny stars, slowest parallax */
  private createBgLayer0() {
    const count = 300
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60 - 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100
      const b = 0.3 + Math.random() * 0.4
      colors[i * 3] = b
      colors[i * 3 + 1] = b
      colors[i * 3 + 2] = b + Math.random() * 0.15
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
    this.bgLayer0 = new THREE.Points(geo, mat)
    this.bgLayer0.renderOrder = -10
    this.scene.add(this.bgLayer0)
  }

  /** Layer 1: Nebula cloud — semi-transparent, medium parallax */
  private createBgLayer1() {
    const nebulaMesh = this.spriteSheet.createNebula(60, 30)
    if (!nebulaMesh) return

    nebulaMesh.position.set(0, -8, 0)
    nebulaMesh.rotation.x = -Math.PI / 2
    nebulaMesh.renderOrder = -5
    this.bgLayer1 = nebulaMesh
    this.scene.add(this.bgLayer1)
  }

  /** Layer 2: Close bright twinkling stars, fastest parallax */
  private createBgLayer2() {
    const count = 40
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const baseColors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30 - 5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50
      const b = 0.7 + Math.random() * 0.3
      baseColors[i * 3] = b
      baseColors[i * 3 + 1] = b
      baseColors[i * 3 + 2] = Math.min(1, b + Math.random() * 0.3)
      colors[i * 3] = baseColors[i * 3]
      colors[i * 3 + 1] = baseColors[i * 3 + 1]
      colors[i * 3 + 2] = baseColors[i * 3 + 2]
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    this.bgLayer2 = new THREE.Points(geo, mat)
    this.bgLayer2Colors = colors
    this.bgLayer2BaseColors = baseColors
    this.bgLayer2.renderOrder = -3
    this.scene.add(this.bgLayer2)
  }

  /** Update parallax layers based on camera pan offset */
  private updateParallax() {
    const camPos = this.isoCamera.camera.position
    const dx = camPos.x - 20
    const dz = camPos.z - 20

    // Layer 0: slowest (factor 0.1)
    if (this.bgLayer0) {
      this.bgLayer0.position.x = dx * 0.1
      this.bgLayer0.position.z = dz * 0.1
    }

    // Layer 1: medium (factor 0.3)
    if (this.bgLayer1) {
      this.bgLayer1.position.x = dx * 0.3
      this.bgLayer1.position.z = dz * 0.3
    }

    // Layer 2: fastest (factor 0.6)
    if (this.bgLayer2) {
      this.bgLayer2.position.x = dx * 0.6
      this.bgLayer2.position.z = dz * 0.6
    }
  }

  /** Twinkle close stars */
  private updateTwinkle(elapsed: number) {
    if (!this.bgLayer2Colors || !this.bgLayer2BaseColors || !this.bgLayer2) return

    const count = this.bgLayer2Colors.length / 3
    for (let i = 0; i < count; i++) {
      // Each star gets its own twinkle phase
      const phase = elapsed * (1.5 + (i % 7) * 0.3) + i * 1.7
      const twinkle = 0.5 + 0.5 * Math.sin(phase)
      this.bgLayer2Colors[i * 3] = this.bgLayer2BaseColors[i * 3] * twinkle
      this.bgLayer2Colors[i * 3 + 1] = this.bgLayer2BaseColors[i * 3 + 1] * twinkle
      this.bgLayer2Colors[i * 3 + 2] = this.bgLayer2BaseColors[i * 3 + 2] * twinkle
    }
    ;(this.bgLayer2.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }

  // ── Input ─────────────────────────────────────────────────────────

  private setupInput() {
    this.input.setTapHandler((sx, sy) => {
      if (this.hud.isBuildMode() && this.selectedBuildDef) {
        const worldPos = this.input.screenToGround(sx, sy, this.isoCamera.camera)
        if (!worldPos) return
        const grid = this.ship.worldToGrid(worldPos)
        if (!grid) return
        this.placeModule(this.selectedBuildDef, grid.x, grid.y)
        return
      }

      if (this.hud.isDemolishMode()) {
        const worldPos = this.input.screenToGround(sx, sy, this.isoCamera.camera)
        if (!worldPos) return
        const grid = this.ship.worldToGrid(worldPos)
        if (!grid) return

        const state = gameStore.getState()
        const mod = state.modules.find((m) => {
          const def = MODULE_DEFS[m.defId]
          if (!def) return false
          return (
            grid.x >= m.gridX && grid.x < m.gridX + def.width &&
            grid.y >= m.gridY && grid.y < m.gridY + def.height
          )
        })
        if (mod) {
          const def = MODULE_DEFS[mod.defId]!
          const state2 = gameStore.getState()
          const res = { ...state2.resources }
          res.iron = Math.min(res.maxIron, res.iron + Math.floor(def.costIron / 2))
          res.crystal = Math.min(res.maxCrystal, res.crystal + Math.floor(def.costCrystal / 2))
          gameStore.setState({ resources: res })
          gameStore.getState().removeModule(mod.gridX, mod.gridY)
          this.hud.toast(`Removed ${def.name} (+${Math.floor(def.costIron / 2)} Iron)`, '#f87171')
        }
        return
      }

      // Default: select module info
      const worldPos = this.input.screenToGround(sx, sy, this.isoCamera.camera)
      if (!worldPos) return
      const grid = this.ship.worldToGrid(worldPos)
      if (!grid) { this.hud.hideModuleInfo(); return }

      const state = gameStore.getState()
      const mod = state.modules.find((m) => {
        const def = MODULE_DEFS[m.defId]
        if (!def) return false
        return (
          grid.x >= m.gridX && grid.x < m.gridX + def.width &&
          grid.y >= m.gridY && grid.y < m.gridY + def.height
        )
      })

      if (mod) {
        this.hud.showModuleInfo(mod.defId, mod.gridX, mod.gridY)
      } else {
        this.hud.hideModuleInfo()
      }
    })

    this.input.setPressHandler((_sx, _sy) => {
      if (!this.hud.isBuildMode()) {
        document.getElementById('btn-build')!.click()
      }
    })
  }

  // ── HUD ───────────────────────────────────────────────────────────

  private setupHUD() {
    this.hud.setBuildCallback((defId) => {
      this.selectedBuildDef = defId
      this.hud.toast(`Tap grid to place ${MODULE_DEFS[defId]?.name}`, '#a78bfa')
    })

    this.hud.setRemoveCallback(() => {
      const key = this.hud.getSelectedModuleKey()
      if (!key) return
      const [gx, gy] = key.split(',').map(Number)
      const state = gameStore.getState()
      const mod = state.modules.find((m) => m.gridX === gx && m.gridY === gy)
      if (!mod) return

      const def = MODULE_DEFS[mod.defId]!
      const res = { ...state.resources }
      res.iron = Math.min(res.maxIron, res.iron + Math.floor(def.costIron / 2))
      res.crystal = Math.min(res.maxCrystal, res.crystal + Math.floor(def.costCrystal / 2))
      gameStore.setState({ resources: res })
      gameStore.getState().removeModule(gx, gy)
      this.hud.toast(`Removed ${def.name} (+${Math.floor(def.costIron / 2)} Iron)`, '#f87171')
    })

    document.getElementById('win-btn')!.addEventListener('click', () => {
      localStorage.removeItem(SAVE_KEY)
      window.location.reload()
    })
  }

  // ── Module placement ──────────────────────────────────────────────

  private placeModule(defId: string, gridX: number, gridY: number) {
    const def = MODULE_DEFS[defId]
    if (!def) return

    if (!this.ship.canPlace(defId, gridX, gridY)) {
      this.hud.toast('Cannot place here!', '#ef4444')
      return
    }

    const state = gameStore.getState()
    const res = { ...state.resources }
    res.iron -= def.costIron
    res.crystal -= def.costCrystal
    gameStore.setState({ resources: res })

    const placed: PlacedModule = { defId, gridX, gridY, online: true }
    gameStore.getState().addModule(placed)

    if (defId === 'crew_quarters') {
      const r = { ...gameStore.getState().resources }
      r.maxCrew += 2
      r.crew += 2
      gameStore.setState({ resources: r })
    }

    this.hud.toast(`Built ${def.name}!`, '#4ade80')
  }

  // ── Game loop ─────────────────────────────────────────────────────

  private animate = () => {
    requestAnimationFrame(this.animate)

    const dt = this.clock.getDelta()
    const elapsed = this.clock.elapsedTime

    // Game tick (1s)
    this.tickTimer += dt
    if (this.tickTimer >= TICK_INTERVAL / 1000) {
      this.tickTimer = 0
      gameStore.getState().tick()

      const state = gameStore.getState()
      if (state.stargateProgress >= 100 && !this.won) {
        this.won = true
        gameStore.getState().setWon()
        this.triggerWin()
      }
    }

    // Auto-save (30s)
    this.saveTimer += dt
    if (this.saveTimer >= SAVE_INTERVAL / 1000) {
      this.saveTimer = 0
      this.saveGame()
    }

    // Update camera
    this.isoCamera.update(dt)

    // Parallax
    this.updateParallax()
    this.updateTwinkle(elapsed)

    // Sprite animations
    if (this.spriteSheet.isLoaded()) {
      this.spriteSheet.update(dt)
    }

    // Sync ship visuals with state
    const state = gameStore.getState()
    this.ship.syncModules(state.modules)
    this.ship.updateParticles(dt, state.modules)

    // Update HUD
    this.hud.update(state)

    // Render
    this.renderer.render(this.scene, this.isoCamera.camera)
  }

  private triggerWin() {
    const overlay = document.getElementById('win-overlay')!

    gsap.to(overlay, {
      opacity: 1,
      duration: 2,
      delay: 1,
      onStart: () => {
        overlay.style.pointerEvents = 'auto'
      },
    })
  }

  // ── Save / Load ───────────────────────────────────────────────────

  private saveGame() {
    const state = gameStore.getState()
    const snapshot: GameState = {
      resources: state.resources,
      modules: state.modules,
      stargateProgress: state.stargateProgress,
      won: state.won,
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot))
  }

  private loadGame() {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as Partial<GameState>
      gameStore.getState().loadState(saved)
    } catch {
      // Corrupted save, ignore
    }
  }

  private onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    const aspect = window.innerWidth / window.innerHeight
    this.isoCamera.resize(aspect)
  }
}
