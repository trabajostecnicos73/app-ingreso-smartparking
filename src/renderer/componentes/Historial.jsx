import React, { useState, useEffect } from "react";
import styles from "../estilos/historial.module.css";
import TicketIngreso from "./TicketIngreso";
// Importación de iconos profesionales
import { 
  MdSearch, 
  MdDateRange, 
  MdDirectionsCar, 
  MdReceipt, 
  MdHistory,
  MdFilterList,
  MdClose
} from "react-icons/md";

export default function Historial() {
  const [registros, setRegistros] = useState([]);
  const [filtroPlaca, setFiltroPlaca] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [cargando, setCargando] = useState(false);
  
  // --- ESTADOS PARA PAGINACIÓN ---
  const [offset, setOffset] = useState(0);
  const [hayMas, setHayMas] = useState(true);
  const LIMITE = 50; 

  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);

  /**
   * Función para consultar el historial en el servidor de portería (3002)
   */
  const consultarHistorial = async (esNuevaBusqueda = true) => {
    setCargando(true);
    
    // Reiniciar offset si es búsqueda nueva
    const nuevoOffset = esNuevaBusqueda ? 0 : offset;

    try {
      const params = new URLSearchParams();
      if (filtroPlaca) params.append("placa", filtroPlaca.trim());
      if (fechaInicio) params.append("fechaInicio", fechaInicio);
      if (fechaFin) params.append("fechaFin", fechaFin);
      params.append("offset", nuevoOffset);

      const url = `http://127.0.0.1:3002/api/historial?${params.toString()}`;
      const resp = await fetch(url);
      
      if (!resp.ok) throw new Error("Error en el servidor");
      
      const data = await resp.json();

      if (esNuevaBusqueda) {
        setRegistros(data);
        setOffset(LIMITE);
      } else {
        setRegistros((prev) => [...prev, ...data]);
        setOffset((prev) => prev + LIMITE);
      }

      // Si vienen menos registros del límite, ya no hay más para cargar
      setHayMas(data.length === LIMITE);

    } catch (error) {
      console.error("Error al consultar historial:", error);
    } finally {
      setCargando(false);
    }
  };

  const reabrirTicket = (reg) => {
    setTicketSeleccionado({
      placa: reg.placa,
      horaIngreso: new Date(reg.entrada).toLocaleString(),
      ubicacion: reg.puesto,
      tipoVehiculo: reg.categoria_nombre,
      color: reg.color || "N/A"
    });
  };

  useEffect(() => {
    consultarHistorial(true);
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.headerHistorial}>
        <h2 className={styles.titulo}><MdHistory /> Historial de Movimientos</h2>
        <p className={styles.subt}>Consulta ingresos y salidas registradas en este equipo</p>
      </header>

      {/* BARRA DE FILTROS */}
      <div className={styles.filtrosBox}>
        <div className={styles.grupoFiltro}>
          <label><MdDirectionsCar /> Placa:</label>
          <input 
            type="text" 
            value={filtroPlaca} 
            onChange={(e) => setFiltroPlaca(e.target.value.toUpperCase())}
            placeholder="Ej: ABC123"
            onKeyDown={(e) => e.key === 'Enter' && consultarHistorial(true)}
          />
        </div>
        <div className={styles.grupoFiltro}>
          <label><MdDateRange /> Desde:</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div className={styles.grupoFiltro}>
          <label><MdDateRange /> Hasta:</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </div>
        <button className={styles.btnBuscar} onClick={() => consultarHistorial(true)} disabled={cargando}>
          {cargando && registros.length === 0 ? <MdSearch className={styles.animSpin} /> : <MdFilterList />} 
          {cargando && registros.length === 0 ? " Buscando..." : " Filtrar"}
        </button>
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className={styles.tablaWrapper}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Categoría</th>
              <th>Ingreso</th>
              <th>Salida</th>
              <th>Total Pagado</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {registros.length > 0 ? (
              registros.map((r) => (
                <tr key={r.id}>
                  <td className={styles.placaText}>{r.placa}</td>
                  <td>{r.categoria_nombre}</td>
                  <td>{new Date(r.entrada).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{r.salida ? new Date(r.salida).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "—"}</td>
                  <td className={styles.monto}>$ {Number(r.total_pagado || 0).toLocaleString('es-CO')}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles['status' + r.estado]}`}>
                      {r.estado}
                    </span>
                  </td>
                  <td>
                    <button 
                      className={styles.btnTicketAccion} 
                      onClick={() => reabrirTicket(r)}
                    >
                      <MdReceipt /> Ticket
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className={styles.noDatos}>
                  {cargando ? "Cargando registros..." : "No se encontraron movimientos con los filtros aplicados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* BOTÓN CARGAR MÁS */}
        {hayMas && registros.length > 0 && (
          <div className={styles.loadMoreContainer}>
            <button 
              className={styles.btnLoadMore} 
              onClick={() => consultarHistorial(false)} 
              disabled={cargando}
            >
              {cargando ? "Cargando..." : "Ver más registros ▼"}
            </button>
          </div>
        )}
      </div>

      {/* MODAL PARA TICKET HISTÓRICO */}
      {ticketSeleccionado && (
        <div className={styles.overlayTicket}>
          <div className={styles.modalContenedor}>
             <button 
               className={styles.btnCerrarModal} 
               onClick={() => setTicketSeleccionado(null)}
             >
               <MdClose size={20} /> Cerrar
             </button>
             <TicketIngreso datos={ticketSeleccionado} />
             <p className={styles.ayudaModal}>Información de respaldo del ingreso original.</p>
          </div>
        </div>
      )}
    </div>
  );
}