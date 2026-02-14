import React, { useState, useEffect } from 'react'
import { FaParking, FaSignOutAlt, FaChartBar, FaHistory, FaCashRegister, FaDoorOpen } from 'react-icons/fa'
import styles from '../estilos/admin.module.css'

// --- IMPORTACIONES DE COMPONENTES ---
import IngresoParqueadero from '../componentes/IngresoParqueadero'
import SalidaParqueadero from '../componentes/SalidaParqueadero'
import Dashboard from '../componentes/Dashboard'
import Historial from '../componentes/Historial'
import CierreTurno from '../componentes/CierreTurno'

export default function Parking({ sesion, turno, setTurno, onLogout }) {
  const [seccion, setSeccion] = useState('dashboard')
  const [baseInicial, setBaseInicial] = useState(50000)
  const [cargando, setCargando] = useState(false)

  // --- FUNCIÓN PARA ABRIR EL TURNO EN LA DB LOCAL (PUERTO 3002) ---
  const manejarAperturaTurno = async (e) => {
    e.preventDefault();
    setCargando(true);
    
    // Obtenemos el ID del usuario de forma robusta
    const u_id = sesion.id || sesion.usuario_id;

    try {
      console.log(`[Turno] Intentando abrir turno para usuario: ${u_id}`);
      
      const response = await fetch("http://127.0.0.1:3002/api/turnos/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: u_id,
          base_inicial: parseFloat(baseInicial)
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[Turno] Abierto exitosamente. ID: ${data.turno_id}`);
        // Actualizamos el estado global con el ID real de la base de datos
        setTurno({ 
          id: data.turno_id, 
          base_inicial: parseFloat(baseInicial) 
        });
        setSeccion('dashboard');
      } else {
        alert("Error al abrir turno: " + (data.error || "Error desconocido"));
      }
    } catch (err) {
      console.error("Error conexión portería:", err);
      alert("No se pudo conectar con el servidor local de portería (Puerto 3002).");
    } finally {
      setCargando(false);
    }
  };

  // --- RENDERIZADO DE SECCIONES ---
  const renderContenido = () => {
    if (!turno) return null;

    switch (seccion) {
      case 'dashboard':
        return <Dashboard sesion={sesion} turno={turno} />
      
      case 'ingreso':
        return <IngresoParqueadero turno_id={turno.id} />
      
      case 'salida':
        return <SalidaParqueadero turno_id={turno.id} />
      
      case 'historial':
        return <Historial turno_id={turno.id} />
      
      case 'cierre':
        // Pasamos el objeto turno completo para que tenga acceso al ID y la base
        return <CierreTurno sesion={sesion} turno={turno} onLogout={onLogout} />
      
      default:
        return <Dashboard sesion={sesion} turno={turno} />
    }
  }

  // --- VISTA 1: SI NO HAY TURNO ACTIVO (BLOQUEO DE SEGURIDAD) ---
  if (!turno) {
    return (
      <div className={styles.adminContainer} style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', height: '100vh', background: '#f1f5f9' }}>
        <div className={styles.formulario} style={{ maxWidth: '400px', textAlign: 'center', padding: '30px', background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <FaDoorOpen size={50} color="#2563eb" style={{ marginBottom: '15px' }} />
          <h2 style={{ marginBottom: '10px', color: '#1e293b' }}>Apertura de Turno</h2>
          <p style={{ color: '#64748b', marginBottom: '20px' }}>Hola <strong>{sesion.nombre}</strong>, ingresa el dinero base para iniciar la operación de hoy.</p>
          
          <form onSubmit={manejarAperturaTurno}>
            <label style={{ display: 'block', textAlign: 'left', fontWeight: 'bold', marginBottom: '8px', color: '#475569' }}>Base Inicial en Caja ($)</label>
            <input 
              type="number" 
              className={styles.inputField}
              value={baseInicial}
              onChange={(e) => setBaseInicial(e.target.value)}
              required
              min="0"
              style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem' }}
            />
            <button type="submit" className={styles.btnLogin} disabled={cargando} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
              {cargando ? "Iniciando Operación..." : "Abrir Caja y Turno"}
            </button>
          </form>
          
          <button onClick={onLogout} style={{ marginTop: '20px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%' }}>
            <FaSignOutAlt /> Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // --- VISTA 2: DASHBOARD OPERATIVO (CUANDO HAY TURNO) ---
  return (
    <div className={styles.adminContainer}>
      
      {/* SIDEBAR: Menú lateral de navegación */}
      <aside className={styles.sidebar}>
        <div className={styles.logoSidebar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
            <FaParking size={24} color="#3b82f6" />
            <h3 style={{ color: '#1e293b', margin: 0 }}>SmartParking</h3>
          </div>
          <p className={styles.cajeroActivo}>Cajero: {sesion.nombre}</p>
          <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', display: 'inline-block', marginTop: '5px' }}>
            TURNO ACTIVO: #{turno.id}
          </div>
        </div>

        <nav className={styles.menuNav}>
          <button 
            onClick={() => setSeccion('dashboard')}
            className={seccion === 'dashboard' ? styles.activo : ''}
          >
            <FaChartBar className={styles.icon} /> <span>Dashboard</span>
          </button>

          <button 
            onClick={() => setSeccion('ingreso')}
            className={seccion === 'ingreso' ? styles.activo : ''}
          >
            <FaParking className={styles.icon} /> <span>Ingreso</span>
          </button>

          <button 
            onClick={() => setSeccion('salida')}
            className={seccion === 'salida' ? styles.activo : ''}
          >
            <FaSignOutAlt className={styles.icon} /> <span>Salida</span>
          </button>

          <button 
            onClick={() => setSeccion('historial')}
            className={seccion === 'historial' ? styles.activo : ''}
          >
            <FaHistory className={styles.icon} /> <span>Historial</span>
          </button>

          <button 
            onClick={() => setSeccion('cierre')}
            className={seccion === 'cierre' ? styles.activo : ''}
          >
            <FaCashRegister className={styles.icon} /> <span>Cierre de Turno</span>
          </button>
        </nav>

        <div className={styles.footerSidebar}>
            <button onClick={onLogout} className={styles.btnCerrarSesion} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                <FaSignOutAlt /> Salir del Sistema
            </button>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main className={styles.contenido}>
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
           {renderContenido()}
        </div>
      </main>

    </div>
  )
}