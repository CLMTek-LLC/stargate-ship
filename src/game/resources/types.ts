export enum ResourceType {
  Iron = 'iron',
  Crystal = 'crystal',
  Energy = 'energy',
}

export interface Resources {
  iron: number
  crystal: number
  energy: number
  crew: number
  maxIron: number
  maxCrystal: number
  maxEnergy: number
  maxCrew: number
}

/** Priority for power brownout — higher = more essential */
export enum ModulePriority {
  Critical = 3,   // power producers — never shut down
  High = 2,       // crew, storage — last to shut down
  Normal = 1,     // basic production
  Low = 0,        // advanced production — first to throttle/shut down
}

export interface ModuleDefinition {
  id: string
  name: string
  width: number
  height: number
  color: number
  powerPerTick: number // positive = produces, negative = consumes
  production: Partial<Record<ResourceType, number>>
  costIron: number
  costCrystal: number
  description: string
  priority: ModulePriority
}

export interface BrownoutState {
  /** Current crisis level: 0=normal, 1=warning, 2=critical, 3=blackout */
  level: 0 | 1 | 2 | 3
  /** Production multiplier applied to non-critical modules */
  productionMult: number
}

export interface PlacedModule {
  defId: string
  gridX: number
  gridY: number
  online: boolean
}

export interface GameState {
  resources: Resources
  modules: PlacedModule[]
  stargateProgress: number
  won: boolean
  brownout: BrownoutState
}

export const STARGATE_GOAL = {
  iron: 500,
  crystal: 200,
  energy: 1000,
  crew: 10,
}

export const GRID_WIDTH = 20
export const GRID_HEIGHT = 12
export const CELL_SIZE = 1 // 1 unit in Three.js
