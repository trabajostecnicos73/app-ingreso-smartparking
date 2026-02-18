/**
 * main/ipcHandlers.js
 * Controla la comunicación entre el proceso de renderizado (React) y el sistema operativo.
 */

import { ipcMain, clipboard, nativeImage, shell } from 'electron';

export function setupIPCHandlers() {
    // Copiar imagen al portapapeles (Ticket)
    ipcMain.on('copiar-imagen-portapapeles', (event, dataUrl) => {
        try {
            const image = nativeImage.createFromDataURL(dataUrl);
            clipboard.writeImage(image);
        } catch (err) { console.error("Error portapapeles:", err); }
    });

    // Abrir enlaces externos (WhatsApp)
    ipcMain.on('abrir-whatsapp', (event, url) => { 
        shell.openExternal(url); 
    });
}