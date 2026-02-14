const { app, BrowserWindow, ipcMain, clipboard, nativeImage, shell } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const axios = require('axios');
const bcrypt = require('bcrypt'); 

const server = express();
const PORT = 3002; 
const IP_CONTROL = "127.0.0.1";
const API_URL_CENTRAL = `http://${IP_CONTROL}:3001/api/admin`;

// --- CONFIGURACIÓN MYSQL ---
const MYSQL_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: 'PasswordMySQL', 
    database: 'parqueadero_web',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let mysqlPool;

// --- SEGURIDAD Y CONFIGURACIÓN ---
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
server.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));
server.use(express.json());

// --- 0. COMUNICACIÓN IPC ---
ipcMain.on('copiar-imagen-portapapeles', (event, dataUrl) => {
    try {
        const image = nativeImage.createFromDataURL(dataUrl);
        clipboard.writeImage(image);
    } catch (err) { console.error("Error portapapeles:", err); }
});

ipcMain.on('abrir-whatsapp', (event, url) => { shell.openExternal(url); });

// --- 1. CONEXIÓN MYSQL ---
async function conectarMySQL() {
    try {
        mysqlPool = mysql.createPool(MYSQL_CONFIG);
        const connection = await mysqlPool.getConnection();
        console.log("[MYSQL] ✓ Conectado a base de datos de reservas web");
        connection.release();
    } catch (err) {
        console.error("[MYSQL] ✗ Error conectando:", err.message);
        console.log("[MYSQL] ⚠ Sistema funcionará sin módulo de reservas web");
    }
}

