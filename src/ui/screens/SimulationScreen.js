import { getEngagementRangeNm } from '../../sim/config/defaultScenario.js';
import { formatClock, formatFixed } from '../../sim/utils/units.js';
import { AlertBanner } from '../components/AlertBanner.js';
import { ControlsCard } from '../components/ControlsCard.js';
import { DataTable } from '../components/DataTable.js';
import { DebugPanel } from '../components/DebugPanel.js';
import { GameCard } from '../components/GameCard.js';
import { GraphCard } from '../components/GraphCard.js';
import { HudPanel } from '../components/HudPanel.js';
import { InfoGridCard } from '../components/InfoGridCard.js';
import { LineGraph } from '../components/LineGraph.js';
import { Minimap } from '../components/Minimap.js';
import { renderIcon } from '../components/Icon.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stateBadge(label, tone, iconName = null) {
  const icon = iconName ? renderIcon(iconName) : '';
  return `<span class="status-badge is-${tone}">${icon}${escapeHtml(label)}</span>`;
}

function classificationBadge(classification) {
  if (classification === 'enemy') {
    return stateBadge(classification, 'danger', 'enemy');
  }

  if (classification === 'target') {
    return stateBadge(classification, 'danger', 'interceptor');
  }

  if (classification === 'suspicious') {
    return stateBadge(classification, 'warning', 'suspicious');
  }

  return stateBadge(classification, 'neutral', 'contact');
}

function unitStateBadge(state) {
  const tone = state === 'intercept' || state === 'engage'
    ? 'success'
    : state === 'return'
      ? 'info'
      : 'neutral';

  return stateBadge(state, tone, tone === 'success' ? 'interceptor' : 'friendly');
}

function describeState(state) {
  switch (state) {
    case 'engage':
      return 'Engage';
    case 'intercept':
      return 'Intercept';
    case 'return':
      return 'Return';
    case 'patrol':
    default:
      return 'Patrol';
  }
}

function contactRowClass(contact) {
  if (contact.classification === 'enemy') {
    return 'row-danger';
  }

  if (contact.classification === 'target') {
    return 'row-danger';
  }

  if (contact.classification === 'suspicious') {
    return 'row-warning';
  }

  return '';
}

function formatCoordinatePair(entity) {
  return `${formatFixed(entity.x, 2)} / ${formatFixed(entity.y, 2)} nm`;
}

function formatHeading(heading) {
  return `${formatFixed(heading, 0)}\u00B0`;
}

function getActiveInterceptors(engine) {
  return engine.state.friendlyUnits.filter((unit) => unit.state === 'intercept' || unit.state === 'engage');
}

export class SimulationScreen {
  constructor({
    engine,
    eventBus,
    config,
    initialSpeed,
    initialAudioState,
    onPlay,
    onPause,
    onReset,
    onBack,
    onSpeedChange,
    onMusicToggle,
    onSfxToggle,
    onMusicVolumeChange,
    onSfxVolumeChange,
  }) {
    this.engine = engine;
    this.eventBus = eventBus;
    this.config = config;
    this.initialSpeed = initialSpeed;
    this.audioState = initialAudioState;
    this.onPlay = onPlay;
    this.onPause = onPause;
    this.onReset = onReset;
    this.onBack = onBack;
    this.onSpeedChange = onSpeedChange;
    this.onMusicToggle = onMusicToggle;
    this.onSfxToggle = onSfxToggle;
    this.onMusicVolumeChange = onMusicVolumeChange;
    this.onSfxVolumeChange = onSfxVolumeChange;
    this.root = null;
    this.tables = [];
    this.graphs = [];
    this.lastUiRefreshAt = 0;
    this.selectedEntityId = null;
    this.unsubscribers = [];

    this.gameCard = new GameCard();
    this.controlsCard = new ControlsCard({
      onPlay: this.onPlay,
      onPause: this.onPause,
      onReset: this.onReset,
      onBack: this.onBack,
      onMusicToggle: this.onMusicToggle,
      onSfxToggle: this.onSfxToggle,
      onMusicVolumeChange: this.onMusicVolumeChange,
      onSfxVolumeChange: this.onSfxVolumeChange,
      onDebugToggle: () => this.debugPanel.toggle(),
      onSpeedChange: this.onSpeedChange,
      onUiClick: () => this.eventBus.emit('ui-click', { source: 'simulation-control' }),
    });
    this.infoGridCard = new InfoGridCard();
    this.graphCard = new GraphCard();
    this.alertBanner = new AlertBanner(eventBus);
    this.minimap = new Minimap(engine.geometry, { embedded: true, hideHeader: true });
    this.debugPanel = new DebugPanel();

    this.selectedFriendlyPanel = new HudPanel({
      title: 'Selected Friendly',
      subtitle: '',
      className: 'selection-card',
      icon: 'friendly',
      embedded: true,
    });
    this.selectedContactPanel = new HudPanel({
      title: 'Selected Contact',
      subtitle: '',
      className: 'selection-card',
      icon: 'contact',
      embedded: true,
    });
    this.interceptorPanel = new HudPanel({
      title: 'Interceptor Status',
      subtitle: '',
      className: 'info-card',
      icon: 'interceptor',
      embedded: true,
    });
  }

