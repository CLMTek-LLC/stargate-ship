import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Resources, GameState, PlacedModule } from './types'
import { STARGATE_GOAL } from './types'
import { MODULE_DEFS } from '../modules/index'

export interface GameStore extends GameState {
  addModule: (m: PlacedModule) => void
  removeModule: (gridX: number, gridY: number) => void
  tick: () => void
  setWon: () => void
  loadState: (state: Partial<GameState>) => void
  getSnapshot: () => GameState
}

const defaultResources: Resources = {
  iron: 100,
  crystal: 0,
  energy: 0,
  crew: 2,
  maxIron: 500,
  maxCrystal: 200,
  maxEnergy: 1000,
  maxCrew: 2,
}

export const gameStore: StoreApi<GameStore> = createStore<GameStore>((set, get) => ({
  resources: { ...defaultResources },
  modules: [],
  stargateProgress: 0,
  won: false,

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

    // Set modules online/offline based on power and crew
    const powerAvailable = res.energy > 0 || netPower >= 0
    for (const mod of modules) {
      mod.online = powerAvailable && crewSufficient
    }

    // If not enough crew, disable random modules until ratio met
    if (!crewSufficient) {
      const toDisable = crewRequired - res.crew
      let disabled = 0
      for (let i = modules.length - 1; i >= 0 && disabled < toDisable * 3; i--) {
        modules[i].online = false
        disabled++
      }
    }

    // Process production for online modules
    for (const mod of modules) {
      if (!mod.online) continue
      const def = MODULE_DEFS[mod.defId]
      if (!def) continue

      // Resource production
      if (def.production.iron) {
        res.iron = Math.min(res.maxIron, res.iron + def.production.iron)
      }
      if (def.production.crystal) {
        res.crystal = Math.min(res.maxCrystal, res.crystal + def.production.crystal)
      }

      // Storage & crew capacity
      if (mod.defId === 'storage_bay') {
        // capacity already factored in maxIron
      }
      if (mod.defId === 'crew_quarters') {
        // crew max already factored
      }
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
    }
  }),

  setWon: () => set({ won: true }),

  loadState: (saved) => set((state) => ({
    resources: saved.resources ?? state.resources,
    modules: saved.modules ?? state.modules,
    stargateProgress: saved.stargateProgress ?? state.stargateProgress,
    won: saved.won ?? state.won,
  })),

  getSnapshot: () => {
    const s = get()
    return {
      resources: s.resources,
      modules: s.modules,
      stargateProgress: s.stargateProgress,
      won: s.won,
    }
  },
}))
