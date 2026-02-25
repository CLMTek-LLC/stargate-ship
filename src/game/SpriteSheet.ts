import * as THREE from 'three'

export interface SpriteFrame {
  x: number
  y: number
  width: number
  height: number
}

export interface SpriteAnimation {
  state: string
  frames: number
  fps: number
  loop: boolean
  y: number
  frameWidth: number
  frameHeight: number
}

export interface ModuleManifest {
  id: string
  file: string
  width: number
  height: number
  animations: Record<string, SpriteAnimation>
}

export interface SpriteManifest {
  tileWidth: number
  tileHeight: number
  modules: Record<string, ModuleManifest>
  hull: { file: string; width: number; height: number }
  nebula: { file: string; width: number; height: number }
}

interface ActiveSprite {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  anim: SpriteAnimation
  atlasW: number
  atlasH: number
  frameIndex: number
  elapsed: number
}

export class SpriteSheet {
  private textures: Map<string, THREE.Texture> = new Map()
  private manifest: SpriteManifest | null = null
  private activeSprites: ActiveSprite[] = []
  private loaded = false

  async load(): Promise<boolean> {
    try {
      const resp = await fetch('/sprites/manifest.json')
      if (!resp.ok) return false
      this.manifest = await resp.json() as SpriteManifest

      const loader = new THREE.TextureLoader()
      const loadTex = (path: string): Promise<THREE.Texture> =>
        new Promise((resolve, reject) => {
          loader.load(
            `/sprites/${path}`,
            (tex) => {
              tex.magFilter = THREE.NearestFilter
              tex.minFilter = THREE.NearestFilter
              tex.colorSpace = THREE.SRGBColorSpace
              resolve(tex)
            },
            undefined,
            reject,
          )
        })

      // Load all module textures
      for (const [id, mod] of Object.entries(this.manifest.modules)) {
        this.textures.set(id, await loadTex(mod.file))
      }
      // Hull
      this.textures.set('hull', await loadTex(this.manifest.hull.file))
      // Nebula
      this.textures.set('nebula', await loadTex(this.manifest.nebula.file))

      this.loaded = true
      return true
    } catch {
      console.warn('SpriteSheet: Failed to load sprites, using fallback')
      return false
    }
  }

  isLoaded(): boolean {
    return this.loaded
  }

  getManifest(): SpriteManifest | null {
    return this.manifest
  }

  getTexture(id: string): THREE.Texture | undefined {
    return this.textures.get(id)
  }

  /**
   * Create a sprite mesh for a module.
   * Returns a PlaneGeometry mesh with the atlas texture, sized in world units.
   * worldWidth/Height are the desired size in Three.js units.
   */
  createModuleMesh(
    moduleId: string,
    worldWidth: number,
    worldHeight: number,
  ): THREE.Mesh | null {
    if (!this.manifest) return null
    const mod = this.manifest.modules[moduleId]
    if (!mod) return null
    const tex = this.textures.get(moduleId)
    if (!tex) return null

    const geo = new THREE.PlaneGeometry(worldWidth, worldHeight)
    const mat = new THREE.MeshBasicMaterial({
      map: tex.clone(),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
    })

    // Set initial UV to first frame of idle
    const idleAnim = mod.animations['idle']
    if (idleAnim) {
      this.setUVs(geo, mod, idleAnim, 0)
    }

    const mesh = new THREE.Mesh(geo, mat)
    return mesh
  }

  /**
   * Register a mesh to play a named animation.
   * Removes any prior registration for that mesh.
   */
  play(mesh: THREE.Mesh, moduleId: string, animName: string): void {
    if (!this.manifest) return
    const mod = this.manifest.modules[moduleId]
    if (!mod) return
    const anim = mod.animations[animName]
    if (!anim) return

    // Remove existing entry for this mesh
    this.activeSprites = this.activeSprites.filter((s) => s.mesh !== mesh)

    const entry: ActiveSprite = {
      mesh,
      material: mesh.material as THREE.MeshBasicMaterial,
      anim,
      atlasW: mod.width,
      atlasH: mod.height,
      frameIndex: 0,
      elapsed: 0,
    }

    this.activeSprites.push(entry)

    // Set first frame immediately
    this.setUVs(mesh.geometry as THREE.PlaneGeometry, mod, anim, 0)
  }

