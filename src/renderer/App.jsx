import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import Bienvenida from './paginas/Bienvenida.jsx';
import Login from './paginas/Login.jsx';
import Parking from './paginas/parking.jsx';

function App() {
  // 1. Estado de Sesión (Datos del usuario: nombre, rol, etc.)
  const [sesion, setSesion] = useState(() => {
    const saved = localStorage.getItem("sesion_parking");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // 2. Estado del Turno (ID del turno activo y base inicial)
  const [turno, setTurno] = useState(() => {
    const savedTurno = localStorage.getItem("turno_activo");
    try {
      return savedTurno ? JSON.parse(savedTurno) : null;
    } catch (e) {
      return null;
    }
  });

  // Sincronización de Sesión con localStorage
  useEffect(() => {
    if (sesion) {
      localStorage.setItem("sesion_parking", JSON.stringify(sesion));
    } else {
      localStorage.removeItem("sesion_parking");
      localStorage.removeItem("turno_activo"); // Si se va la sesión, se va el turno
    }
  }, [sesion]);

  // Sincronización de Turno con localStorage
  useEffect(() => {
    if (turno) {
      localStorage.setItem("turno_activo", JSON.stringify(turno));
    } else {
      localStorage.removeItem("turno_activo");
    }
  }, [turno]);

  // Función para cerrar sesión completa (Limpia estados y storage)
  const cerrarSesion = () => {
    setSesion(null);
    setTurno(null);
    // Redirección forzada al inicio
    window.location.hash = "/";
  };

  return (
    <HashRouter>
      <Routes>
        {/* Pantalla inicial de bienvenida */}
        <Route path="/" element={<Bienvenida />} />

        {/* Login: Solo accesible si NO hay sesión */}
        <Route 
          path="/login" 
          element={
            !sesion ? (
              <Login onLoginSuccess={setSesion} />
            ) : (
              <Navigate to="/parking" replace />
            )
          } 
        />

        {/* Parking: Zona Protegida
            Pasamos 'sesion' para saber quién es, 
            'turno' para saber si puede operar,
            y 'setTurno' para que pueda abrir el turno desde adentro */}
        <Route 
          path="/parking/*" 
          element={
            sesion ? (
              <Parking 
                sesion={sesion} 
                turno={turno} 
                setTurno={setTurno} 
                onLogout={cerrarSesion} 
              />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />

        {/* Error 404 - Manejo de rutas inexistentes */}
        <Route path="*" element={
          <div style={{ 
            textAlign: 'center', 
            marginTop: '100px', 
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            color: '#1e293b'
          }}>
            <h1 style={{ fontSize: '3rem', color: '#cbd5e1' }}>404</h1>
            <h2>Sección no encontrada</h2>
            <p>Es posible que no tengas permisos o la ruta sea incorrecta.</p>
            <button 
              style={{ 
                padding: '12px 25px', 
                cursor: 'pointer', 
                backgroundColor: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                fontWeight: 'bold',
                marginTop: '20px'
              }}
              onClick={() => window.location.hash = '/'}
            >
              Regresar al Inicio
            </button>
          </div>
        } />
      </Routes>
    </HashRouter>
  );
}

export default App;