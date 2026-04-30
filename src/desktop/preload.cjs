const { contextBridge, ipcRenderer } = require("electron");

const allowedWindowCommands = new Set(["close", "minimize", "toggle-pin"]);

contextBridge.exposeInMainWorld("goblinDesktop", {
  onSignals(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("goblin:signals", listener);

    return () => {
      ipcRenderer.removeListener("goblin:signals", listener);
    };
  },

  sendWindowCommand(command) {
    if (!allowedWindowCommands.has(command)) {
      return Promise.resolve(false);
    }

    return ipcRenderer.invoke("goblin:window-command", command);
  },

  setInteractiveMode(isInteractive) {
    return ipcRenderer.invoke("goblin:interactive-mode", Boolean(isInteractive));
  }
});
