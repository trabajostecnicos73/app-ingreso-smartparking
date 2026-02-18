/**
 * main.js (Raíz)
 * Punto de entrada principal que orquestra todos los módulos.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Importaciones de los módulos en la carpeta /main
import { initSQLite, conectarMySQL } from './main/database.js';
import { setupIPCHandlers } from './main/ipcHandlers.js';
import { startLocalApiServer } from './main/api.js';
import { sincronizarDesdeCentral, enviarEstadoLiveAlMaestro, expirarReservasVencidas } from './main/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let db = null;
let mysqlPool = null;

// Seguridad
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

function createWindow() {
    mainWindow = new BrowserWindow({ 
        width: 1240, 
        height: 900, 
        webPreferences: { 
            preload: path.join(__dirname, 'preload.cjs'), 
            contextIsolation: true, 
            nodeIntegration: false 
        } 
    });

    if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:5173'); // <-- cambia localhost por 127.0.0.1
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }
}

// Arranque de la aplicación
app.whenReady().then(async () => {
    try {
        // 1. Inicializar Bases de Datos
        db = initSQLite();
        mysqlPool = await conectarMySQL();

        // 2. Configurar Manejadores de Eventos e IPC
        setupIPCHandlers();

        // 3. Iniciar el Servidor de API local
        startLocalApiServer(db, mysqlPool);

        // 4. Sincronización Inicial con el Maestro
        await sincronizarDesdeCentral(db);

        // 5. Mostrar la Interfaz
        createWindow();

        // 6. Activar Tareas Programadas (Sync cada 10s, Expirar cada 10min)
        setInterval(() => expirarReservasVencidas(mysqlPool), 10 * 60 * 1000);
        setInterval(() => enviarEstadoLiveAlMaestro(db), 10000);

    } catch (error) {
        console.error("Error fatal en el inicio de la aplicación:", error);
    }
});

app.on('window-all-closed', () => { 
    if (mysqlPool) mysqlPool.end();
    if (db) db.close();
    app.quit(); 
});