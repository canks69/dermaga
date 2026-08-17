'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer has no network access of its own: every call goes through the
// main process to the agent, and everything the agent pushes comes back on one
// notification channel.
contextBridge.exposeInMainWorld('dermaga', {
  platform: process.platform,
  isElectron: true,

  invoke: (method, params) => ipcRenderer.invoke('dermaga:invoke', method, params),

  onNotify: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('dermaga:notify', handler);
    return () => ipcRenderer.removeListener('dermaga:notify', handler);
  },

  isFullScreen: () => ipcRenderer.invoke('dermaga:is-fullscreen'),

  // Returns the chosen path, or null if the dialog was dismissed.
  pickDirectory: (title) => ipcRenderer.invoke('dermaga:pick-directory', title),

  onFullScreenChange: (callback) => {
    const handler = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('dermaga:fullscreen', handler);
    return () => ipcRenderer.removeListener('dermaga:fullscreen', handler);
  },
});
