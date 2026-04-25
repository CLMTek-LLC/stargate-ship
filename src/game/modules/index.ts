import type { ModuleDefinition } from '../resources/types'
import { ResourceType } from '../resources/types'

export const MODULE_DEFS: Record<string, ModuleDefinition> = {
  mining_laser: {
    id: 'mining_laser',
    name: 'Mining Laser',
    width: 1,
    height: 1,
    color: 0x4ade80, // green
    powerPerTick: -2,
    production: { [ResourceType.Iron]: 1 },
    costIron: 50,
    costCrystal: 0,
    description: '1 Iron/s, -2 Power/s',
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    width: 2,
    height: 1,
    color: 0x22c55e, // darker green
    powerPerTick: -3,
    production: { [ResourceType.Iron]: 2 },
    costIron: 150,
    costCrystal: 0,
    description: '2 Iron/s, -3 Power/s',
  },
  solar_panel: {
    id: 'solar_panel',
    name: 'Solar Panel',
    width: 1,
    height: 1,
    color: 0xfbbf24, // yellow
    powerPerTick: 5,
    production: {},
    costIron: 30,
    costCrystal: 0,
    description: '+5 Power/s',
  },
  fusion_reactor: {
    id: 'fusion_reactor',
    name: 'Fusion Reactor',
    width: 2,
    height: 1,
    color: 0xf59e0b, // amber
    powerPerTick: 20,
    production: {},
    costIron: 500,
    costCrystal: 0,
    description: '+20 Power/s',
  },
  storage_bay: {
    id: 'storage_bay',
    name: 'Storage Bay',
    width: 1,
    height: 1,
    color: 0xfb923c, // orange
    powerPerTick: -1,
    production: {},
    costIron: 40,
    costCrystal: 0,
    description: '+500 storage, -1 Power/s',
  },
  crew_quarters: {
    id: 'crew_quarters',
    name: 'Crew Quarters',
    width: 1,
    height: 1,
    color: 0x60a5fa, // blue
    powerPerTick: -1,
    production: {},
    costIron: 60,
    costCrystal: 0,
    description: '+2 crew, -1 Power/s',
  },
  crystal_extractor: {
    id: 'crystal_extractor',
    name: 'Crystal Extractor',
    width: 1,
    height: 1,
    color: 0x818cf8, // indigo
    powerPerTick: -4,
    production: { [ResourceType.Crystal]: 0.5 },
    costIron: 350,
    costCrystal: 0,
    description: '0.5 Crystal/s, -4 Power/s',
  },
  stargate_core: {
    id: 'stargate_core',
    name: 'Stargate Core',
    width: 3,
    height: 2,
    color: 0xc084fc, // purple
    powerPerTick: -10,
    production: {},
    costIron: 500,
    costCrystal: 200,
    description: 'Win condition, -10 Power/s',
  },
}

export const BUILD_ORDER = [
  'solar_panel',
  'mining_laser',
  'refinery',
  'storage_bay',
  'crew_quarters',
  'fusion_reactor',
  'crystal_extractor',
  'stargate_core',
]