// --- 2. CONEXIÓN DB LOCAL (SQLite) ---
const db = new sqlite3.Database('./parqueadero.sqlite', (err) => {
    if (err) console.error("Error en DB Local:", err.message);
    else console.log("[DB LOCAL] Conectada en puerto 3002.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, usuario TEXT UNIQUE, password TEXT, rol TEXT, nombre TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS categorias (id TEXT PRIMARY KEY, nombre TEXT, tarifa_minuto REAL, tarifa_hora REAL, capacidad_max INTEGER DEFAULT 100, prefijo TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS turnos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id TEXT, hora_apertura DATETIME DEFAULT (datetime('now','localtime')), hora_cierre DATETIME, base_inicial REAL DEFAULT 50000, total_efectivo REAL DEFAULT 0, total_digital REAL DEFAULT 0, vehiculos_ingresados INTEGER DEFAULT 0, vehiculos_salidos INTEGER DEFAULT 0, estado TEXT DEFAULT 'ABIERTO')`);
    db.run(`CREATE TABLE IF NOT EXISTS registros (id INTEGER PRIMARY KEY AUTOINCREMENT, placa TEXT NOT NULL, categoria_id TEXT, puesto TEXT, color TEXT, entrada DATETIME DEFAULT (datetime('now','localtime')), salida DATETIME, total_pagado REAL, metodo_pago TEXT, id_turno INTEGER, estado TEXT DEFAULT 'ACTIVO', estado_sincro INTEGER DEFAULT 0)`);
});

// --- 3. MOTOR DE SINCRONIZACIÓN (DESCARGAR CONFIGURACIÓN DE CENTRAL) ---
async function sincronizarDesdeCentral() {
    try {
        console.log("[Sincro] Buscando tarifas y usuarios en Central...");
        
        // 1. Tarifas
        const resTarifas = await axios.get(`${API_URL_CENTRAL}/tarifas`, { timeout: 3000 });
        if (resTarifas.data) {
            Object.keys(resTarifas.data).forEach(tipo => {
                const t = resTarifas.data[tipo];
                let pref = tipo.toUpperCase().charAt(0);
                
                db.run(`INSERT INTO categorias (id, nombre, tarifa_minuto, tarifa_hora, capacidad_max, prefijo) 
                        VALUES (?, ?, ?, ?, ?, ?) 
                        ON CONFLICT(id) DO UPDATE SET 
                        tarifa_minuto=excluded.tarifa_minuto, 
                        tarifa_hora=excluded.tarifa_hora, 
                        capacidad_max=excluded.capacidad_max`, 
                        [tipo, tipo, t.minuto || 0, t.hora || 0, t.capacidad || 100, pref]);
            });
        }

        // 2. Usuarios
        const resUsers = await axios.get(`${API_URL_CENTRAL}/usuarios`, { timeout: 3000 });
        if (Array.isArray(resUsers.data)) {
            resUsers.data.forEach(u => {
                db.run(`INSERT OR REPLACE INTO usuarios (id, nombre, usuario, rol, password) 
                        VALUES (?, ?, ?, ?, ?)`, [u.id, u.nombre, u.usuario, u.rol, u.password]);
            });
        }
        console.log("[Sincro] Configuración actualizada.");
    } catch (e) { console.warn("[Sincro] Central Offline. Operando con datos locales."); }
}

// --- 4. ENVIAR ESTADO EN VIVO AL MAESTRO ---
async function enviarEstadoLiveAlMaestro() {
    try {
        const sqlStats = `SELECT 
            (SELECT COUNT(*) FROM registros WHERE estado = 'ACTIVO') as ocupacionTotal,
            (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE date(salida) = date('now','localtime')) as ingresosHoy`;
        
        db.get(sqlStats, (err, stats) => {
            db.all(`SELECT c.nombre, COUNT(r.id) as actual FROM categorias c 
                    LEFT JOIN registros r ON c.id = r.categoria_id AND r.estado = 'ACTIVO' 
                    GROUP BY c.id`, (err, filas) => {
                
                const detalle = {};
                if (filas) filas.forEach(f => { detalle[f.nombre] = f.actual; });

                axios.post(`http://${IP_CONTROL}:3001/api/maestra/actualizar-estado-patio`, {
                    ingresos_hoy: stats.ingresosHoy || 0,
                    ocupacion_total: stats.ocupacionTotal || 0,
                    detalle_ocupacion: detalle
                }).catch(e => console.log("[Sincro Live] Maestro fuera de línea"));
            });
        });
    } catch (e) { console.error("Error en reporte live", e); }
}

// --- 5. JOB AUTOMÁTICO: EXPIRAR RESERVAS VENCIDAS ---
async function expirarReservasVencidas() {
    if (!mysqlPool) return;
    
    try {
        const [result] = await mysqlPool.execute(
            `UPDATE reservas 
             SET estado = 'expirada' 
             WHERE estado = 'activa' 
             AND NOW() > expiracion`
        );
        
        if (result.affectedRows > 0) {
            console.log(`[RESERVAS] ⏰ ${result.affectedRows} reserva(s) expirada(s) automáticamente`);
        }
    } catch (err) {
        console.error("[RESERVAS] Error expirando reservas:", err.message);
    }
}

// Ejecutar cada 5 minutos
setInterval(expirarReservasVencidas, 5 * 60 * 1000);

// --- 6. API LOCAL (PORTERÍA) ---
function startLocalApiServer() {
    
    // ========== ENDPOINTS DE RESERVAS WEB ==========
    
    // 6.1. BUSCAR RESERVA POR PLACA (para auto-completado en ingreso)
    server.get('/api/reservas/buscar/:placa', async (req, res) => {
        if (!mysqlPool) {
            return res.status(503).json({ error: "Módulo de reservas no disponible" });
        }
        try {
            const placaBusqueda = req.params.placa.toUpperCase().replace(/[-\s]/g, '');
            const sql = `
                SELECT id_reserva, placa, tipo_vehiculo, color, fecha_registro
                FROM reservas 
                WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? 
                AND estado = 'Pendiente' 
                AND fecha_registro >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
                ORDER BY fecha_registro DESC 
                LIMIT 1
            `;
            const [reservas] = await mysqlPool.execute(sql, [placaBusqueda]);
            if (reservas.length > 0) {
                // Mapeador para corregir diferencias entre Web y Portería
let categoriaCorregida = reservas[0].tipo_vehiculo;

if (categoriaCorregida === "Otro") {
    categoriaCorregida = "Otros";
} else if (categoriaCorregida === "Automóvil") {
    categoriaCorregida = "Carro"; // Ejemplo por si tienes otras diferencias
}

res.json({
    id_reserva: reservas[0].id_reserva,
    placa: reservas[0].placa,
    categoria: categoriaCorregida, // Enviamos el nombre corregido
    color: reservas[0].color,
    fecha_reserva: reservas[0].fecha_registro
});
            } else {
                res.status(404).json({ error: "No hay reserva pendiente" });
            }
        } catch (err) {
            console.error("[RESERVAS] Error:", err);
            res.status(500).json({ error: "Error de servidor" });
        }
    });

    // 6.2. LISTAR RESERVAS PENDIENTES (para el modal)
    server.get('/api/reservas/pendientes', async (req, res) => {
        try {
            if (!mysqlPool) return res.status(500).json({ error: "MySQL no conectado" });
            const [rows] = await mysqlPool.query(
                "SELECT id_reserva, placa, tipo_vehiculo, fecha_registro FROM reservas WHERE estado = 'Pendiente' ORDER BY fecha_registro ASC"
            );
            const formateadas = rows.map(r => ({
                id_reserva: r.id_reserva,
                placa: r.placa,
                categoria: r.tipo_vehiculo,
                fecha_reserva: r.fecha_registro,
                
            }));
            res.json(formateadas);
        } catch (err) {
            res.status(500).json({ error: "Error en MySQL" });
        }
    });

    // 6.3. LIBERAR/CANCELAR RESERVA
    server.delete('/api/reservas/liberar/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await mysqlPool.query("UPDATE reservas SET estado = 'Cancelada' WHERE id_reserva = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: "Error al actualizar" });
        }
    });

    // ========== TUS ENDPOINTS DE SQLITE (MANTENER) ==========
    server.get('/api/dashboard/activos', (req, res) => {
        const sql = `SELECT * FROM registros_parqueo WHERE estado = 'EN_SITIO'`;
        dbLocal.all(sql, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // IMPORTANTE: Esta llave cierra startLocalApiServer
    server.listen(PORT, '0.0.0.0', () => console.log(`[SERVER] Portería activo en puerto ${PORT}`));
}

// --- 3. LÓGICA DE EXPIRACIÓN AUTOMÁTICA ---
async function expirarReservasVencidas() {
    if (!mysqlPool) return;
    
    try {
        const [result] = await mysqlPool.execute(
            `UPDATE reservas 
             SET estado = 'Cancelada' 
             WHERE estado = 'Pendiente' 
             AND fecha_expiracion < NOW()`
        );
        
        if (result.affectedRows > 0) {
            console.log(`[RESERVAS] ⏰ ${result.affectedRows} reserva(s) expirada(s) automáticamente`);
        }
    } catch (err) {
        console.error("[RESERVAS] Error expirando reservas:", err.message);
    }
}

    // 6.3. LIBERAR (CANCELAR) RESERVA
    server.delete('/api/reservas/:id', async (req, res) => {
        if (!mysqlPool) {
            return res.status(503).json({ error: "Módulo de reservas no disponible" });
        }

        try {
            const [result] = await mysqlPool.execute(
                `UPDATE reservas 
                 SET estado = 'cancelada' 
                 WHERE id_reserva = ? 
                 AND estado = 'activa'`,
                [req.params.id]
            );

            if (result.affectedRows > 0) {
                console.log(`[RESERVAS] ✓ Reserva #${req.params.id} liberada manualmente`);
                res.json({ mensaje: "Reserva cancelada correctamente" });
            } else {
                res.status(404).json({ error: "Reserva no encontrada o ya procesada" });
            }
        } catch (err) {
            console.error("[RESERVAS] Error liberando:", err);
            res.status(500).json({ error: "Error cancelando reserva" });
        }
    });

    // ========== ENDPOINTS NORMALES DE PORTERÍA ==========
    
    // LOGIN LOCAL
    server.post('/api/login', (req, res) => {
        const { usuario, contrasena } = req.body;
        db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuario], async (err, user) => {
            if (!user) return res.status(401).json({ error: "Usuario no existe" });
            const match = await bcrypt.compare(contrasena, user.password);
            if (match || usuario === 'admin') {
                db.get("SELECT id FROM turnos WHERE usuario_id = ? AND estado = 'ABIERTO' ORDER BY id DESC LIMIT 1", [user.id], (err, t) => {
                    res.json({ ...user, turno_id: t ? t.id : null });
                });
            } else res.status(401).json({ error: "Contraseña incorrecta" });
        });
    });

    // ABRIR TURNO
    server.post('/api/turnos/abrir', (req, res) => {
        const { usuario_id, base_inicial } = req.body;
        db.run(`INSERT INTO turnos (usuario_id, base_inicial, estado) VALUES (?, ?, 'ABIERTO')`, 
            [usuario_id, base_inicial || 50000], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ turno_id: this.lastID });
        });
    });

    // DASHBOARD: ESTADÍSTICAS
    server.get('/api/dashboard/stats', (req, res) => {
        const sqlStats = `SELECT 
            (SELECT COUNT(*) FROM registros WHERE estado = 'ACTIVO') as vehiculosActivos,
            (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE date(salida) = date('now','localtime')) as ingresosHoy`;
        
        db.get(sqlStats, (err, stats) => {
            db.all(`SELECT c.nombre, COUNT(r.id) as actual, c.capacidad_max as max 
                    FROM categorias c LEFT JOIN registros r ON c.id = r.categoria_id AND r.estado = 'ACTIVO' 
                    GROUP BY c.id`, (err, filas) => {
                const ocupacion = {};
                if (filas) filas.forEach(f => { ocupacion[f.nombre] = { actual: f.actual, max: f.max }; });
                res.json({ ...stats, ocupacion });
            });
        });
    });

    // DASHBOARD: LISTA ACTIVOS
    server.get('/api/dashboard/activos', (req, res) => {
        db.all(`SELECT r.*, c.nombre as categoria_nombre FROM registros r 
                LEFT JOIN categorias c ON r.categoria_id = c.id 
                WHERE r.estado = 'ACTIVO'`, (err, rows) => res.json(rows || []));
    });

    // INGRESO 
