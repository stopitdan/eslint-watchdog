# ESLint Watchdog

Keeps your ESLint language server alive. Built for large monorepos where ESLint's Node process accumulates memory and eventually gets OOM-killed, leaving you with no lint diagnostics until you manually restart.

## How It Works

### Proactive Restart (prevents OOM)

A timer periodically restarts the ESLint server to flush accumulated memory — **before** it crashes. Restarts only happen during idle periods (no typing) so you're never interrupted mid-keystroke. Default: every 15 minutes.

### Reactive Crash Detection (catches crashes)

Monitors ESLint diagnostic output. If ESLint was previously producing diagnostics and then stops for a configurable period while JS/TS files are open, the watchdog assumes ESLint has died and automatically restarts it. This catches the "ESLint server ended after 5 retries" scenario.

### Status Bar

A status bar item in the bottom-right shows ESLint health at a glance:

| Icon | Meaning |
|------|---------|
| **$(check) ESLint** | Running normally |
| **$(eye) ESLint** | Watching — waiting for first diagnostics |
| **$(warning) ESLint** | Crash detected |
| **$(sync~spin) ESLint** | Restarting... |
| **$(error) ESLint** | Max restarts reached or error |

**Click the status bar item** at any time to manually restart ESLint.

### Output Log

Open **Output > ESLint Watchdog** to see a timestamped log of all health checks, crash detections, and restarts.

## Settings

All settings are under `eslintWatchdog.*` in your editor settings. You can edit them directly in the Settings UI (search "ESLint Watchdog").

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `autoRestart` | boolean | `true` | Automatically restart ESLint when a crash is detected. When off, shows a notification with a manual restart button instead. |
| `proactiveRestartMinutes` | number | `15` | Restart ESLint on a timer to prevent OOM buildup. Set to `0` to disable proactive restarts entirely. |
| `staleThresholdMinutes` | number | `3` | Minutes of zero ESLint diagnostics (with JS/TS files open) before the watchdog considers ESLint crashed. |
| `cooldownMinutes` | number | `2` | Minimum minutes between automatic restarts to prevent restart loops. |
| `idleSeconds` | number | `30` | Seconds of no typing required before a proactive restart is allowed. Prevents restarts while you're actively editing. |
| `showNotifications` | boolean | `true` | Show toast notifications when ESLint is restarted. Disable for silent operation. |

## Commands

Open the Command Palette (`Cmd+Shift+P`) and search for:

- **ESLint Watchdog: Restart ESLint Server** — Immediately restart the ESLint language server
- **ESLint Watchdog: Reset Restart Counter** — Reset the session restart counter (useful if you hit the max restart limit)

## Tips

- If ESLint is crashing every few minutes, try increasing `proactiveRestartMinutes` to something lower than your typical crash interval (e.g., if it crashes after ~20 min, set this to 12-15).
- If you get false crash detections (e.g., on a project with zero lint errors), increase `staleThresholdMinutes`.
- The watchdog caps automatic crash-restarts at 30 per session to prevent infinite loops. Use the **Reset Restart Counter** command if you hit this limit.
