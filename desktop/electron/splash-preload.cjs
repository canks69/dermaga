'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The splash listens for progress, and can ask to quit when a prerequisite is
// missing. Nothing else.
contextBridge.exposeInMainWorld('splash', {
  onStep: (callback) => ipcRenderer.on('splash:step', (_event, step) => callback(step)),
  onFatal: (callback) => ipcRenderer.on('splash:fatal', (_event, problem) => callback(problem)),
  quit: () => ipcRenderer.send('splash:quit'),
});
