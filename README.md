# Skana | SeaSphere - Admiral Senario Simulator

Browser-based 2D maritime border-defense simulation built with Vite, vanilla ES modules, PixiJS, `pixi-particles`, and Howler.js.
Some change.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy To GitHub Pages

This project is now prepared for GitHub Pages deployment:

- Vite base path is auto-resolved in `vite.config.js`
- Runtime sprite/audio paths use `import.meta.env.BASE_URL`, so project pages (subpath) work correctly
- CI workflow is included at `.github/workflows/deploy-pages.yml`

### One-Time Setup (GitHub UI)

1. Push this repository to GitHub.
2. Open `Settings -> Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.

### Deploy Flow

1. Commit and push to `main`.
2. GitHub Actions runs the Pages workflow automatically.
3. After success, your site will be available at:
   - Project page: `https://<username>.github.io/<repo-name>/`
   - User/org page (`<username>.github.io` repo): `https://<username>.github.io/`

### Local Verification Before Push

```bash
npm install
npm run build
npm run preview
```

### Optional Override For Custom Domains / Special Paths

You can force a base path during build:

```bash
# Example: deploy under /simulator/
VITE_BASE_PATH=/simulator/ npm run build
```

On PowerShell:

```powershell
$env:VITE_BASE_PATH = '/simulator/'
npm run build
```

## Theme And Styling Approach

This refinement pass introduces a small theme/token system to keep visual styling consistent and brand-oriented.

- `src/styles/theme.css`
  - defines CSS design tokens (page background, panel background, primary/secondary text, accent, success/warning/danger, border/divider)
- `src/ui/theme/tokens.js`
  - central JS token object and `applyThemeTokens()` to push values into CSS variables at runtime
- `src/styles/global.css`
  - updated layout and component styling to use tokenized colors and a premium operational look

## Audio Asset Replacement

Synthetic/procedural placeholder sounds were replaced with real Freesound audio files.

- Audio files now live in:
  - `public/audio/sfx`
  - `public/audio/ambient`
  - `public/audio/music`
- Manifest updated in:
  - `src/audio/soundManifest.js`
- Audio orchestration remains centralized in:
  - `src/audio/AudioManager.js`

Included replacements cover:

- weapon fire
- impact hit
- explosion
- suspicious alert
- enemy alert
- interceptor assignment
- UI click/toggle
- ambient sea loop
- background music

Source list and licenses are documented in:

- `public/audio/FREESOUND_SOURCES.md`

Assumption: Freesound preview MP3 assets were used in this phase for lightweight browser delivery.

## Setup Page Layout Rules

Setup screen was redesigned to remove the old hero card, descriptive block, mini-cards, and reset-defaults button.

- Each setup parameter panel now spans full width and is rendered in its own row.
- Input density is controlled responsively:
  - desktop: `8` inputs per row
  - tablet: `4` inputs per row
  - mobile: `2` inputs per row
- `Run Simulation` is now a centered, larger primary CTA with icon treatment.

Primary files:

- `src/ui/screens/SetupScreen.js`
- `src/ui/components/SetupPanel.js`

## Simulation Screen Restructure

The simulation layout is now split into distinct cards:

- **Game Card**: viewport + viewport-related overlays/alerts
- **Controls Card**: primary controls and audio/speed controls
- **Info Grid Card**: Selected Friendly, Selected Contact, Minimap, Interceptor Status in one full-width card
- **Graph Card**: both requested graphs in one shared card
- **Tables Area**: friendly/contacts/event-log tables

Speed controls are now exactly:

- `x1`
- `x10`
- `x60`
- `x600`

The top status strip no longer includes sim speed.

Primary files:

- `src/ui/screens/SimulationScreen.js`
- `src/ui/components/GameCard.js`
- `src/ui/components/ControlsCard.js`
- `src/ui/components/InfoGridCard.js`
- `src/ui/components/GraphCard.js`
- `src/ui/components/Icon.js`

