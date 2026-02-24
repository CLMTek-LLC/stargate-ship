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
