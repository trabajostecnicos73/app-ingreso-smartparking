/**
 * main/database.js
 * Mantiene tu estructura pero limpia duplicados y asegura categorías oficiales.
 */
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import { MYSQL_CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function conectarMySQL() {
    try {
        const pool = mysql.createPool(MYSQL_CONFIG);
        await pool.getConnection();
        return pool;
    } catch (err) {
        console.error("[MYSQL] ✗ Error:", err.message);
        return null;
    }
}

export function initSQLite() {
    const dbPath = app.isPackaged
        ? path.join(app.getPath('userData'), 'parqueadero.sqlite')
        : path.resolve(__dirname, '..', 'parqueadero.sqlite'); 
    
    const db = new Database(dbPath);
    
    // Esquema de Tablas
    db.exec(`CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, usuario TEXT UNIQUE, password TEXT, rol TEXT, nombre TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS categorias (id TEXT PRIMARY KEY, nombre TEXT, tarifa_minuto REAL, tarifa_hora REAL, capacidad_max INTEGER DEFAULT 100, prefijo TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS turnos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id TEXT, hora_apertura DATETIME DEFAULT (datetime('now','localtime')), hora_cierre DATETIME, base_inicial REAL DEFAULT 50000, total_efectivo REAL DEFAULT 0, total_digital REAL DEFAULT 0, vehiculos_ingresados INTEGER DEFAULT 0, vehiculos_salidos INTEGER DEFAULT 0, estado TEXT DEFAULT 'ABIERTO')`);
    db.exec(`CREATE TABLE IF NOT EXISTS registros (id INTEGER PRIMARY KEY AUTOINCREMENT, placa TEXT NOT NULL, categoria_id TEXT, puesto TEXT, color TEXT, entrada DATETIME DEFAULT (datetime('now','localtime')), salida DATETIME, total_pagado REAL, metodo_pago TEXT, id_turno INTEGER, estado TEXT DEFAULT 'ACTIVO', estado_sincro INTEGER DEFAULT 0, id_reserva TEXT, puesto_reserva TEXT)`);
    
    // --- LIMPIEZA DE CATEGORÍAS ---
    // Definimos los IDs únicos permitidos (Case sensitive en SQLite por defecto)
    // Eliminamos cualquier registro que no esté en nuestra lista blanca o que sea un duplicado erróneo
    db.prepare(`DELETE FROM categorias WHERE id NOT IN ('moto', 'liviano', 'otros')`).run();

    // Inserción o actualización de las oficiales
    const ins = db.prepare("INSERT OR REPLACE INTO categorias (id, nombre, tarifa_minuto, tarifa_hora, capacidad_max, prefijo) VALUES (?,?,?,?,?,?)");
    ins.run('moto', 'Motos', 50, 3000, 50, 'M');
    ins.run('liviano', 'Livianos', 100, 5000, 30, 'L');
    ins.run('otros', 'Otros', 150, 7000, 10, 'X');

    console.log("[SQLITE] ✓ Base de datos inicializada y categorías limpias.");
    return db;
}