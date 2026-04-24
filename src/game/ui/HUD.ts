import gsap from 'gsap'
import { gameStore, type GameStore } from '../resources/ResourceManager'
import { MODULE_DEFS, BUILD_ORDER } from '../modules/index'
import type { Resources } from '../resources/types'

const PANEL_OPEN_RIGHT = 0
const PANEL_CLOSED_RIGHT = -300

export type BuildCallback = (defId: string) => void
export type RemoveCallback = () => void

export class HUD {
  private onBuild: BuildCallback | null = null
  private onRemove: RemoveCallback | null = null
  private buildPanel: HTMLElement
  private buildList: HTMLElement
  private moduleInfo: HTMLElement
  private selectedModuleKey: string | null = null
  private buildMode = false
  private demolishMode = false
  private toastEl: HTMLElement
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  /** Active GSAP tween for the build panel, so we can kill() before starting a new one */
  private panelTween: gsap.core.Tween | null = null
  /** Active GSAP tween for the module info panel */
  private infoTween: gsap.core.Tween | null = null
  private floatContainer: HTMLElement

  constructor() {
    this.buildPanel = document.getElementById('build-panel')!
    this.buildList = document.getElementById('build-list')!
    this.moduleInfo = document.getElementById('module-info')!
    this.toastEl = document.getElementById('toast')!
    this.floatContainer = document.getElementById('floating-text-container')!

    // Build button
    document.getElementById('btn-build')!.addEventListener('click', () => {
      this.buildMode = !this.buildMode
      this.demolishMode = false
      this.animateBuildPanel(this.buildMode)
      document.getElementById('btn-build')!.classList.toggle('active', this.buildMode)
      document.getElementById('btn-demolish')!.classList.remove('active')
      this.hideModuleInfo()
    })

    // Demolish button
    document.getElementById('btn-demolish')!.addEventListener('click', () => {
      this.demolishMode = !this.demolishMode
      this.buildMode = false
      this.animateBuildPanel(false)
      document.getElementById('btn-demolish')!.classList.toggle('active', this.demolishMode)
      document.getElementById('btn-build')!.classList.remove('active')
      this.hideModuleInfo()
    })

    // Info button
    document.getElementById('btn-info')!.addEventListener('click', () => {
      this.buildMode = false
      this.demolishMode = false
      this.animateBuildPanel(false)
      document.getElementById('btn-build')!.classList.remove('active')
      document.getElementById('btn-demolish')!.classList.remove('active')
    })

    // Remove module button
    document.getElementById('module-info-remove')!.addEventListener('click', () => {
      this.onRemove?.()
      this.hideModuleInfo()
    })

    // Close module info button
    document.getElementById('module-info-close')!.addEventListener('click', () => {
      this.hideModuleInfo()
    })

    this.populateBuildList()
  }

  private populateBuildList() {
    this.buildList.innerHTML = ''

    for (const defId of BUILD_ORDER) {
      const def = MODULE_DEFS[defId]
      if (!def) continue

      const item = document.createElement('div')
      item.className = 'build-item'
      item.dataset.defId = defId

      item.innerHTML = `
        <div class="build-item-header">
          <span class="build-item-name">${def.name}</span>
          <span class="build-item-size">${def.width}×${def.height}</span>
        </div>
        <div class="build-item-stats">${def.description}</div>
        <div class="build-item-cost">Cost: ${def.costIron} Iron${def.costCrystal > 0 ? ` + ${def.costCrystal} Crystal` : ''}</div>
      `

      item.addEventListener('click', () => {
        this.onBuild?.(defId)
      })

      this.buildList.appendChild(item)
    }
  }

  setBuildCallback(cb: BuildCallback) {
    this.onBuild = cb
  }

  setRemoveCallback(cb: RemoveCallback) {
    this.onRemove = cb
  }

  isBuildMode(): boolean {
    return this.buildMode
  }

  isDemolishMode(): boolean {
    return this.demolishMode
  }

