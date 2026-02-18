/**
 * main/sync.js
 * Funciones para sincronizar datos con el servidor central y reporte en vivo.
 */

import axios from 'axios';
import bcrypt from 'bcrypt';
import { API_URL_CENTRAL, API_URL_MAESTRA } from './config.js';

// Sincroniza tarifas y usuarios desde el servidor maestro
export async function sincronizarDesdeCentral(db) {
    try {
        const resTarifas = await axios.get(`${API_URL_CENTRAL}/tarifas`, { timeout: 3000 });
        if (resTarifas.data) {
    const mapeo = {
        'moto': 'moto', 'motos': 'moto', 'motocicleta': 'moto',
        'liviano': 'liviano', 'livianos': 'liviano', 'carro': 'liviano', 'automovil': 'liviano',
        'otro': 'otros', 'otros': 'otros', 'pesado': 'otros'
    };

    const upd = db.prepare(`UPDATE categorias SET tarifa_minuto=?, tarifa_hora=?, capacidad_max=? WHERE id=?`);

    Object.keys(resTarifas.data).forEach(tipo => {
        const t = resTarifas.data[tipo];
        const idLocal = mapeo[tipo.toLowerCase()];
        if (idLocal) {
            upd.run(t.minuto || 0, t.hora || 0, t.capacidad || 100, idLocal);
        }
    });
}

        const resUsers = await axios.get(`${API_URL_CENTRAL}/usuarios`, { timeout: 3000 });
        if (Array.isArray(resUsers.data)) {
            const stmtUser = db.prepare(`INSERT OR REPLACE INTO usuarios (id, nombre, usuario, rol, password) VALUES (?, ?, ?, ?, ?)`);
            for (const u of resUsers.data) {
                let passwordFinal = u.password;
                if (!passwordFinal.startsWith('$2b$') && !passwordFinal.startsWith('$2a$')) {
                    passwordFinal = await bcrypt.hash(u.password, 10);
                }
                stmtUser.run(u.id, u.nombre, u.usuario, u.rol, passwordFinal);
            }
        }
        console.log("[SINCRO] ✓ Datos de central actualizados.");
    } catch (e) { 
        console.warn("[SINCRO] ⚠ Servidor central no disponible."); 
    }
}

// Envía la ocupación actual al tablero del administrador principal
export async function enviarEstadoLiveAlMaestro(db) {
    try {
        const stats = db.prepare(`SELECT 
            (SELECT COUNT(*) FROM registros WHERE estado = 'ACTIVO') as ocupacionTotal,
            (SELECT IFNULL(SUM(total_pagado), 0) FROM registros WHERE date(salida) = date('now','localtime')) as ingresosHoy`).get();
        
        const filas = db.prepare(`SELECT c.nombre, COUNT(r.id) as actual FROM categorias c 
                                   LEFT JOIN registros r ON c.id = r.categoria_id AND r.estado = 'ACTIVO' 
                                   GROUP BY c.id`).all();
        
        const detalle = {};
        filas.forEach(f => { detalle[f.nombre] = f.actual; });

        await axios.post(`${API_URL_MAESTRA}/actualizar-estado-patio`, {
            ingresos_hoy: stats.ingresosHoy || 0,
            ocupacion_total: stats.ocupacionTotal || 0,
            detalle_ocupacion: detalle
        });
    } catch (e) { /* Error silencioso */ }
}

// Limpieza de reservas que pasaron su tiempo límite
export async function expirarReservasVencidas(mysqlPool) {
    if (!mysqlPool) return;
    try {
        await mysqlPool.execute(`UPDATE reservas SET estado = 'expirada' WHERE estado = 'Pendiente' AND fecha_expiracion < NOW()`);
    } catch (err) { 
        console.error("[RESERVAS] Error al limpiar vencidas:", err.message); 
    }
}