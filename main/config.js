/**
 * main/config.js
 * Centraliza las constantes de conexión y configuración del sistema.
 * Modifica IP_CONTROL si el servidor maestro está en otra máquina.
 */

// Puerto del servidor Express local de la portería
export const PORT = 3002;

// IP del servidor Maestro (Cambiable según entorno)
export const IP_CONTROL = "127.0.0.1";

// URLs de las APIs del servidor Maestro/Central
export const API_URL_CENTRAL = `http://${IP_CONTROL}:3001/api/admin`;
export const API_URL_MAESTRA = `http://${IP_CONTROL}:3001/api/maestra`;

// Configuración de conexión a MySQL para el módulo de Reservas Web
export const MYSQL_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: 'PasswordMySQL', // Cambia esto por tu contraseña real de MySQL
    database: 'parqueadero_web',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};