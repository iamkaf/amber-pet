<p align="center">
  <img src="assets/banner.png" alt="Amber Pet banner" width="480" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-e7b8c6?style=for-the-badge&labelColor=241b24" alt="MIT License" /></a>
  <a href="https://github.com/iamkaf/amber-pet/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/iamkaf/amber-pet/ci.yml?style=for-the-badge&labelColor=241b24&color=9fc5e8" alt="CI" /></a>
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.116.0-9fc5e8?style=for-the-badge&logo=visualstudiocode&logoColor=9fc5e8&labelColor=241b24" alt="VS Code 1.116.0+" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-d8b4fe?style=for-the-badge&logo=typescript&logoColor=d8b4fe&labelColor=241b24" alt="TypeScript 6.0" />
</p>

<h1 align="center">Amber Pet</h1>

<p align="center">
  <strong>An interactive companion that lives in the VS Code Explorer.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#development">Development</a>
</p>

---

Amber Pet adds a small animated companion to VS Code. Spawn Amber from the Command Palette or status bar, then drag her around the Explorer view, click her for a headpat, and let her react while you work.

## Features

| Feature            | Details                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Explorer companion | Amber opens in a dedicated Explorer view instead of taking over an editor tab               |
| Direct interaction | Drag Amber, click her for a headpat, or press `Enter`/`Space` while she is focused          |
| Work reactions     | Amber waves when she spawns and reacts to typing with throttled cheering and wow animations |
| Idle behavior      | Amber idles, gets bored after sustained inactivity, then falls asleep                       |
| Room backgrounds   | Switch between bundled room backgrounds from the small controls in the pet view             |
| Reaction sounds    | Amber plays short sounds for headpats, pickup, drops, and drag movement                     |
| Position reset     | Reset Amber from the Command Palette or the `R` control in the pet view                     |

## Quick Start

1. Install dependencies.

```sh
npm install
```

2. Build the extension.

```sh
npm run compile
```

3. Open the project in VS Code and run the **Run Extension** launch configuration.

4. In the Extension Development Host, run **Amber Pet: Spawn Pet** or click the `$(sparkle) Amber Pet` status bar item.

## Commands

| Command                         | Description                              |
| ------------------------------- | ---------------------------------------- |
| `Amber Pet: Spawn Pet`          | Reveals Amber in the Explorer view       |
| `Amber Pet: Reset Pet Position` | Moves Amber back to her default position |

## Controls

| Control   | Description                                                 |
| --------- | ----------------------------------------------------------- |
| `‹` / `›` | Change the room background                                  |
| `S`       | Mute or unmute Amber sounds for the current VS Code profile |
| `R`       | Reset Amber's position                                      |

## Configuration

| Setting                  | Type      | Default | Description                                  |
| ------------------------ | --------- | ------- | -------------------------------------------- |
| `amberPet.sound.enabled` | `boolean` | `true`  | Enables Amber's reaction sounds              |
| `amberPet.sound.volume`  | `number`  | `45`    | Sets reaction sound volume from `0` to `100` |

## Development

| Task                     | Command                  |
| ------------------------ | ------------------------ |
| Type-check and bundle    | `npm run compile`        |
| Production bundle        | `npm run package`        |
| Full local verification  | `npm run ci`             |
| Lint                     | `npm run lint`           |
| Format                   | `npm run format`         |
| Check formatting         | `npm run format:check`   |
| Regenerate sprite assets | `npm run process-assets` |

## Sprite Assets

Runtime sprites live in `media/images/amber/` and are described by `media/images/amber/manifest.json`. The manifest contains:

| Manifest area | Purpose                                                           |
| ------------- | ----------------------------------------------------------------- |
| `frames`      | Catalogs every detected sprite frame                              |
| `source`      | Stores each frame's original sheet bounds                         |
| `pivot`       | Sets the per-frame transform origin used by animation and physics |
| `animations`  | Defines named animation sequences from the frame catalog          |

During development, transparent source sheets can be placed at:

```text
media/images/sheet1-no-background.png
media/images/sheet2-no-background.png
```

Those source sheets are ignored by git. After changing them, regenerate the runtime frames:

```sh
npm run process-assets
```

The processor detects transparent sprite components, orders them by visual row and column, normalizes each frame onto a stable canvas, and writes the runtime frames into `media/images/amber/`.

## Audio Assets

Reaction sounds live in `media/audio/`:

| File                                   | Used for                    |
| -------------------------------------- | --------------------------- |
| `happy.mp3`                            | Headpats                    |
| `startled.mp3`                         | Pickup                      |
| `curious.mp3`                          | Reserved curiosity reaction |
| `dropped1.mp3` / `dropped2.mp3`        | Drop reactions              |
| `aprehensive.mp3` / `aprehensive3.mp3` | Drag-distance reactions     |

The webview loads sounds as local extension resources and plays them only in response to direct interaction with Amber.

## License

Amber Pet is released under the [MIT License](LICENSE).