  mount(parent) {
    this.root = document.createElement('div');
    this.root.className = 'screen simulation-screen';
    this.root.innerHTML = `
      <div class="simulation-layout">
        <div class="game-card-host"></div>
        <div class="controls-card-host"></div>
        <div class="info-grid-host"></div>
        <div class="graph-card-host"></div>
        <section class="sim-tables"></section>
        <div class="sim-debug-host"></div>
      </div>
    `;

    parent.replaceChildren(this.root);

    this.gameCard.mount(this.root.querySelector('.game-card-host'));
    this.controlsCard.mount(this.root.querySelector('.controls-card-host'));
    this.infoGridCard.mount(this.root.querySelector('.info-grid-host'));
    this.graphCard.mount(this.root.querySelector('.graph-card-host'));

    this.alertBanner.mount(this.gameCard.getAlertHost());
    this.selectedFriendlyPanel.mount(this.infoGridCard.getSlot('friendly'));
    this.selectedContactPanel.mount(this.infoGridCard.getSlot('contact'));
    this.minimap.mount(this.infoGridCard.getSlot('minimap'));
    this.interceptorPanel.mount(this.infoGridCard.getSlot('interceptor'));
    this.debugPanel.mount(this.root.querySelector('.sim-debug-host'));

    this.mountGraphs();
    this.mountTables();
    this.bindEvents();
    this.syncAudioControls();
    this.setSpeed(this.initialSpeed);
    this.update(this.engine, this.initialSpeed, { force: true, fps: 0 });
  }

  bindEvents() {
    this.unsubscribers.push(
      this.eventBus.on('selection-changed', (payload) => {
        this.selectedEntityId = payload.entityId ?? null;
      }),
      this.eventBus.on('audio-state-changed', (payload) => {
        this.audioState = payload;
        this.syncAudioControls();
      }),
    );
  }

  mountGraphs() {
    const classificationGraph = new LineGraph({
      title: 'Classification Counts Over Time',
      embedded: true,
      series: [
        { key: 'neutral', label: 'Neutral', color: '#7dd7e8' },
        { key: 'suspicious', label: 'Suspicious', color: '#f5b950' },
        { key: 'enemy', label: 'Enemy', color: '#ff6776' },
      ],
    });

    const borderDistanceGraph = new LineGraph({
      title: 'Closest Enemy Distance To Border',
      embedded: true,
      series: [
        { key: 'distanceNm', label: 'Closest Enemy Border Distance', color: '#43d38d' },
      ],
      yLabelFormatter: (value) => `${formatFixed(value, 1)} nm`,
      emptyMessage: 'No enemy tracks yet.',
    });

    classificationGraph.mount(this.graphCard.getSlot('classifications'));
    borderDistanceGraph.mount(this.graphCard.getSlot('borderDistance'));
    this.graphs.push(classificationGraph, borderDistanceGraph);
  }