  showModuleInfo(defId: string, gridX: number, gridY: number) {
    const def = MODULE_DEFS[defId]
    if (!def) return

    this.selectedModuleKey = `${gridX},${gridY}`
    document.getElementById('module-info-name')!.textContent = def.name
    document.getElementById('module-info-stats')!.textContent = def.description

    // Kill any running tween and animate in with GSAP
    if (this.infoTween) this.infoTween.kill()
    this.moduleInfo.classList.add('visible')
    this.infoTween = gsap.fromTo(this.moduleInfo,
      { opacity: 0, scale: 0.9 },
      {
        opacity: 1, scale: 1,
        duration: 0.25,
        ease: 'back.out(1.2)',
        overwrite: 'auto',
      },
    )
  }

  hideModuleInfo() {
    if (this.infoTween) this.infoTween.kill()
    this.infoTween = gsap.to(this.moduleInfo, {
      opacity: 0, scale: 0.9,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        this.moduleInfo.classList.remove('visible')
      },
    })
    this.selectedModuleKey = null
  }

  getSelectedModuleKey(): string | null {
    return this.selectedModuleKey
  }

  /** Animate build panel slide-in/out using GSAP for smooth easing */
  private animateBuildPanel(open: boolean) {
    if (this.panelTween) {
      this.panelTween.kill()
    }
    const targetRight = open ? PANEL_OPEN_RIGHT : PANEL_CLOSED_RIGHT
    this.panelTween = gsap.to(this.buildPanel, {
      right: targetRight,
      duration: 0.35,
      ease: 'back.out(1.2)',
      overwrite: 'auto',
      onComplete: () => {
        if (open) this.buildPanel.classList.add('open')
        else this.buildPanel.classList.remove('open')
      },
    })
  }

  toast(message: string, color = '#e0e0e0') {
    this.toastEl.textContent = message
    this.toastEl.style.color = color
    this.toastEl.classList.add('visible')
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible')
    }, 2000)
  }

  /** Show floating text that rises, fades, and is removed (e.g., "+1 Iron" on production tick) */
  showFloatingText(text: string, color: string, gridX: number, gridY: number) {
    const el = document.createElement('div')
    el.className = 'floating-text'
    el.textContent = text
    el.style.color = color

    // Position relative to grid cell (HUD space — approximate center of the ship viewport area)
    // The grid is 20 wide, 12 tall; map (gridX, gridY) to screen position roughly centered
    const cellPx = 38 // approximate cell pixel size in view
    const originX = window.innerWidth / 2
    const originZ = window.innerHeight / 2 - 60
    const hw = 20 / 2
    const hh = 12 / 2
    const sx = originX + (gridX - hw + 0.5) * cellPx
    const sy = originZ + (gridY - hh) * cellPx
    el.style.left = `${sx}px`
    el.style.top = `${sy}px`

    this.floatContainer.appendChild(el)

    // GSAP animation: float up, fade out, then remove element
    gsap.to(el, {
      y: -60,
      opacity: 0,
      duration: 1.2,
      ease: 'power2.out',
      onComplete: () => {
        el.remove()
      },
    })
  }

  update(state: GameStore) {
    const res = state.resources

    // Resource bar
    const netPower = this.calcNetPower(state)
    const powerSign = netPower >= 0 ? '+' : ''
    document.getElementById('res-energy')!.textContent =
      `${Math.floor(res.energy)} (${powerSign}${netPower}/s)`
    document.getElementById('res-iron')!.textContent =
      `${Math.floor(res.iron)}/${res.maxIron}`
    document.getElementById('res-crystal')!.textContent =
      `${Math.floor(res.crystal)}/${res.maxCrystal}`
    document.getElementById('res-crew')!.textContent =
      `${res.crew}/${res.maxCrew}`

    // Stargate progress
    document.getElementById('stargate-bar-inner')!.style.width = `${state.stargateProgress}%`
    document.getElementById('stargate-percent')!.textContent = `${state.stargateProgress}%`

    // Update build item affordability
    const items = this.buildList.querySelectorAll('.build-item')
    items.forEach((el) => {
      const defId = (el as HTMLElement).dataset.defId!
      const def = MODULE_DEFS[defId]
      if (!def) return
      const canAfford = res.iron >= def.costIron && res.crystal >= def.costCrystal
      el.classList.toggle('disabled', !canAfford)
    })
  }

  private calcNetPower(state: GameStore): number {
    let net = 0
    for (const mod of state.modules) {
      const def = MODULE_DEFS[mod.defId]
      if (def) net += def.powerPerTick
    }
    return net
  }
}
