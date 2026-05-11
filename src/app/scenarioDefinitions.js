import { SimulationEngine } from '../sim/SimulationEngine.js';
import { cloneScenarioConfig, defaultScenario } from '../sim/config/defaultScenario.js';
import { cloneOffshoreScenarioConfig, defaultOffshoreScenario } from '../sim/config/offshoreScenario.js';
import { OffshoreSimulationEngine } from '../sim/offshore/OffshoreSimulationEngine.js';

function createRuntimeSeed(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SCENARIO_IDS = {
  shore: 'shore',
  offshore: 'offshore',
};

export const scenarioDefinitions = {
  [SCENARIO_IDS.shore]: {
    id: SCENARIO_IDS.shore,
    mode: 'shore',
    title: 'Shore Protection',
    subtitle: 'Existing coastal simulation',
    icon: 'shore',
    setupVariant: 'shore-config',
    buildConfig: () => cloneScenarioConfig(defaultScenario),
    createEngine: (config, eventBus) => new SimulationEngine(config, eventBus),
  },
  [SCENARIO_IDS.offshore]: {
    id: SCENARIO_IDS.offshore,
    mode: 'offshore',
    title: 'Offshore Rig Protection',
    subtitle: 'Protect strategic offshore infrastructure',
    icon: 'rig',
    setupVariant: 'offshore-brief',
    buildConfig: () => {
      const config = cloneOffshoreScenarioConfig(defaultOffshoreScenario);
      config.randomSeed = createRuntimeSeed('skana-offshore-rig');
      return config;
    },
    createEngine: (config, eventBus) => new OffshoreSimulationEngine(config, eventBus),
  },
};

export function getScenarioDefinition(id) {
  return scenarioDefinitions[id] ?? scenarioDefinitions[SCENARIO_IDS.shore];
}
