const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  copiarImagenPortapapeles: (dataUrl) => ipcRenderer.send('copiar-imagen-portapapeles', dataUrl),
  abrirWhatsapp: (url) => ipcRenderer.send('abrir-whatsapp', url)
})

console.log('✅ Preload script cargado correctamente')