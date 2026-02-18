/**
 * main/api.js
 * Servidor Express unificado con toda la lógica de Portería, 
 * Reservas Web y Sincronización con Maestro.
 */
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { PORT, IP_CONTROL } from './config.js';
import { enviarEstadoLiveAlMaestro } from './sync.js';

export function startLocalApiServer(db, mysqlPool) {
    const server = express();
    
    server.use(cors());
    server.use(express.json());

    // --- MIDDLEWARE DE APOYO ---
    const getEmpleadoNombre = (id_turno) => {
        try {
            const turnoData = db.prepare(`
                SELECT u.nombre 
                FROM turnos t 
                JOIN usuarios u ON t.usuario_id = u.id 
                WHERE t.id = ?
            `).get(id_turno);
            return turnoData?.nombre || "Sistema";
        } catch { return "Sistema"; }
    };

    // ==========================================
    // 1. ENDPOINTS DE DASHBOARD Y ESTADÍSTICAS
    // ==========================================

    server.get('/api/dashboard/stats', (req, res) => {
        try {
            // Ocupación por categorías
            const categorias = db.prepare('SELECT id, nombre, capacidad_max FROM categorias').all();
            const ocupacion = {};

            categorias.forEach(cat => {
                const count = db.prepare("SELECT COUNT(*) as total FROM registros WHERE categoria_id = ? AND estado = 'ACTIVO'").get(cat.id);
                ocupacion[cat.nombre] = {
                    actual: count.total,
                    max: cat.capacidad_max
                };
            });

            // Ingresos de hoy
            const ingresos = db.prepare("SELECT SUM(total_pagado) as total FROM registros WHERE estado != 'ACTIVO' AND date(salida) = date('now', 'localtime')").get();

            // Vehículos activos totales
            const activosTotales = db.prepare("SELECT COUNT(*) as total FROM registros WHERE estado = 'ACTIVO'").get();

            res.json({
                ocupacion,
                ingresosHoy: ingresos.total || 0,
                vehiculosActivos: activosTotales.total || 0
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/dashboard/activos', (req, res) => {
        try {
            const rows = db.prepare(`
                SELECT r.*, c.nombre as categoria_nombre 
                FROM registros r
                JOIN categorias c ON r.categoria_id = c.id
                WHERE r.estado = 'ACTIVO'
                ORDER BY r.entrada DESC
            `).all();
            res.json(rows);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ==========================================
    // 2. ENDPOINTS DE RESERVAS WEB (MYSQL)
    // ==========================================

    server.get('/api/reservas/buscar/:placa', async (req, res) => {
        if (!mysqlPool) return res.status(503).json({ error: "Módulo de reservas no disponible" });
        try {
            const placaBusqueda = req.params.placa.toUpperCase().replace(/[-\s]/g, '');
            const sql = `
                SELECT id_reserva, placa, tipo_vehiculo, color, fecha_registro
                FROM reservas 
                WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? 
                AND estado = 'Pendiente' 
                AND fecha_registro >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
                ORDER BY fecha_registro DESC LIMIT 1
            `;
            const [reservas] = await mysqlPool.execute(sql, [placaBusqueda]);
            
            if (reservas.length > 0) {
                let cat = reservas[0].tipo_vehiculo;
                if (cat === "Otro") cat = "Otros";
                else if (cat === "Automóvil") cat = "Carro";

                res.json({
                    existe: true,
                    id_reserva: reservas[0].id_reserva,
                    placa: reservas[0].placa,
                    categoria: cat,
                    color: reservas[0].color,
                    fecha_reserva: reservas[0].fecha_registro
                });
            } else {
                res.status(404).json({ error: "No hay reserva pendiente" });
            }
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    server.get('/api/reservas/pendientes', async (req, res) => {
        if (!mysqlPool) return res.status(503).json({ error: "MySQL no conectado" });
        try {
            const [rows] = await mysqlPool.query("SELECT id_reserva, placa, tipo_vehiculo, fecha_registro FROM reservas WHERE estado = 'Pendiente' ORDER BY fecha_registro ASC");
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    server.delete('/api/reservas/liberar/:id', async (req, res) => {
        if (!mysqlPool) return res.status(503).json({ error: "MySQL no conectado" });
        try {
            await mysqlPool.query("UPDATE reservas SET estado = 'Cancelada' WHERE id_reserva = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ==========================================
    // 3. OPERACIONES DE INGRESO Y SALIDA
    // ==========================================

    server.post('/api/ingreso', (req, res) => {
        const { placa, categoria_id, color, id_turno, id_reserva, puesto_reserva } = req.body;
        try {
            const existe = db.prepare("SELECT id FROM registros WHERE placa = ? AND estado = 'ACTIVO'").get(placa.toUpperCase());
            if (existe) return res.status(400).json({ error: "El vehículo ya está dentro" });

            // Generación de puesto automático si no viene de reserva
            let puestoFinal = puesto_reserva;
            if (!puestoFinal) {
                const cat = db.prepare('SELECT prefijo FROM categorias WHERE id = ?').get(categoria_id);
                const ultimo = db.prepare(`SELECT MAX(CAST(SUBSTR(puesto, 2) AS INTEGER)) as max FROM registros WHERE categoria_id = ?`).get(categoria_id);
                puestoFinal = `${cat?.prefijo || 'P'}${(ultimo?.max || 0) + 1}`;
            }

            const stmt = db.prepare(`
                INSERT INTO registros (placa, categoria_id, puesto, color, id_turno, id_reserva, estado)
                VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')
            `);
            const info = stmt.run(placa.toUpperCase(), categoria_id, puestoFinal, color, id_turno, id_reserva || null);
            
            // Si hay reserva, actualizar MySQL
            if (mysqlPool && id_reserva) {
                mysqlPool.query('UPDATE reservas SET estado = "En Sitio" WHERE id_reserva = ?', [id_reserva]).catch(e => {});
            }

            // Sincronizar con Maestro
            const empleado = getEmpleadoNombre(id_turno);
            axios.post(`http://${IP_CONTROL}:3001/api/maestra/sincronizar-movimiento`, {
                id: info.lastInsertRowid,
                placa: placa.toUpperCase(),
                tipo_vehiculo: categoria_id,
                entrada: new Date().toISOString(),
                usuario_nombre: empleado,
                porteria_id: "Porteria_Local"
            }).catch(() => {});

            enviarEstadoLiveAlMaestro(db);
            res.json({ success: true, id: info.lastInsertRowid, puesto: puestoFinal });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/calcular/:id', (req, res) => {
        try {
            const reg = db.prepare(`
                SELECT r.*, c.tarifa_minuto, c.tarifa_hora 
                FROM registros r JOIN categorias c ON r.categoria_id = c.id 
                WHERE r.id = ?
            `).get(req.params.id);
            if (!reg) return res.status(404).json({ error: "No encontrado" });

            const entrada = new Date(reg.entrada);
            const ahora = new Date();
            const minutos = Math.max(1, Math.ceil((ahora - entrada) / 60000));
            const horas = Math.floor(minutos / 60);
            const minRestantes = minutos % 60;
            
            let total = minutos < 60 ? minutos * reg.tarifa_minuto : (horas * reg.tarifa_hora) + (minRestantes * reg.tarifa_minuto);

            res.json({ duracion_minutos: minutos, total: Math.round(total) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.post('/api/procesar-pago', (req, res) => {
        const { id, total_pagado, metodo_pago, id_turno } = req.body;
        try {
            const reg = db.prepare("SELECT * FROM registros WHERE id = ?").get(id);
            if (!reg) return res.status(404).json({ error: "Registro no existe" });

            db.prepare(`
                UPDATE registros 
                SET salida = datetime('now','localtime'), total_pagado = ?, metodo_pago = ?, estado = 'FINALIZADO', id_turno = ? 
                WHERE id = ?
            `).run(total_pagado, metodo_pago, id_turno, id);

            // Actualizar reserva en MySQL si aplica
            if (mysqlPool) {
                mysqlPool.query('UPDATE reservas SET estado = "Finalizada", total_pagado = ? WHERE placa = ? AND estado = "En Sitio"', [total_pagado, reg.placa]).catch(e => {});
            }

            // Sincronizar salida con Maestro
            const empleado = getEmpleadoNombre(id_turno);
            const duracion = Math.max(1, Math.ceil((new Date() - new Date(reg.entrada)) / 60000));
            
            axios.post(`http://${IP_CONTROL}:3001/api/maestra/sincronizar-movimiento`, {
                id: reg.id,
                placa: reg.placa,
                entrada: reg.entrada,
                salida: new Date().toISOString(),
                total_pagado,
                metodo_pago,
                usuario_nombre: empleado,
                duracion_minutos: duracion,
                porteria_id: "Porteria_Local"
            }).catch(() => {});

            enviarEstadoLiveAlMaestro(db);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ==========================================
    // 4. GESTIÓN DE TURNOS Y USUARIOS
    // ==========================================

    server.get('/api/usuarios', (req, res) => {
        const rows = db.prepare('SELECT id, usuario, rol, nombre FROM usuarios').all();
        res.json(rows);
    });

    // --- ENDPOINT RESUMEN ACTUAL (Corregido) ---
    server.get('/api/turnos/resumen-actual', (req, res) => {
        const { turno_id } = req.query;
        if (!turno_id) return res.status(400).json({ error: "Falta id_turno" });

        try {
            const turno = db.prepare('SELECT * FROM turnos WHERE id = ?').get(turno_id);
            if (!turno) return res.status(404).json({ error: "Turno no existe" });

            const efectivo = db.prepare("SELECT IFNULL(SUM(total_pagado), 0) as total FROM registros WHERE id_turno = ? AND LOWER(metodo_pago) = 'efectivo' AND estado = 'FINALIZADO'").get(turno_id);
            const digital = db.prepare("SELECT IFNULL(SUM(total_pagado), 0) as total FROM registros WHERE id_turno = ? AND LOWER(metodo_pago) != 'efectivo' AND estado = 'FINALIZADO'").get(turno_id);
            const ingresados = db.prepare("SELECT COUNT(*) as total FROM registros WHERE id_turno = ?").get(turno_id);
            const salidos = db.prepare("SELECT COUNT(*) as total FROM registros WHERE id_turno = ? AND estado = 'FINALIZADO'").get(turno_id);
            const pendientes = db.prepare("SELECT COUNT(*) as total FROM registros WHERE id_turno = ? AND estado = 'ACTIVO'").get(turno_id);
            
            res.json({
                ...turno,
                total_efectivo: efectivo.total,
                total_digital: digital.total,
                total_recaudado: efectivo.total + digital.total,
                vehiculos_ingresados: ingresados.total,
                vehiculos_salidos: salidos.total,
                vehiculos_pendientes: pendientes.total
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });


    server.post('/api/turnos/abrir', (req, res) => {
    try {
        const { usuario_id, base_inicial } = req.body;
        if (!usuario_id) return res.status(400).json({ error: "usuario_id requerido" });

        const info = db.prepare(`
            INSERT INTO turnos (usuario_id, base_inicial, estado) VALUES (?, ?, 'ABIERTO')
        `).run(usuario_id, base_inicial || 50000);

        res.json({ success: true, turno_id: info.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

    // --- ENDPOINT CIERRE DE TURNO (Corregido) ---
    server.post('/api/turnos/cerrar', async (req, res) => {
        const { turno_id } = req.body;
        try {
            const resumen = db.prepare(`
                SELECT 
                    (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE id_turno = ? AND LOWER(metodo_pago) = 'efectivo' AND estado = 'FINALIZADO') as efectivo,
                    (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE id_turno = ? AND LOWER(metodo_pago) != 'efectivo' AND estado = 'FINALIZADO') as digital,
                    (SELECT COUNT(*) FROM registros WHERE id_turno = ?) as ingresados,
(SELECT COUNT(*) FROM registros WHERE id_turno = ? AND estado = 'FINALIZADO') as salidos
            `).get(turno_id, turno_id, turno_id, turno_id);

            const ventasTotales = resumen.efectivo + resumen.digital;
            
            // Obtenemos la base para enviar el "Total en Caja" real al maestro
            const turnoInfo = db.prepare('SELECT base_inicial, hora_apertura FROM turnos WHERE id = ?').get(turno_id);
            const totalEnCaja = ventasTotales + (turnoInfo.base_inicial || 0);

            // Actualizar DB local
            db.prepare(`UPDATE turnos SET 
                hora_cierre = datetime('now','localtime'), 
                total_efectivo = ?, 
                total_digital = ?, 
                vehiculos_ingresados = ?, 
                vehiculos_salidos = ?, 
                estado = 'CERRADO' 
                WHERE id = ?`).run(resumen.efectivo, resumen.digital, resumen.ingresados, resumen.salidos, turno_id);

            // Reportar a Maestro con valores absolutos y claros
            const empleadoNombre = getEmpleadoNombre(turno_id);
            try {
                await axios.post(`http://${IP_CONTROL}:3001/api/maestra/reportar-cierre`, {
                    porteria_turno_id: turno_id,
                    usuario_nombre: empleadoNombre,
                    hora_apertura: turnoInfo.hora_apertura,
                    hora_cierre: new Date().toISOString(),
                    base_inicial: turnoInfo.base_inicial,
                    total_efectivo_sistema: resumen.efectivo,
                    total_digital_sistema: resumen.digital,
                    total_efectivo_reportado: resumen.efectivo,
                    total_digital_reportado: resumen.digital,
                    observaciones: "Cierre desde Portería Local"
                });
            } catch (errMaestro) {
                console.error("Error reportando a maestro:", errMaestro.message);
            }

            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- SALIDA DE VEHÍCULO (Validación de Total) ---
    server.post('/api/vehiculo/salida', async (req, res) => {
        const { id, metodo_pago, total, id_reserva } = req.body;
        
        // Validación: Evitar que se guarden totales negativos por error de UI
        const valorFinal = Math.max(0, total);

        try {
            db.prepare("UPDATE registros SET salida = datetime('now','localtime'), total_pagado = ?, metodo_pago = ?, estado = 'SALIO' WHERE id = ?")
              .run(valorFinal, metodo_pago, id);

            if (id_reserva && mysqlPool) {
                await mysqlPool.execute(
                    "UPDATE reservas SET estado = 'completada', fecha_salida = NOW(), pago_total = ? WHERE id_reserva = ?",
                    [valorFinal, id_reserva]
                );
            }

            enviarEstadoLiveAlMaestro(db);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ==========================================
    // 5. UTILIDADES Y OTROS
    // ==========================================

    server.get('/api/verificar-cupo/:categoria', (req, res) => {
        try {
            const cat = db.prepare('SELECT capacidad_max FROM categorias WHERE id = ?').get(req.params.categoria);
            if (!cat) return res.status(404).json({ error: "Categoría no existe" });
            const ocupados = db.prepare("SELECT COUNT(*) as total FROM registros WHERE categoria_id = ? AND estado = 'ACTIVO'").get(req.params.categoria);
            res.json({ capacidad_max: cat.capacidad_max, ocupados: ocupados.total, disponible: cat.capacidad_max - ocupados.total });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.delete('/api/registros/:id', (req, res) => {
        try {
            db.prepare("UPDATE registros SET estado = 'LIBERADO', salida = datetime('now','localtime'), total_pagado = 0 WHERE id = ?").run(req.params.id);
            enviarEstadoLiveAlMaestro(db);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/historial', (req, res) => {
        const { placa, inicio, fin, offset = 0, limit = 50 } = req.query;
        try {
            let query = `SELECT r.*, c.nombre as categoria_nombre FROM registros r LEFT JOIN categorias c ON r.categoria_id = c.id WHERE 1=1`;
            const params = [];
            if (placa) { query += ` AND r.placa LIKE ?`; params.push(`%${placa.toUpperCase()}%`); }
            if (inicio) { query += ` AND r.entrada >= ?`; params.push(`${inicio} 00:00:00`); }
            if (fin) { query += ` AND r.entrada <= ?`; params.push(`${fin} 23:59:59`); }
            query += ` ORDER BY r.entrada DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
            res.json(db.prepare(query).all(...params));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.post('/api/login', async (req, res) => {
        const { usuario, password } = req.body;
        try {
            const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
            if (!user) return res.status(401).json({ error: "No existe" });
            const match = await bcrypt.compare(password, user.password);
            if (match) res.json({ id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre });
            else res.status(401).json({ error: "Clave incorrecta" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/categorias', (req, res) => {
    try {
        const rows = db.prepare('SELECT id, nombre, tarifa_minuto, tarifa_hora, capacidad_max, prefijo FROM categorias').all();
        res.json(rows);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

server.get('/api/vehiculo/:placa', (req, res) => {
    try {
        const placa = decodeURIComponent(req.params.placa).toUpperCase().trim();
        const reg = db.prepare(`
            SELECT r.*, c.nombre as categoria_nombre, c.tarifa_minuto, c.tarifa_hora
            FROM registros r JOIN categorias c ON r.categoria_id = c.id
            WHERE r.placa = ? AND r.estado = 'ACTIVO'
        `).get(placa);

        if (!reg) return res.status(404).json({ error: "Vehículo no encontrado o ya salió." });

        const entrada = new Date(reg.entrada);
        const ahora = new Date();
        const minutos = Math.max(1, Math.ceil((ahora - entrada) / 60000));
        const horas = Math.floor(minutos / 60);
        const minRestantes = minutos % 60;
        const total = minutos < 60 
            ? minutos * reg.tarifa_minuto 
            : (horas * reg.tarifa_hora) + (minRestantes * reg.tarifa_minuto);

        res.json({ ...reg, minutos_totales: minutos, total_pagar: Math.round(total) });
        } catch (e) { res.status(500).json({ error: e.message }); }
     });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`[API Portería] ✓ Servidor unificado en puerto ${PORT}`);
    });
}