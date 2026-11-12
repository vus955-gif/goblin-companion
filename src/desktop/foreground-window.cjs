const { spawn } = require("node:child_process");

// Jeden dlugo zyjacy proces PowerShell: Add-Type (kompilacja C#) wykonuje sie raz
// przy starcie, a potem kazda linia "<id>" na stdin zwraca linie
// "goblin-foreground <id> <json>" na stdout. Gdy stdin sie zamknie (wyjscie lub
// awaria Electrona), ReadLine zwraca $null i proces konczy sie sam.
const RESPONSE_PREFIX = "goblin-foreground";
const FOREGROUND_WINDOW_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GoblinForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
$stdout.AutoFlush = $true
$stdin = [Console]::In
while ($null -ne ($requestId = $stdin.ReadLine())) {
  $result = [ordered]@{ ProcessName = ''; Title = '' }
  try {
    $handle = [GoblinForegroundWindow]::GetForegroundWindow()
    $titleBuilder = New-Object System.Text.StringBuilder 512
    [void][GoblinForegroundWindow]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)
    $result.Title = $titleBuilder.ToString()
    $processId = [uint32]0
    [void][GoblinForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
    $result.ProcessName = [System.Diagnostics.Process]::GetProcessById([int]$processId).ProcessName
  } catch {}
  $json = New-Object PSObject -Property $result | ConvertTo-Json -Compress
  $stdout.WriteLine("${RESPONSE_PREFIX} " + $requestId.Trim() + " " + $json)
}
`;

const DEFAULT_STARTUP_TIMEOUT_MS = 10000;
const DEFAULT_SAMPLE_TIMEOUT_MS = 2000;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const RESPONSE_PATTERN = new RegExp(`^${RESPONSE_PREFIX} (\\d+) (.*)$`);

function encodePowerShellCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function getPowerShellArgs() {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodePowerShellCommand(FOREGROUND_WINDOW_SCRIPT)
  ];
}

function parseForegroundWindow(json) {
  try {
    const parsed = JSON.parse(json);

    return {
      ProcessName: typeof parsed?.ProcessName === "string" ? parsed.ProcessName : "",
      Title: typeof parsed?.Title === "string" ? parsed.Title : ""
    };
  } catch {
    return null;
  }
}

function createForegroundWindowProbe({
  maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  now = Date.now,
  onFailure = () => {},
  platform = process.platform,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sampleTimeoutMs = DEFAULT_SAMPLE_TIMEOUT_MS,
  spawnProcess = spawn,
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS
} = {}) {
  let child = null;
  let hasAnswered = false;
  let stdoutBuffer = "";
  let pending = null;
  let nextRequestId = 1;
  let consecutiveFailures = 0;
  let retryAt = 0;
  let disposed = false;

  function settle(value) {
    if (!pending) {
      return;
    }

    const { resolve, timer } = pending;
    pending = null;
    clearTimeout(timer);
    resolve(value);
  }

  function stopChild() {
    if (!child) {
      return;
    }

    const stoppedChild = child;
    child = null;
    hasAnswered = false;
    stdoutBuffer = "";

    try {
      stoppedChild.stdin.end();
    } catch {
      // stdin moze byc juz zamkniety.
    }

    if (stoppedChild.exitCode === null && !stoppedChild.killed) {
      stoppedChild.kill();
    }
  }

  // Po awarii (brak PowerShella, blokada polityka, chwilowy blad startu procesu)
  // nie startujemy procesu przy kazdym odpytaniu, tylko z rosnaca przerwa.
  function recordFailure(reason) {
    consecutiveFailures += 1;
    retryAt = now() + Math.min(maxRetryDelayMs, retryDelayMs * 2 ** (consecutiveFailures - 1));
    stopChild();
    settle(null);
    onFailure(reason, consecutiveFailures);
  }

  function handleLine(line) {
    const match = RESPONSE_PATTERN.exec(line);

    // Linie bez naszego prefiksu albo spoznione odpowiedzi na wczesniejsze
    // zapytania pomijamy, zeby nie przypisac ich do biezacego zadania.
    if (!match || !pending || Number(match[1]) !== pending.id) {
      return;
    }

    hasAnswered = true;
    consecutiveFailures = 0;
    retryAt = 0;
    settle(parseForegroundWindow(match[2]));
  }

  function startChild() {
    const startedChild = spawnProcess("powershell.exe", getPowerShellArgs(), {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    });

    child = startedChild;
    startedChild.stdout.setEncoding("utf8");
    startedChild.stdout.on("data", (chunk) => {
      if (child !== startedChild) {
        return;
      }

      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        if (line) {
          handleLine(line);
        }

        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });
    // EPIPE przy zapisie do procesu, ktory wlasnie sie zakonczyl - obslugiwane przez "exit".
    startedChild.stdin.on("error", () => {});
    startedChild.on("error", (error) => {
      if (child === startedChild) {
        recordFailure(`could not start powershell.exe: ${error.message}`);
      }
    });
    startedChild.on("exit", (code, signal) => {
      if (child === startedChild) {
        recordFailure(`powershell.exe exited (code ${code}, signal ${signal})`);
      }
    });
  }

  function sample() {
    if (platform !== "win32" || disposed || now() < retryAt) {
      return Promise.resolve(null);
    }

    // Jedno zapytanie naraz.
    if (pending) {
      return pending.promise;
    }

    if (!child) {
      startChild();
    }

    let resolvePending;
    const promise = new Promise((resolve) => {
      resolvePending = resolve;
    });
    const id = nextRequestId;
    const timeoutMs = hasAnswered ? sampleTimeoutMs : startupTimeoutMs;

    nextRequestId += 1;
    pending = {
      id,
      promise,
      resolve: resolvePending,
      // Zawieszony proces jest zabijany i startuje od nowa przy kolejnym odpytaniu.
      timer: setTimeout(() => recordFailure(`no answer within ${timeoutMs} ms`), timeoutMs)
    };

    if (child) {
      child.stdin.write(`${id}\n`);
    }

    return promise;
  }

  function dispose() {
    disposed = true;
    stopChild();
    settle(null);
  }

  return {
    dispose,
    get pid() {
      return child?.pid ?? null;
    },
    sample
  };
}

module.exports = {
  FOREGROUND_WINDOW_SCRIPT,
  RESPONSE_PREFIX,
  createForegroundWindowProbe,
  encodePowerShellCommand,
  getPowerShellArgs
};
