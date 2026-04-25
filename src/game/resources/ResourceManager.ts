import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Resources, GameState, PlacedModule, BrownoutState } from './types'
import { STARGATE_GOAL } from './types'
import { MODULE_DEFS } from '../modules/index'
import { ModulePriority } from './types'

export interface GameStore extends GameState {
  addModule: (m: PlacedModule) => void
  removeModule: (gridX: number, gridY: number) => void
  tick: () => void
  setWon: () => void
  loadState: (state: Partial<GameState>) => void
  getSnapshot: () => GameState
  brownout: BrownoutState
}

const defaultResources: Resources = {
  iron: 50,
  crystal: 0,
  energy: 0,
  crew: 4,
  maxIron: 500,
  maxCrystal: 200,
  maxEnergy: 1000,
  maxCrew: 6,
}

/** Starter modules pre-placed at game start (TASK-04 AC #1) */
const INITIAL_MODULES: PlacedModule[] = [
  // 2x Solar Panels — top-left area
  { defId: 'solar_panel', gridX: 0, gridY: 0, online: true },
  { defId: 'solar_panel', gridX: 1, gridY: 0, online: true },
  // 1x Storage Bay
  { defId: 'storage_bay', gridX: 0, gridY: 1, online: true },
  // 2x Crew Quarters
  { defId: 'crew_quarters', gridX: 1, gridY: 1, online: true },
  { defId: 'crew_quarters', gridX: 0, gridY: 2, online: true },
]

export const gameStore: StoreApi<GameStore> = createStore<GameStore>((set, get) => ({
  resources: { ...defaultResources },
  modules: [...INITIAL_MODULES],
  stargateProgress: 0,
  won: false,
  brownout: { level: 0, productionMult: 1 },

  addModule: (m) => set((state) => ({
    modules: [...state.modules, m],
  })),

  removeModule: (gridX, gridY) => set((state) => ({
    modules: state.modules.filter(
      (m) => !(m.gridX === gridX && m.gridY === gridY)
    ),
  })),

  tick: () => set((state) => {
    if (state.won) return state

    const res = { ...state.resources }
    const modules = state.modules.map((m) => ({ ...m }))

    // Calculate total power production and consumption
    let powerProduction = 0
    let powerConsumption = 0
    for (const mod of modules) {
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue
      if (def.powerPerTick > 0) powerProduction += def.powerPerTick
      else powerConsumption += Math.abs(def.powerPerTick)
    }

    const netPower = powerProduction - powerConsumption
    res.energy = Math.max(0, Math.min(res.maxEnergy, res.energy + netPower))

    // Check crew requirement: 1 crew per 3 modules
    const crewRequired = Math.ceil(modules.length / 3)
    const crewSufficient = res.crew >= crewRequired

    // --- Progressive brownout: power crisis mechanic (TASK-04 AC #3) ---
    // Power producers always stay online. Non-critical modules are progressively
    // throttled or shut down based on energy reserves, making crises interesting
    // instead of a binary all-off.
    let brownoutLevel: 0 | 1 | 2 | 3 = 0
    let productionMult = 1

    // First: sort modules by priority so we can decide online state consistently
    // We always leave power producers (Critical) online. Then we progressively
    // disable modules starting from lowest priority as energy depletes.
    if (res.energy <= 0 && netPower < 0) {
      // Blackout — energy drained, negative net. Only Critical modules stay on.
      brownoutLevel = 3
      productionMult = 0
    } else if (res.energy < res.maxEnergy * 0.15 && netPower < 0) {
      // Critical — below 15% energy and running deficit. Throttle Low to 25%.
      brownoutLevel = 2
      productionMult = 0.25
    } else if (res.energy < res.maxEnergy * 0.30 && netPower < 0) {
      // Warning — below 30% and running deficit. Throttle Low to 50%.
      brownoutLevel = 1
      productionMult = 0.5
    }

    // Apply online state per module based on priority
    for (const mod of modules) {
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue
      if (def.priority === ModulePriority.Critical) {
        mod.online = true // power producers always stay on
      } else if (brownoutLevel >= 2 && def.priority === ModulePriority.Low) {
        mod.online = false // shut down Low modules in crisis/blackout
      } else if (brownoutLevel >= 3 && def.priority <= ModulePriority.Normal) {
        mod.online = false // shut down Normal+ in blackout
      } else if (brownoutLevel >= 3 && def.priority <= ModulePriority.High) {
        mod.online = false // shut down High in blackout (last resort)
      } else {
        mod.online = true
      }
    }

    // If not enough crew, disable modules from tail until ratio met
    if (!crewSufficient) {
      const toDisable = crewRequired - res.crew
      let disabled = 0
      for (let i = modules.length - 1; i >= 0 && disabled < toDisable * 3; i--) {
        const def = MODULE_DEFS[modules[i].defId]
        if (def?.priority === ModulePriority.Critical) continue
        modules[i].online = false
        disabled++
      }
    }

    // Process production for online modules
    for (const mod of modules) {
      if (!mod.online) continue
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue

      // Resource production (scaled by brownout multiplier)
      if (def.production.iron) {
        res.iron = Math.min(res.maxIron, res.iron + def.production.iron * productionMult)
      }
      if (def.production.crystal) {
        res.crystal = Math.min(res.maxCrystal, res.crystal + def.production.crystal * productionMult)
      }

      // Storage & crew capacity handled below
    }

    // Recalculate max storage and crew based on modules
    let extraStorage = 0
    let extraCrew = 0
    for (const mod of modules) {
      if (mod.defId === 'storage_bay') extraStorage += 500
      if (mod.defId === 'crew_quarters') extraCrew += 2
    }
    res.maxIron = 500 + extraStorage
    res.maxCrystal = 200 + Math.floor(extraStorage / 2)
    res.maxCrew = 2 + extraCrew

    // Calculate stargate progress
    const hasCore = modules.some((m) => m.defId === 'stargate_core')
    let progress = 0
    if (hasCore) {
      const ironPct = Math.min(1, res.iron / STARGATE_GOAL.iron)
      const crystalPct = Math.min(1, res.crystal / STARGATE_GOAL.crystal)
      const energyPct = Math.min(1, res.energy / STARGATE_GOAL.energy)
      const crewPct = Math.min(1, res.crew / STARGATE_GOAL.crew)
      progress = Math.floor((ironPct + crystalPct + energyPct + crewPct) / 4 * 100)
    }

    return {
      resources: res,
      modules,
      stargateProgress: progress,
      brownout: { level: brownoutLevel, productionMult },
    }
  }),

  setWon: () => set({ won: true }),

  loadState: (saved) => set((state) => ({
    resources: saved.resources ?? state.resources,
    modules: saved.modules ?? state.modules,
    stargateProgress: saved.stargateProgress ?? state.stargateProgress,
    won: saved.won ?? state.won,
    brownout: saved.brownout ?? state.brownout,
  })),

  getSnapshot: () => {
    const s = get()
    return {
      resources: s.resources,
      modules: s.modules,
      stargateProgress: s.stargateProgress,
      won: s.won,
      brownout: s.brownout,
    }
  },
}))
