'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  command: (action, data) => ipcRenderer.send('command', action, data),
  events: callback => ipcRenderer.on('studio', (_, event) => callback(event)),
  complete: (source, line, column) => ipcRenderer.invoke('complete', source, line, column),
  capture: action => ipcRenderer.invoke('capture', action)
});
