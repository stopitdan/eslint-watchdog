const vscode = require("vscode");

// --- State ---
let statusBarItem;
let proactiveTimer;
let healthCheckTimer;

let lastActivityTime = Date.now();
let lastEslintDiagTime = 0;
let eslintEverActive = false;
let lastRestartTime = 0;
let restartCount = 0;
let crashRestartCount = 0;

const MAX_CRASH_RESTARTS = 30;
const HEALTH_CHECK_INTERVAL_MS = 20_000; // check every 20s

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const output = vscode.window.createOutputChannel("ESLint Watchdog");
  log(output, "ESLint Watchdog activated");

  // --- Status bar item (click to restart) ---
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "eslintWatchdog.restart";
  updateStatusBar("watching");
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("eslintWatchdog.restart", () => {
      log(output, "Manual restart requested");
      restartEslint(output, "manual");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("eslintWatchdog.resetCounter", () => {
      restartCount = 0;
      crashRestartCount = 0;
      log(output, "Restart counter reset");
      vscode.window.showInformationMessage(
        "ESLint Watchdog: Restart counter reset."
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("eslintWatchdog.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "eslintWatchdog"
      );
    })
  );

  // --- Track user activity (typing) to avoid restarting mid-edit ---
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      lastActivityTime = Date.now();
    })
  );

  // --- Monitor ESLint diagnostics ---
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      const count = countEslintDiags();
      if (count > 0) {
        if (!eslintEverActive) {
          log(output, `ESLint is active (${count} diagnostic(s) seen)`);
        }
        eslintEverActive = true;
        lastEslintDiagTime = Date.now();
        updateStatusBar("ok");
      }
    })
  );

  // --- Proactive restart timer ---
  setupProactiveTimer(output);

  // Listen for config changes to reset the proactive timer
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("eslintWatchdog.proactiveRestartMinutes")) {
        setupProactiveTimer(output);
      }
    })
  );

  // --- Health check timer (reactive crash detection) ---
  healthCheckTimer = setInterval(() => {
    healthCheck(output);
  }, HEALTH_CHECK_INTERVAL_MS);
  context.subscriptions.push({
    dispose: () => clearInterval(healthCheckTimer),
  });

  // --- Initial check ---
  const count = countEslintDiags();
  if (count > 0) {
    eslintEverActive = true;
    lastEslintDiagTime = Date.now();
    updateStatusBar("ok");
  }

  log(output, "Monitoring ESLint server health...");
}

// --- Core logic ---

function setupProactiveTimer(output) {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }

  const config = vscode.workspace.getConfiguration("eslintWatchdog");
  const minutes = config.get("proactiveRestartMinutes", 15);

  if (minutes > 0) {
    proactiveTimer = setInterval(() => {
      proactiveRestart(output);
    }, minutes * 60 * 1000);
    log(output, `Proactive restart scheduled every ${minutes} min`);
  }
}

function countEslintDiags() {
  let count = 0;
  const allDiags = vscode.languages.getDiagnostics();
  for (const [, diags] of allDiags) {
    for (const d of diags) {
      if (d.source === "eslint") count++;
    }
  }
  return count;
}

function hasOpenJsTsFiles() {
  return vscode.workspace.textDocuments.some(
    (doc) =>
      !doc.isClosed && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(doc.fileName)
  );
}