  /** Advance all active animations */
  update(dt: number): void {
    for (const sprite of this.activeSprites) {
      sprite.elapsed += dt
      const frameDur = 1 / sprite.anim.fps
      if (sprite.elapsed >= frameDur) {
        sprite.elapsed -= frameDur
        sprite.frameIndex++
        if (sprite.frameIndex >= sprite.anim.frames) {
          sprite.frameIndex = sprite.anim.loop ? 0 : sprite.anim.frames - 1
        }

        // Find the module manifest for this sprite
        const mod = this.findModuleForSprite(sprite)
        if (mod) {
          this.setUVs(
            sprite.mesh.geometry as THREE.PlaneGeometry,
            mod,
            sprite.anim,
            sprite.frameIndex,
          )
        }
      }
    }
  }

  /** Remove animation tracking for a mesh */
  stop(mesh: THREE.Mesh): void {
    this.activeSprites = this.activeSprites.filter((s) => s.mesh !== mesh)
  }

  private findModuleForSprite(sprite: ActiveSprite): ModuleManifest | null {
    if (!this.manifest) return null
    for (const mod of Object.values(this.manifest.modules)) {
      if (mod.width === sprite.atlasW && mod.height === sprite.atlasH) {
        // Check if any animation matches
        for (const anim of Object.values(mod.animations)) {
          if (anim === sprite.anim) return mod
        }
      }
    }
    return null
  }

  private setUVs(
    geo: THREE.PlaneGeometry,
    mod: ModuleManifest,
    anim: SpriteAnimation,
    frameIndex: number,
  ): void {
    const u0 = (frameIndex * anim.frameWidth) / mod.width
    const u1 = ((frameIndex + 1) * anim.frameWidth) / mod.width
    const v0 = 1 - (anim.y / mod.height)
    const v1 = 1 - ((anim.y + anim.frameHeight) / mod.height)

    const uv = geo.attributes.uv as THREE.BufferAttribute
    // PlaneGeometry UV layout: [0,1], [1,1], [0,0], [1,0]
    uv.setXY(0, u0, v0) // top-left
    uv.setXY(1, u1, v0) // top-right
    uv.setXY(2, u0, v1) // bottom-left
    uv.setXY(3, u1, v1) // bottom-right
    uv.needsUpdate = true
  }

  /**
   * Create a hull floor tile mesh at given world position.
   * isEdge selects the edge variant from the atlas.
   */
  createHullTile(worldX: number, worldZ: number, isEdge: boolean): THREE.Mesh | null {
    if (!this.manifest) return null
    const tex = this.textures.get('hull')
    if (!tex) return null

    const geo = new THREE.PlaneGeometry(1.0, 0.75)
    const mat = new THREE.MeshBasicMaterial({
      map: tex.clone(),
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    // UV: select left half (normal) or right half (edge) of hull atlas
    const u0 = isEdge ? 0.5 : 0
    const u1 = isEdge ? 1.0 : 0.5
    const uv = geo.attributes.uv as THREE.BufferAttribute
    uv.setXY(0, u0, 1)
    uv.setXY(1, u1, 1)
    uv.setXY(2, u0, 0)
    uv.setXY(3, u1, 0)
    uv.needsUpdate = true

    const mesh = new THREE.Mesh(geo, mat)
    // Lay flat on XZ plane, face up
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(worldX, 0.01, worldZ)
    return mesh
  }

  /** Create the nebula background sprite */
  createNebula(width: number, height: number): THREE.Mesh | null {
    const tex = this.textures.get('nebula')
    if (!tex) return null

    const geo = new THREE.PlaneGeometry(width, height)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    return new THREE.Mesh(geo, mat)
  }
}
