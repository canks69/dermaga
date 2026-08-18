'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The splash listens for progress, and can ask to quit when a prerequisite is
// missing. Nothing else.
contextBridge.exposeInMainWorld('splash', {
  onStep: (callback) => ipcRenderer.on('splash:step', (_event, step) => callback(step)),
  onFatal: (callback) => ipcRenderer.on('splash:fatal', (_event, problem) => callback(problem)),
  // A long first-run job -- installing the kernel -- gets a panel of its own.
  onSetup: (callback) => ipcRenderer.on('splash:setup', (_event, setup) => callback(setup)),
  quit: () => ipcRenderer.send('splash:quit'),
});
