import React, { useState, useEffect } from "react";
import { 
  MdClose, 
  MdEventNote, 
  MdSync, 
  MdErrorOutline, 
  MdDirectionsCar, 
  MdDeleteForever 
} from "react-icons/md";
import styles from "../estilos/dashboard.module.css"; 

export default function ModalReservas({ alCerrar }) {
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);

  // Función para consultar las reservas activas
  const consultarReservas = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:3002/api/reservas/pendientes");
      if (!res.ok) throw new Error("No se pudo conectar con el servidor local");
      const data = await res.json();
      setReservas(data);
    } catch (err) {
      console.error("Error en Modal:", err);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const liberarReserva = async (id, placa) => {
    try {
      const res = await fetch(`http://127.0.0.1:3002/api/reservas/liberar/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setConfirmandoId(null);
        consultarReservas();
      } else {
        alert("Error al intentar liberar la reserva en el servidor.");
      }
    } catch (err) {
      console.error("Error al liberar:", err);
      alert("Hubo un fallo en la conexión al intentar liberar.");
    }
  };

  useEffect(() => {
    consultarReservas();
    // Sincronización automática cada 20 segundos
    const interval = setInterval(consultarReservas, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex',
      justifyContent: 'center', alignItems: 'center', zIndex: 99999,
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        backgroundColor: 'white', padding: '30px', borderRadius: '16px',
        width: '750px', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid #e2e8f0'
      }}>
        
        {/* Encabezado */}
        <div style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px' 
        }}>
          <h2 style={{ margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MdEventNote color="#f39c12" size={28} /> 
            Gestión de Reservas Web
          </h2>
          <button onClick={alCerrar} style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', cursor: 'pointer', padding: '8px' }}>
            <MdClose size={24} color="#64748b" />
          </button>
        </div>

        {/* Estados de Carga y Error */}
        {cargando && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <MdSync size={40} style={{ animation: 'spin 2s linear infinite', color: '#3b82f6' }} />
            <p style={{ color: '#64748b', marginTop: '10px' }}>Sincronizando con MySQL...</p>
          </div>
        )}

        {error && !cargando && (
          <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#fef2f2', borderRadius: '8px', color: '#b91c1c' }}>
            <MdErrorOutline size={32} />
            <p>{error}</p>
            <button onClick={consultarReservas} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
                Reintentar
            </button>
          </div>
        )}

        {/* Lista de Reservas */}
        {!cargando && !error && reservas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            <MdDirectionsCar size={48} style={{ opacity: 0.3 }} />
            <p>No hay reservas activas en este momento.</p>
          </div>
        )}

        {!cargando && !error && reservas.length > 0 && (
          <table className={styles.tabla}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th>Placa</th>
                <th>Categoría</th>
                <th>Hora</th>
                <th style={{ textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map(r => (
                <tr key={r.id_reserva}>
                  <td><div className={styles.placaEstilo}>{r.placa}</div></td>
                  <td>{r.tipo_vehiculo}</td>
                  <td>{new Date(r.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td style={{ textAlign: 'center' }}>
                    {confirmandoId === r.id_reserva ? (
                      <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>¿Seguro?</span>
                        <button onClick={() => liberarReserva(r.id_reserva, r.placa)}
                          style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>
                          Sí
                        </button>
                        <button onClick={() => setConfirmandoId(null)}
                          style={{ backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>
                          No
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setConfirmandoId(r.id_reserva)}
                        style={{ 
                          backgroundColor: '#ef4444', color: 'white', border: 'none', 
                          borderRadius: '6px', padding: '6px', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center'
                        }}
                        title="Liberar espacio y cancelar reserva"
                      >
                        <MdDeleteForever size={20} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}