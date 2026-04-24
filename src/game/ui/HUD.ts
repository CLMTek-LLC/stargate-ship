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

  constructor() {
    this.buildPanel = document.getElementById('build-panel')!
    this.buildList = document.getElementById('build-list')!
    this.moduleInfo = document.getElementById('module-info')!
    this.toastEl = document.getElementById('toast')!

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
    this.moduleInfo.classList.add('visible')
  }

  hideModuleInfo() {
    this.moduleInfo.classList.remove('visible')
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
