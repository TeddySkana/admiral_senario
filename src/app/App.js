import { SimulationEngine } from '../sim/SimulationEngine.js';
import { cloneScenarioConfig, defaultScenario } from '../sim/config/defaultScenario.js';
import { EventBus } from '../state/EventBus.js';
import { PixiRenderer } from '../render/PixiRenderer.js';
import { SetupScreen } from '../ui/screens/SetupScreen.js';
import { SimulationScreen } from '../ui/screens/SimulationScreen.js';
import { AudioManager } from '../audio/AudioManager.js';

export class App {
  constructor(root) {
    this.root = root;
    this.currentScreen = null;
    this.currentConfig = cloneScenarioConfig(defaultScenario);
    this.eventBus = null;
    this.engine = null;
    this.renderer = null;
    this.audioManager = null;
    this.simSpeed = 1;
    this.rafId = 0;
    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.smoothedFps = 0;
  }

  mount() {
    this.showSetup(this.currentConfig);
  }

  showSetup(config = this.currentConfig) {
    document.title = 'Skana | SeaSphere - Admiral Senario Simulator';
    this.stopLoop();
    this.destroySimulationResources();
    this.currentConfig = cloneScenarioConfig(config);

    this.currentScreen?.destroy();
    this.currentScreen = new SetupScreen({
      initialConfig: this.currentConfig,
      onRun: (nextConfig) => {
        void this.runSimulation(nextConfig);
      },
    });
    this.currentScreen.mount(this.root);
  }

  async runSimulation(config) {
    document.title = 'Skana | SeaSphere - Admiral Senario Simulator';
    this.stopLoop();
    this.destroySimulationResources();
    this.currentConfig = cloneScenarioConfig(config);
    this.simSpeed = this.currentConfig.simulation.initialSpeedMultiplier;
    this.currentScreen?.destroy();

    this.eventBus = new EventBus();
    this.engine = new SimulationEngine(this.currentConfig, this.eventBus);
    this.audioManager = new AudioManager(this.eventBus, this.currentConfig);

    this.currentScreen = new SimulationScreen({
      engine: this.engine,
      eventBus: this.eventBus,
      config: this.currentConfig,
      initialSpeed: this.simSpeed,
      initialAudioState: this.audioManager.getState(),
      onPlay: () => this.engine.resume(),
      onPause: () => this.engine.pause(),
      onReset: () => this.resetSimulation(),
      onBack: () => this.showSetup(this.currentConfig),
      onSpeedChange: (multiplier) => {
        this.simSpeed = multiplier;
        this.currentScreen?.setSpeed(multiplier);
      },
      onMusicToggle: () => this.audioManager?.toggleMusic(),
      onSfxToggle: () => this.audioManager?.toggleSfx(),
      onMusicVolumeChange: (value) => this.audioManager?.setMusicVolume(value),
      onSfxVolumeChange: (value) => this.audioManager?.setSfxVolume(value),
    });
    this.currentScreen.mount(this.root);

    this.renderer = new PixiRenderer(this.eventBus);
    await this.renderer.mount(this.currentScreen.getCanvasHost(), this.engine.geometry);
    this.audioManager.enterSimulation();
    this.startLoop();
    this.currentScreen.update(this.engine, this.simSpeed, { force: true, fps: this.smoothedFps });
  }

  resetSimulation() {
    if (!this.engine) {
      return;
    }

    this.engine.reset();
    this.accumulator = 0;
    this.renderer?.reset();
    this.currentScreen?.update(this.engine, this.simSpeed, { force: true, fps: this.smoothedFps });
  }

  startLoop() {
    if (!this.engine || !this.renderer) {
      return;
    }

    this.stopLoop();
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
    this.smoothedFps = 0;
    const fixedStepSec = this.currentConfig.simulation.fixedStepSeconds ?? 1 / 20;

    const frame = (time) => {
      const realDeltaSec = Math.min(0.25, (time - this.lastFrameTime) / 1000 || 0);
      this.lastFrameTime = time;
      const instantFps = realDeltaSec > 0 ? 1 / realDeltaSec : 0;
      this.smoothedFps = this.smoothedFps === 0
        ? instantFps
        : (this.smoothedFps * 0.88) + (instantFps * 0.12);

      if (this.engine && !this.engine.state.paused) {
        this.accumulator += realDeltaSec * this.simSpeed;
        let steps = 0;

        while (this.accumulator >= fixedStepSec && steps < 240) {
          this.engine.update(fixedStepSec);
          this.accumulator -= fixedStepSec;
          steps += 1;
        }
      }

      this.renderer?.update(realDeltaSec);

      if (this.engine && this.renderer) {
        const alpha = this.engine.state.paused
          ? 1
          : (fixedStepSec > 0 ? Math.min(1, this.accumulator / fixedStepSec) : 1);

        this.renderer.render(this.engine.state, {
          alpha,
          fps: this.smoothedFps,
        });
        this.currentScreen?.update(this.engine, this.simSpeed, { fps: this.smoothedFps });
      }

      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  destroySimulationResources() {
    this.renderer?.destroy();
    this.renderer = null;

    this.audioManager?.destroy();
    this.audioManager = null;

    this.engine?.destroy();
    this.engine = null;

    this.eventBus?.clear();
    this.eventBus = null;
  }
}