function healthCheck(output) {
  const config = vscode.workspace.getConfiguration("eslintWatchdog");
  const staleMinutes = config.get("staleThresholdMinutes", 3);
  const cooldownMinutes = config.get("cooldownMinutes", 2);
  const autoRestart = config.get("autoRestart", true);

  const now = Date.now();
  const eslintDiagCount = countEslintDiags();

  // ESLint is alive and well
  if (eslintDiagCount > 0) {
    return;
  }

  // Only trigger crash detection if ESLint was previously active
  if (!eslintEverActive) return;

  // Only care if there are open JS/TS files (otherwise 0 diags is expected)
  if (!hasOpenJsTsFiles()) return;

  // Has it been long enough since we last saw ESLint diagnostics?
  const timeSinceLastDiag = now - lastEslintDiagTime;
  if (timeSinceLastDiag < staleMinutes * 60 * 1000) return;

  // Cooldown: don't restart too frequently
  const timeSinceLastRestart = now - lastRestartTime;
  if (timeSinceLastRestart < cooldownMinutes * 60 * 1000) return;

  // Safety: don't restart infinitely
  if (crashRestartCount >= MAX_CRASH_RESTARTS) {
    updateStatusBar("error");
    return;
  }

  // Crash detected
  log(
    output,
    `Crash detected: 0 ESLint diagnostics for ${Math.round(timeSinceLastDiag / 1000)}s with JS/TS files open`
  );
  updateStatusBar("crashed");

  if (autoRestart) {
    restartEslint(output, "crash-auto");
    crashRestartCount++;

    const showNotifs = config.get("showNotifications", true);
    if (showNotifs) {
      vscode.window
        .showWarningMessage(
          `ESLint Watchdog: Server appeared dead — restarted automatically (${crashRestartCount}x this session)`,
          "Disable Auto-Restart",
          "OK"
        )
        .then((action) => {
          if (action === "Disable Auto-Restart") {
            vscode.workspace
              .getConfiguration("eslintWatchdog")
              .update("autoRestart", false, vscode.ConfigurationTarget.Global);
          }
        });
    }
  } else {
    vscode.window
      .showWarningMessage(
        "ESLint server appears to have crashed.",
        "Restart ESLint",
        "Dismiss"
      )
      .then((action) => {
        if (action === "Restart ESLint") {
          restartEslint(output, "crash-manual");
        }
      });
  }
}

function proactiveRestart(output) {
  const config = vscode.workspace.getConfiguration("eslintWatchdog");
  const cooldownMinutes = config.get("cooldownMinutes", 2);
  const idleSeconds = config.get("idleSeconds", 30);

  const now = Date.now();

  // Only restart if the user has been idle (not typing)
  if (now - lastActivityTime < idleSeconds * 1000) return;

  // Cooldown
  if (now - lastRestartTime < cooldownMinutes * 60 * 1000) return;

  // Only if JS/TS files are open
  if (!hasOpenJsTsFiles()) return;

  log(output, "Proactive restart (preventing OOM buildup)");
  restartEslint(output, "proactive");
}

async function restartEslint(output, reason) {
  updateStatusBar("restarting");
  log(output, `Restarting ESLint server (reason: ${reason})`);

  try {
    await vscode.commands.executeCommand("eslint.restart");
    lastRestartTime = Date.now();
    restartCount++;
    // After restart, reset the "ever active" tracker so we don't immediately
    // think it crashed again while it's still starting up
    eslintEverActive = false;
    lastEslintDiagTime = Date.now();

    log(output, `ESLint restarted successfully (total: ${restartCount})`);

    // Wait a bit then update status based on whether ESLint came back
    setTimeout(() => {
      const count = countEslintDiags();
      if (count > 0) {
        eslintEverActive = true;
        lastEslintDiagTime = Date.now();
        updateStatusBar("ok");
      } else {
        updateStatusBar("watching");
      }
    }, 8000);
  } catch (err) {
    updateStatusBar("error");
    log(output, `Failed to restart ESLint: ${err.message}`);
    vscode.window.showErrorMessage(
      `ESLint Watchdog: Failed to restart — ${err.message}`
    );
  }
}

function updateStatusBar(status) {
  if (!statusBarItem) return;

  switch (status) {
    case "ok":
      statusBarItem.text = "$(check) ESLint";
      statusBarItem.tooltip = `ESLint is running (${restartCount} restarts this session)\nClick to restart`;
      statusBarItem.backgroundColor = undefined;
      break;
    case "watching":
      statusBarItem.text = "$(eye) ESLint";
      statusBarItem.tooltip =
        "ESLint Watchdog: monitoring\nWaiting for ESLint diagnostics...\nClick to restart";
      statusBarItem.backgroundColor = undefined;
      break;
    case "crashed":
      statusBarItem.text = "$(warning) ESLint";
      statusBarItem.tooltip =
        "ESLint server appears to have crashed\nClick to restart";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      break;
    case "restarting":
      statusBarItem.text = "$(sync~spin) ESLint";
      statusBarItem.tooltip = "Restarting ESLint server...";
      statusBarItem.backgroundColor = undefined;
      break;
    case "error":
      statusBarItem.text = "$(error) ESLint";
      statusBarItem.tooltip =
        "ESLint Watchdog: max restarts reached or error\nClick to try again";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      break;
  }
}

function log(output, message) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  output.appendLine(`[${ts}] ${message}`);
}

function deactivate() {}

module.exports = { activate, deactivate };
