# Amber Pet

Amber Pet adds a small animated companion to VS Code. Spawn Amber from the Command Palette or the status bar, then drag her around the Explorer view, click her for a headpat, and let her react while you work.

## Features

- Spawn or reveal Amber with **Amber Pet: Spawn Pet**.
- Use the `$(sparkle) Amber Pet` status bar item for quick access.
- Amber opens in a dedicated Explorer view instead of taking over an editor tab.
- Drag Amber around the pet view.
- Click Amber, or press `Enter`/`Space` while she is focused, to play the headpat animation.
- Amber waves when she spawns.
- Amber reacts to typing with cheering and wow animations, throttled so she stays pleasant.
- Amber idles, gets bored after sustained inactivity, then falls asleep.
- Amber plays short reaction sounds when you headpat, pick her up, or drop her.
- Legacy Amber Pet panels restore after VS Code restarts when they were left open.

## Development

Install dependencies:

```sh
npm install
```

Build the extension:

```sh
npm run compile
```

Run the extension from VS Code with the **Run Extension** launch configuration.

Create a production bundle:

```sh
npm run package
```

## Sprite Assets

Runtime sprites live in `media/images/processed/` and are described by `media/images/processed/manifest.json`. The manifest contains:

- a complete `frames` catalog for every detected sprite from both sheets
- per-frame `source` bounds
- editable per-frame `pivot` values
- named `animations` that reference frames from the catalog

During development, transparent source sheets can be placed at:

- `media/images/sheet1-no-background.png`
- `media/images/sheet2-no-background.png`

Those source sheets are ignored by git. After changing them, regenerate the runtime frames:

```sh
npm run process-assets
```

The processor detects transparent sprite components, orders them by visual row and column, normalizes each frame onto a stable canvas, and writes all processed sprite frames used by the extension and future animation composition tools.

## Audio Assets

Reaction sounds live in `media/audio/`:

- `aprehensive.mp3`
- `aprehensive3.mp3`
- `curious.mp3`
- `dropped1.mp3`
- `dropped2.mp3`
- `happy.mp3`
- `startled.mp3`

The webview loads them as local extension resources and plays them only in response to direct interactions with Amber.