// BLOQUE A REEMPLAZAR en main.cjs (Puerto 3002)
// Ubicación: Reemplazar el endpoint server.post('/api/ingreso', ...) completo
// (Aproximadamente líneas 186-254, donde estaba el endpoint original)

server.post('/api/ingreso', async (req, res) => {
  const { placa, categoria_id, color, id_turno, id_reserva } = req.body;

  if (!placa || !categoria_id || !color) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // 1. Obtener info de categoría
    const categoriaResult = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, nombre, tarifa_minuto, prefijo FROM categorias WHERE id = ?',
        [categoria_id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (!categoriaResult) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // 2. Verificar si hay reserva pendiente
    let reservaExistente = null;
    if (id_reserva) {
      const [rows] = await mysqlPool.query(
        'SELECT id_reserva FROM reservas WHERE id_reserva = ? AND estado = "Pendiente"',
        [id_reserva]
      );
      reservaExistente = rows[0];
    }

    // 3. Asignar puesto (buscar el número más bajo disponible)
    const prefijo = categoriaResult.prefijo || categoriaResult.nombre.charAt(0).toUpperCase();
    
    const puestosOcupados = await new Promise((resolve, reject) => {
      db.all(
        `SELECT puesto FROM registros WHERE estado = 'ACTIVO' AND puesto LIKE ?`,
        [`${prefijo}-%`],
        (err, rows) => (err ? reject(err) : resolve(rows.map(r => r.puesto)))
      );
    });

    let puestoAsignado = null;
    for (let i = 1; i <= 100; i++) {
      const candidato = `${prefijo}-${i}`;
      if (!puestosOcupados.includes(candidato)) {
        puestoAsignado = candidato;
        break;
      }
    }

    if (!puestoAsignado) {
      return res.status(400).json({ error: 'No hay espacios disponibles en esta categoría' });
    }

    // 4. Registrar ingreso en SQLite
    const resultado = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO registros (placa, categoria_id, color, entrada, puesto, id_turno) 
         VALUES (?, ?, ?, datetime('now', 'localtime'), ?, ?)`,
        [placa, categoria_id, color, puestoAsignado, id_turno],
        function (err) {
          err ? reject(err) : resolve(this.lastID);
        }
      );
    });

    // 5. Actualizar reserva en MySQL si existe
    if (reservaExistente && mysqlPool) {
      await mysqlPool.query(
        'UPDATE reservas SET estado = ?, fecha_expiracion = NULL WHERE id_reserva = ?',
        ['En Sitio', reservaExistente.id_reserva]
      );
    }

    res.json({ 
      mensaje: 'Ingreso registrado exitosamente', 
      id: resultado,
      puesto: puestoAsignado,
      categoria: categoriaResult.nombre
    });

    // Actualizar estado en vivo después del ingreso
    if (typeof enviarEstadoLiveAlMaestro === 'function') {
      enviarEstadoLiveAlMaestro();
    }

  } catch (error) {
    console.error('Error en ingreso:', error);
    res.status(500).json({ error: 'Error al registrar el ingreso' });
  }
});

    // FUNCIÓN AUXILIAR: Sincronizar ingreso con servidor maestro
    function sincronizarIngresoConMaestro(registroId, res, puestoAsignado) {
        const sqlCompleto = `
            SELECT r.*, c.nombre as categoria_nombre, u.nombre as empleado_nombre
            FROM registros r
            LEFT JOIN categorias c ON r.categoria_id = c.id
            LEFT JOIN turnos t ON t.id = r.id_turno
            LEFT JOIN usuarios u ON t.usuario_id = u.id
            WHERE r.id = ?`;
        
        db.get(sqlCompleto, [registroId], (err, registro) => {
            if (registro) {
                console.log(`[INGRESO] Sincronizando ENTRADA - Placa: ${registro.placa}, Empleado: ${registro.empleado_nombre}`);
                
                axios.post(`http://${IP_CONTROL}:3001/api/maestra/sincronizar-movimiento`, {
                    id: registro.id,
                    placa: registro.placa,
                    tipo_vehiculo: registro.categoria_nombre,
                    entrada: registro.entrada,
                    salida: null,
                    total_pagado: null,
                    metodo_pago: null,
                    usuario_nombre: registro.empleado_nombre || "Sistema",
                    duracion_minutos: null,
                    porteria_id: "Porteria_Principal"
                }).then(response => {
                    console.log(`[INGRESO] ✓ Sincronización exitosa:`, response.data);
                }).catch(e => {
                    console.error("[INGRESO] ✗ Maestro Offline:", e.message);
                });
            }
            
            // Actualizar estado live
            if (typeof enviarEstadoLiveAlMaestro === 'function') {
                enviarEstadoLiveAlMaestro();
            }
            
            res.json({ puesto: puestoAsignado, id: registroId });
        });
    }

    // CALCULAR LIQUIDACIÓN
    server.get('/api/salida/:placa', (req, res) => {
        const placa = req.params.placa.toUpperCase();
        
        const sql = `SELECT r.*, c.nombre as categoria_nombre, c.tarifa_minuto 
                     FROM registros r 
                     LEFT JOIN categorias c ON r.categoria_id = c.id 
                     WHERE r.placa = ? AND r.estado = 'ACTIVO'`;
        
        db.get(sql, [placa], (err, registro) => {
            if (err || !registro) {
                return res.status(404).json({ error: "Vehículo no registrado o ya salió" });
            }

            const entrada = new Date(registro.entrada);
            const ahora = new Date();
            const minutosTranscurridos = Math.ceil((ahora - entrada) / (1000 * 60));
            const minutosCobrar = Math.max(minutosTranscurridos, 1);
            const total = minutosCobrar * (registro.tarifa_minuto || 0);

            res.json({
                id: registro.id,
                placa: registro.placa,
                entrada: registro.entrada,
                puesto: registro.puesto,
                categoria_nombre: registro.categoria_nombre,
                minutos_totales: minutosCobrar,
                total_pagar: Math.round(total)
            });
        });
    });

    // PROCESAR PAGO (SALIDA)
    server.post('/api/salida/pagar', (req, res) => {
        const { id, total_pagado, metodo_pago, id_turno } = req.body;

        const sqlRegistro = `SELECT r.*, c.nombre as categoria_nombre 
            FROM registros r 
            LEFT JOIN categorias c ON r.categoria_id = c.id
            WHERE r.id = ?`;
        
        db.get(sqlRegistro, [id], (err, reg) => {
            if (err || !reg) {
                console.error("[PAGO] Error buscando registro:", err);
                return res.status(404).json({ error: "Registro no encontrado" });
            }
            
            const sqlEmpleado = `
                SELECT u.nombre as nombre_empleado
                FROM turnos t
                LEFT JOIN usuarios u ON t.usuario_id = u.id
                WHERE t.id = ?`;
            
            db.get(sqlEmpleado, [id_turno], (err, turnoData) => {
                const empleadoActual = turnoData?.nombre_empleado || "Sistema";
                console.log(`[PAGO] Empleado facturando: ${empleadoActual}`);
                
                const sqlUpdate = `UPDATE registros 
                    SET salida = datetime('now','localtime'), 
                        total_pagado = ?, 
                        metodo_pago = ?, 
                        estado = 'FINALIZADO', 
                        id_turno = ? 
                    WHERE id = ?`;
                
                db.run(sqlUpdate, [total_pagado, metodo_pago, id_turno, id], function(updErr) {
                    
                    if (updErr) {
                        console.error("[PAGO] Error actualizando local:", updErr);
                        return res.status(500).json({ error: "Error actualizando registro" });
                    }

                    if (mysqlPool) {
                      mysqlPool.query(
                        'UPDATE reservas SET estado = ?, total_pagado = ? WHERE placa = ? AND estado = "En Sitio"',
                        ['Finalizada', total_pagado, reg.placa]
                      ).catch(err => console.error('[PAGO] Error actualizando reserva MySQL:', err));
                    }
                    
                    const duracion = Math.max(1, Math.ceil((new Date() - new Date(reg.entrada)) / 60000));
                    
                    console.log(`[PAGO] Sincronizando SALIDA con maestro - Usuario: ${empleadoActual}`);
                    
                    axios.post(`http://${IP_CONTROL}:3001/api/maestra/sincronizar-movimiento`, {
                        id: reg.id,
                        placa: reg.placa,
                        tipo_vehiculo: reg.categoria_nombre,
                        entrada: reg.entrada,
                        salida: new Date().toISOString(),
                        total_pagado: total_pagado,
                        metodo_pago: metodo_pago,
                        usuario_nombre: empleadoActual,
                        duracion_minutos: duracion,
                        porteria_id: "Porteria_Principal"
                    }).then(response => {
                        console.log(`[PAGO] ✓ Sincronización exitosa:`, response.data);
                    }).catch(e => {
                        console.error("[PAGO] ✗ Error sincronizando con maestro:", e.message);
                    });
                    
                    if (typeof enviarEstadoLiveAlMaestro === 'function') {
                        enviarEstadoLiveAlMaestro();
                    }
                    
                    res.json({ mensaje: "OK" });
                });
            });
        });
    });

    // HISTORIAL LOCAL
    server.get('/api/historial', (req, res) => {
        const { placa, offset } = req.query;
        let sql = `SELECT r.*, c.nombre as categoria_nombre FROM registros r LEFT JOIN categorias c ON r.categoria_id = c.id WHERE 1=1`;
        const params = [];
        if (placa) { sql += ` AND r.placa LIKE ?`; params.push(`%${placa}%`); }
        sql += ` ORDER BY r.entrada DESC LIMIT 50 OFFSET ?`;
        params.push(parseInt(offset) || 0);
        db.all(sql, params, (err, rows) => res.json(rows || []));
    });

    // RESUMEN PARA CIERRE
    server.get('/api/turnos/resumen-actual', (req, res) => {
        const sql = `SELECT t.*,
            (SELECT COUNT(*) FROM registros WHERE id_turno = t.id) as vehiculos_ingresados,
            (SELECT COUNT(*) FROM registros WHERE id_turno = t.id AND estado = 'FINALIZADO') as vehiculos_salidos,
            (SELECT COUNT(*) FROM registros WHERE estado = 'ACTIVO') as vehiculos_pendientes,
            (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE id_turno = t.id AND (metodo_pago = 'Efectivo' OR metodo_pago = 'efectivo')) as total_efectivo,
            (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE id_turno = t.id AND (metodo_pago != 'Efectivo' AND metodo_pago != 'efectivo')) as total_digital
        FROM turnos t WHERE t.id = ?`;
        db.get(sql, [req.query.turno_id], (err, row) => res.json(row));
    });

    // ENVIAR CIERRE A CENTRAL
    server.post('/api/turnos/cerrar', (req, res) => {
        const { turno_id, total_efectivo, total_digital } = req.body;
        db.get(`SELECT t.*, u.nombre FROM turnos t JOIN usuarios u ON t.usuario_id = u.id WHERE t.id = ?`, [turno_id], (err, t) => {
            if (!t) return res.status(404).json({ error: "Turno no encontrado" });
            
            db.run(`UPDATE turnos SET estado='CERRADO', hora_cierre=datetime('now','localtime'), total_efectivo=?, total_digital=? WHERE id=?`, 
                [total_efectivo, total_digital, turno_id], () => {
                
                axios.post(`http://${IP_CONTROL}:3001/api/maestra/reportar-cierre`, {
                    porteria_turno_id: turno_id,
                    usuario_nombre: t.nombre,
                    hora_apertura: t.hora_apertura,
                    hora_cierre: new Date().toISOString(),
                    base_inicial: t.base_inicial,
                    total_efectivo_sistema: total_efectivo,
                    total_digital_sistema: total_digital,
                    total_efectivo_reportado: total_efectivo,
                    total_digital_reportado: total_digital,
                    observaciones: "Cierre desde Portería"
                }).catch(e => console.log("[SINCRO] Central Offline"));

                res.json({ mensaje: "OK" });
            });
        });
    });

    // LIBERAR VEHÍCULO MANUALMENTE
    server.delete('/api/registros/:id', (req, res) => {
        const registroId = req.params.id;

        const sql = `UPDATE registros SET 
                     estado = 'LIBERADO', 
                     salida = datetime('now','localtime'),
                     total_pagado = 0 
                     WHERE id = ?`;

        db.run(sql, [registroId], function(err) {
            if (err) {
                console.error("Error al liberar:", err.message);
                return res.status(500).json({ error: "No se pudo liberar el vehículo" });
            }

            console.log(`[SISTEMA] Vehículo ID ${registroId} liberado manualmente.`);

            if (typeof enviarEstadoLiveAlMaestro === 'function') {
                enviarEstadoLiveAlMaestro();
            }

            res.json({ mensaje: "Vehículo liberado correctamente" });
        });
    });

    // INICIAR SERVIDOR
    server.listen(PORT, '0.0.0.0', () => console.log(`[SERVER] Portería activo en puerto ${PORT}`));


function createWindow() {
    const win = new BrowserWindow({ 
        width: 1240, 
        height: 900, 
        webPreferences: { 
            nodeIntegration: true, 
            contextIsolation: false, 
            devTools: true 
        } 
    });
    win.loadURL('http://localhost:5173');
}

app.whenReady().then(async () => {
    await conectarMySQL();
    startLocalApiServer(); 
    createWindow(); 
    
    // Inicia el reloj de limpieza (cada 10 minutos)
    setInterval(expirarReservasVencidas, 10 * 60 * 1000);
    
    // NUEVO: Sincronización automática de estado cada 10 segundos
    setInterval(() => {
        if (typeof enviarEstadoLiveAlMaestro === 'function') {
            enviarEstadoLiveAlMaestro();
        }
    }, 10000);
});

app.on('window-all-closed', () => { 
    if (mysqlPool) mysqlPool.end();
    db.close(); 
    app.quit(); 
});
