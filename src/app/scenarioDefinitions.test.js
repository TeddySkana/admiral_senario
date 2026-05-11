import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getScenarioDefinition, SCENARIO_IDS, scenarioDefinitions } from './scenarioDefinitions.js';
import { SimulationEngine } from '../sim/SimulationEngine.js';
import { OffshoreSimulationEngine } from '../sim/offshore/OffshoreSimulationEngine.js';

function makeEventBus() {
  return {
    emit() {},
  };
}

test('Shore Protection remains wired to the existing simulation engine', () => {
  const shoreDefinition = getScenarioDefinition(SCENARIO_IDS.shore);
  const shoreEngine = shoreDefinition.createEngine(shoreDefinition.buildConfig(), makeEventBus());

  assert.equal(shoreDefinition.title, 'Shore Protection');
  assert.ok(shoreEngine instanceof SimulationEngine);
  assert.equal(shoreEngine.state.offshore, undefined);
});

test('Offshore Rig Protection remains isolated to the offshore engine path', () => {
  const offshoreDefinition = getScenarioDefinition(SCENARIO_IDS.offshore);
  const offshoreEngine = offshoreDefinition.createEngine(offshoreDefinition.buildConfig(), makeEventBus());

  assert.equal(offshoreDefinition.title, 'Offshore Rig Protection');
  assert.ok(offshoreEngine instanceof OffshoreSimulationEngine);
  assert.ok(offshoreEngine.state.offshore);
  assert.equal(getScenarioDefinition('unknown-scenario').id, SCENARIO_IDS.shore);
});

test('Scenario selector smoke coverage includes the Skana logo path and both scenario cards', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const screenSource = readFileSync(resolve(currentDir, '../ui/screens/ScenarioSelectionScreen.js'), 'utf8');

  assert.ok(screenSource.includes("withBasePath('logo.png')"));
  assert.ok(screenSource.includes('scenario-card'));
  assert.ok(screenSource.includes('data-scenario'));
  assert.deepEqual(
    Object.values(scenarioDefinitions).map((scenario) => scenario.title),
    ['Shore Protection', 'Offshore Rig Protection'],
  );
});