## Gameplay Refinements

- **Dvora kill radius behavior**
  - Each Dvora now immediately engages hostile contacts that enter its engagement radius.
  - Engagement radius is configured directly in nautical miles and defaults to **7.5 nm**.
  - The selected Dvora engagement radius is visualized with fill (`alpha = 0.25`) in the selection overlay.
  - Relevant files:
    - `src/sim/systems/InterceptionSystem.js`
    - `src/render/overlays/SelectionOverlay.js`

- **Fishing boat behavior update**
  - Fishing boats now default to random-walk behavior inside the fishing zone.
  - Random walk includes local collision-avoidance steering against nearby fishing boats.
  - A user-configurable `attackModeChancePerMinute` can promote one fishing boat at a time into attack mode; it exits the zone and runs toward the west border.
  - Relevant files:
    - `src/sim/systems/ContactBehaviorSystem.js`
    - `src/sim/entities/fishingBoat.js`
    - `src/sim/SimulationEngine.js`

- **Repeat suspicious escalation**
  - New setup parameter: `classification.suspiciousEscalationThreshold` (default `10`).
  - If a vessel becomes suspicious more than this threshold, the next suspicious transition is escalated to `target`.
  - `target` contacts are treated as hostile for interception assignment and threat rendering.
  - Relevant files:
    - `src/sim/systems/ClassificationSystem.js`
    - `src/sim/systems/InterceptionSystem.js`
    - `src/ui/screens/SetupScreen.js`

- **Post-kill interceptor reallocation**
  - After a Dvora neutralizes a target, it evaluates nearby suspicious/hostile contacts.
  - If it has a shorter interception ETA than the currently assigned Dvora, allocation is transferred.
  - Reallocation emits normal assignment events plus a dedicated `interceptor-reassigned` event.
  - Relevant file:
    - `src/sim/systems/InterceptionSystem.js`

- **Fishing-zone exclusion for Dvora units**
  - Dvora intercept navigation computes an avoidance waypoint when a direct path would cross the fishing zone.
  - If a Dvora enters the fishing zone, it is projected back outside and continues from a legal position.
  - Relevant file:
    - `src/sim/systems/InterceptionSystem.js`

- **Particle-runtime crash hardening**
  - Added defensive guards around emitter update loops to prevent runtime breakage from third-party particle edge cases.
  - This addresses crashes of the form: `Class constructor ... cannot be invoked without 'new'`.
  - Relevant file:
    - `src/render/effects/EffectManager.js`

## OpenGameArt Ship Sprites

Vector placeholder ships were replaced with naval-specific OpenGameArt sprites (with fallback still present in renderer code).

- Source pack:
  - https://opengameart.org/content/pirate-pack-190
- License:
  - CC0 (Kenney)
- Files used:
  - `public/sprites/ships/dvora-friendly.png`
  - `public/sprites/ships/cargo-neutral.png`
  - `public/sprites/ships/fishing-contact.png`

Attribution/license notes:

- `public/sprites/ships/OPEN_GAME_ART_SOURCES.md`
- `public/sprites/ships/OPEN_GAME_ART_LICENSE.txt`

## Responsive Behavior Assumptions

The redesign targets desktop/tablet/mobile with explicit breakpoints:

- Setup inputs: `8 / 4 / 2` columns
- Lower info card: `4x25% / 2x50% / 1x100%`
- Graph pair: side-by-side on desktop, stacked on narrower screens
- Controls: wrap and remain touch-usable at smaller widths

## Other Notes

- SPA title and favicon were updated:
  - title: `Skana | SeaSphere - Admiral Senario Simulator`
  - favicon: `/favicon.png`
- Core architecture is preserved:
  - engine logic remains in simulation modules
  - renderer remains visual-only
  - UI remains vanilla JS + HTML/CSS
  - event bus continues to mediate engine/UI/renderer/audio communication
