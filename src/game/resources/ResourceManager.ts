import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Resources, GameState, PlacedModule, BrownoutState, CrewShortageState } from './types'
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
  crewShortage: CrewShortageState
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
  crewShortage: { level: 0, productionMult: 1 },

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

    // --- Progressive brownout: power crisis mechanic (TASK-04 AC #3) ---
    // Power producers always stay online. Non-critical modules are progressively
    // throttled or shut down based on energy reserves, making crises interesting
    // instead of a binary all-off.
    let brownoutLevel: 0 | 1 | 2 | 3 = 0
    let productionMult = 1

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

    // Check crew requirement: 1 crew per 3 modules
    const totalModules = modules.length
    const crewRequired = Math.ceil(totalModules / 3)
    const crewRatio = crewRequired > 0 ? res.crew / crewRequired : 1

    // --- Crew shortage: progressive shutdown (TASK-04 AC #4) ---
    // Progressive production throttle based on crew deficit rather than
    // shutting random modules down. This makes crew shortage a gradual
    // drag on efficiency rather than an abrupt binary flip.
    let crewLevel: 0 | 1 | 2 | 3 = 0
    let crewMult = 1

    if (crewRatio < 0.25) {
      // Stalled — over 75% crew deficit. Most production halts.
      crewLevel = 3
      crewMult = 0.1
    } else if (crewRatio < 0.50) {
      // Critical — between 50-75% deficit. 25% production.
      crewLevel = 2
      crewMult = 0.25
    } else if (crewRatio < 0.75) {
      // Warning — between 25-50% deficit. Half production.
      crewLevel = 1
      crewMult = 0.5
    }

    // Combine brownout & crew shortage multiplicatively for the effective
    // production multiplier. Both penalties stack for maximum pain.
    const effectiveMult = productionMult * crewMult

    // Process production for online modules
    for (const mod of modules) {
      if (!mod.online) continue
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue

      // Resource production (scaled by brownout & crew shortage multiplier)
      if (def.production.iron) {
        res.iron = Math.min(res.maxIron, res.iron + def.production.iron * effectiveMult)
      }
      if (def.production.crystal) {
        res.crystal = Math.min(res.maxCrystal, res.crystal + def.production.crystal * effectiveMult)
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
      crewShortage: { level: crewLevel, productionMult: crewMult },
    }
  }),

  setWon: () => set({ won: true }),

  loadState: (saved) => set((state) => ({
    resources: saved.resources ?? state.resources,
    modules: saved.modules ?? state.modules,
    stargateProgress: saved.stargateProgress ?? state.stargateProgress,
    won: saved.won ?? state.won,
    brownout: saved.brownout ?? state.brownout,
    crewShortage: saved.crewShortage ?? state.crewShortage,
  })),

  getSnapshot: () => {
    const s = get()
    return {
      resources: s.resources,
      modules: s.modules,
      stargateProgress: s.stargateProgress,
      won: s.won,
      brownout: s.brownout,
      crewShortage: s.crewShortage,
    }
  },
}))
