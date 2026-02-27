# Changelog

## 0.6.1

- Output channel now clarifies that ESLint’s “Server process exited successfully” message refers to the previous process shutting down after a restart, not the new server exiting

## 0.6.0

- Fixed IDE crash when using “ESLint Watchdog: Open Settings”; replaced extension-scoped settings filter with a safe search query

## 0.5.0

- Added **ESLint Watchdog: Open Settings** command — open the Settings UI filtered to this extension from the Command Palette (no JSON editing required)
- README updated: settings are editable in the UI with text fields and checkboxes; documented the new Open Settings command

## 0.4.3

- Configuration changes for proactive restart interval now apply immediately without reloading the window

## 0.4.2

- Improved health-check logic to reduce false crash detection when ESLint is slow to produce diagnostics on startup

## 0.4.1

- Cooldown and idle checks now use the same clock for consistent behavior during proactive restarts

## 0.4.0

- Proactive restart timer resets when `proactiveRestartMinutes` is changed in settings
- Status bar tooltips updated with clearer copy and restart count

## 0.3.0

- All settings exposed in the VS Code configuration schema with markdown descriptions and minimum values
- Settings UI shows number inputs and checkboxes for all options (no raw JSON required for common tweaks)

## 0.2.0

- Rich setting descriptions with markdown formatting
- README with full documentation
- Prepared for public release on Open VSX

## 0.1.0

- Initial release
- Proactive ESLint restart on a configurable timer to prevent OOM crashes
- Reactive crash detection via diagnostic monitoring
- Status bar item showing ESLint health (click to restart)
- Configurable settings: restart interval, stale threshold, cooldown, idle detection
- Output channel logging for all restarts and detections