  mountTables() {
    const tableMount = this.root.querySelector('.sim-tables');

    const friendlyTable = new DataTable({
      title: 'Friendly Units',
      titleHtml: `${renderIcon('friendly')} Friendly Units`,
      initialSort: { key: 'id', direction: 'asc' },
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'patrolLine', label: 'Patrol Line' },
        { key: 'state', label: 'State', renderHtml: (row) => unitStateBadge(row.rawState ?? row.state) },
        { key: 'speedLabel', label: 'Speed', sortValue: (row) => row.speed },
        { key: 'headingLabel', label: 'Heading', sortValue: (row) => row.heading },
        { key: 'target', label: 'Target ID' },
        { key: 'distanceLabel', label: 'Distance Travelled', sortValue: (row) => row.distance },
        { key: 'rangeLabel', label: 'Remaining Range', sortValue: (row) => row.range },
      ],
    });

    const contactsTable = new DataTable({
      title: 'Contacts',
      titleHtml: `${renderIcon('contact')} Contacts`,
      initialSort: { key: 'classification', direction: 'desc' },
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'typeLabel', label: 'Type', sortable: false },
        {
          key: 'classification',
          label: 'Classification',
          renderHtml: (row) => classificationBadge(row.classification),
          sortValue: (row) => (
            row.classification === 'enemy'
              ? 4
              : row.classification === 'target'
                ? 3
                : row.classification === 'suspicious'
                  ? 2
                  : 1
          ),
        },
        { key: 'positionLabel', label: 'X / Y', sortable: false },
        { key: 'speedLabel', label: 'Speed', sortValue: (row) => row.speed },
        { key: 'headingLabel', label: 'Heading', sortValue: (row) => row.heading },
        { key: 'insideZoneLabel', label: 'Inside Fishing Zone', sortable: false },
        { key: 'hostileTimer', label: 'Hostile Timer', sortable: false },
        { key: 'interceptor', label: 'Assigned Interceptor' },
      ],
    });

    const eventTable = new DataTable({
      title: 'Event Log',
      titleHtml: `${renderIcon('warning')} Event Log`,
      columns: [
        { key: 'time', label: 'Timestamp' },
        {
          key: 'type',
          label: 'Event Type',
          renderHtml: (row) => stateBadge(row.type, row.tone, row.icon),
          sortValue: (row) => row.type,
        },
        { key: 'description', label: 'Description', sortable: false },
      ],
      emptyMessage: 'Events will appear here as the simulation advances.',
    });

    friendlyTable.mount(tableMount);
    contactsTable.mount(tableMount);
    eventTable.mount(tableMount);
    this.tables.push(friendlyTable, contactsTable, eventTable);
  }

  syncAudioControls() {
    this.controlsCard.setAudioState(this.audioState);
  }

  getCanvasHost() {
    return this.gameCard.getCanvasHost();
  }

  setSpeed(multiplier) {
    this.controlsCard.setSpeed(multiplier);
  }

  updateSelectionPanels(engine, selectedEntity) {
    const engagementRange = getEngagementRangeNm(this.config);
    const activeInterceptors = getActiveInterceptors(engine);

    if (selectedEntity?.type === 'friendly') {
      this.selectedFriendlyPanel.setContent(`
        <div class="info-list">
          <div><span>ID</span><strong>${escapeHtml(selectedEntity.id)}</strong></div>
          <div><span>State</span><strong>${escapeHtml(describeState(selectedEntity.state))}</strong></div>
          <div><span>Patrol Line</span><strong>${escapeHtml(selectedEntity.patrolLineKey)}</strong></div>
          <div><span>Speed</span><strong>${formatFixed(selectedEntity.speedKnots, 1)} kt</strong></div>
          <div><span>Heading</span><strong>${formatHeading(selectedEntity.headingDeg)}</strong></div>
          <div><span>Health</span><strong>${formatFixed(selectedEntity.health ?? selectedEntity.maxHealth ?? 100, 0)} / ${formatFixed(selectedEntity.maxHealth ?? 100, 0)}</strong></div>
          <div><span>Target</span><strong>${escapeHtml(selectedEntity.assignedTargetId ?? 'None')}</strong></div>
          <div><span>Distance Travelled</span><strong>${formatFixed(selectedEntity.distanceTraveledNm, 1)} nm</strong></div>
          <div><span>Engagement Radius</span><strong>${formatFixed(engagementRange, 2)} nm</strong></div>
        </div>
      `);
    } else {
      this.selectedFriendlyPanel.setContent('<p class="hud-empty">Select a Dvora patrol boat to inspect patrol, endurance, and engagement data.</p>');
    }

    if (selectedEntity && selectedEntity.type !== 'friendly') {
      this.selectedContactPanel.setContent(`
        <div class="info-list">
          <div><span>ID</span><strong>${escapeHtml(selectedEntity.id)}</strong></div>
          <div><span>Type</span><strong>${escapeHtml(selectedEntity.type)}</strong></div>
          <div><span>Classification</span><strong>${escapeHtml(selectedEntity.classification)}</strong></div>
          <div><span>Position</span><strong>${escapeHtml(formatCoordinatePair(selectedEntity))}</strong></div>
          <div><span>Heading</span><strong>${formatHeading(selectedEntity.headingDeg)}</strong></div>
          <div><span>Speed</span><strong>${formatFixed(selectedEntity.speedKnots, 1)} kt</strong></div>
          <div><span>Health</span><strong>${formatFixed(selectedEntity.health ?? selectedEntity.maxHealth ?? 100, 0)} / ${formatFixed(selectedEntity.maxHealth ?? 100, 0)}</strong></div>
          <div><span>Hostile Timer</span><strong>${formatClock(selectedEntity.hostileTimerSec ?? 0)}</strong></div>
          <div><span>Assigned Interceptor</span><strong>${escapeHtml(selectedEntity.assignedInterceptorId ?? 'None')}</strong></div>
        </div>
      `);
    } else {
      this.selectedContactPanel.setContent('<p class="hud-empty">Select a contact to inspect classification state, hostile timer, and interceptor assignment.</p>');
    }

    if (activeInterceptors.length > 0) {
      const listMarkup = activeInterceptors.slice(0, 3).map((unit) => `
        <div class="info-list-compact-row">
          <strong>${escapeHtml(unit.id)}</strong>
          <span>${escapeHtml(unit.assignedTargetId ?? 'No target')}</span>
          <span>${formatFixed(unit.speedKnots, 1)} kt</span>
        </div>
      `).join('');

      this.interceptorPanel.setContent(`
        <div class="interceptor-summary">
          <div class="interceptor-count">${activeInterceptors.length}</div>
          <div>
            <p>Active interceptors</p>
            <strong>${escapeHtml(activeInterceptors.map((unit) => unit.id).join(', '))}</strong>
          </div>
        </div>
        <div class="info-list-compact">${listMarkup}</div>
      `);
    } else {
      this.interceptorPanel.setContent('<p class="hud-empty">No active interceptions. Dvora units are currently on patrol lines.</p>');
    }
  }

  updateDebugPanel(engine, selectedEntity, fps, speedMultiplier) {
    this.debugPanel.update([
      { label: 'FPS', value: formatFixed(fps, 1) },
      { label: 'Engine Time', value: formatClock(engine.state.timeSec) },
      { label: 'Sim Speed', value: `x${speedMultiplier}` },
      { label: 'Entities', value: `${engine.state.friendlyUnits.length + engine.state.contacts.length}` },
      { label: 'Selected ID', value: selectedEntity?.id ?? 'None' },
      { label: 'Selected Coordinates', value: selectedEntity ? formatCoordinatePair(selectedEntity) : '-' },
      { label: 'Selected Health', value: selectedEntity ? `${formatFixed(selectedEntity.health ?? selectedEntity.maxHealth ?? 100, 0)} / ${formatFixed(selectedEntity.maxHealth ?? 100, 0)}` : '-' },
      { label: 'Selected Hostile Timer', value: selectedEntity ? formatClock(selectedEntity.hostileTimerSec ?? 0) : '-' },
      { label: 'Assigned Interceptor', value: selectedEntity?.assignedInterceptorId ?? '-' },
    ]);
  }

  update(engine, speedMultiplier, options = {}) {
    const now = performance.now();

    if (!options.force && now - this.lastUiRefreshAt < 110) {
      return;
    }

    this.lastUiRefreshAt = now;
    const counts = engine.getClassificationCounts();
    const activeThreatCount = counts.suspicious + counts.enemy;
    const activeInterceptors = getActiveInterceptors(engine);
    const selectedEntity = [...engine.state.friendlyUnits, ...engine.state.contacts]
      .find((entity) => entity.id === this.selectedEntityId) ?? null;

    if (!selectedEntity && this.selectedEntityId) {
      this.selectedEntityId = null;
    }

    this.gameCard.setStatus('time', formatClock(engine.state.timeSec));
    this.gameCard.setStatus('threats', String(activeThreatCount));
    this.gameCard.setStatus('suspicious', String(counts.suspicious));
    this.gameCard.setStatus('enemy', String(counts.enemy));
    this.gameCard.setStatus('interceptors', String(activeInterceptors.length));
    this.setSpeed(speedMultiplier);

    this.graphs[0].update(engine.state.metricsHistory.classifications);
    this.graphs[1].update(engine.state.metricsHistory.closestEnemyDistance);

    this.minimap.update(engine.state, this.selectedEntityId);
    this.updateSelectionPanels(engine, selectedEntity);
    this.updateDebugPanel(engine, selectedEntity, options.fps ?? 0, speedMultiplier);

    this.tables[0].update(engine.state.friendlyUnits.map((unit) => ({
      id: unit.id,
      rawState: unit.state,
      state: describeState(unit.state),
      patrolLine: unit.patrolLineKey,
      speed: unit.speedKnots,
      speedLabel: `${formatFixed(unit.speedKnots, 1)} kt`,
      heading: unit.headingDeg,
      headingLabel: formatHeading(unit.headingDeg),
      target: unit.assignedTargetId ?? '-',
      distance: unit.distanceTraveledNm,
      distanceLabel: `${formatFixed(unit.distanceTraveledNm, 1)} nm`,
      range: unit.remainingOperationalRangeNm,
      rangeLabel: `${formatFixed(unit.remainingOperationalRangeNm, 1)} nm`,
    })), { selectedKey: this.selectedEntityId });

    this.tables[1].update(engine.state.contacts.map((contact) => ({
      id: contact.id,
      rowClass: contactRowClass(contact),
      typeLabel: contact.type === 'cargo' ? 'Large Neutral' : 'Fishing Boat',
      classification: contact.classification,
      positionLabel: `${formatFixed(contact.x, 1)} / ${formatFixed(contact.y, 1)}`,
      speed: contact.speedKnots,
      speedLabel: `${formatFixed(contact.speedKnots, 1)} kt`,
      heading: contact.headingDeg,
      headingLabel: formatHeading(contact.headingDeg),
      insideZoneLabel: contact.insideFishingZone ? 'Yes' : 'No',
      hostileTimer: formatClock(contact.hostileTimerSec ?? 0),
      interceptor: contact.assignedInterceptorId ?? '-',
    })), { selectedKey: this.selectedEntityId });

    this.tables[2].update(engine.state.eventLog.map((event) => ({
      id: event.id,
      time: formatClock(event.timeSec),
      type: event.type,
      icon: event.type.includes('enemy')
        ? 'enemy'
        : event.type.includes('target')
          ? 'interceptor'
        : event.type.includes('suspicious')
          ? 'suspicious'
          : event.type.includes('intercept') || event.type.includes('neutralized')
            ? 'success'
            : 'warning',
      tone: event.type.includes('enemy')
        ? 'danger'
        : event.type.includes('target')
          ? 'danger'
        : event.type.includes('suspicious')
          ? 'warning'
          : event.type.includes('intercept') || event.type.includes('neutralized')
            ? 'success'
            : 'info',
      description: event.description ?? '-',
    })));
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.alertBanner.destroy();
    this.selectedFriendlyPanel.destroy();
    this.selectedContactPanel.destroy();
    this.interceptorPanel.destroy();
    this.minimap.destroy();
    this.debugPanel.destroy();
    this.gameCard.destroy();
    this.controlsCard.destroy();
    this.infoGridCard.destroy();
    this.graphCard.destroy();
    this.graphs.forEach((graph) => graph.destroy());
    this.tables.forEach((table) => table.destroy());
    this.root?.remove();
    this.root = null;
    this.graphs = [];
    this.tables = [];
  }
}
