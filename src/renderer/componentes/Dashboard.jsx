import React, { useState, useEffect } from "react";
import ModalReservas from "./ModalReservas";
import styles from "../estilos/dashboard.module.css";

// IMPORTACIÓN CORREGIDA: Se añadió MdSearch
import {
  MdRefresh,
  MdDirectionsCar,
  MdAttachMoney,
  MdTwoWheeler,
  MdDirectionsBus,
  MdDeleteForever,
  MdHistory,
  MdEventNote,
  MdSearch,
} from "react-icons/md";

export default function Dashboard() {
  const [stats, setStats] = useState({
    ocupacion: {},
    ingresosHoy: 0,
    vehiculosActivos: 0,
  });
  const [activos, setActivos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [mostrarReservas, setMostrarReservas] = useState(false);
  const API_BASE = "http://127.0.0.1:3002/api";

  const cargarDatos = async () => {
    try {
      const resStats = await fetch(`${API_BASE}/dashboard/stats`);
      if (!resStats.ok) throw new Error("Error en stats");
      const dataStats = await resStats.json();
      setStats(dataStats);

      const resActivos = await fetch(`${API_BASE}/dashboard/activos`);
      if (!resActivos.ok) throw new Error("Error en activos");
      const dataActivos = await resActivos.json();
      setActivos(Array.isArray(dataActivos) ? dataActivos : []);
    } catch (error) {
      console.error("Error cargando dashboard:", error);
    }
  };

  const liberarPuesto = async (id, placa) => {
    if (
      window.confirm(
        `¿Liberar manualmente el vehículo ${placa}? Esta acción NO registrará cobro.`,
      )
    ) {
      try {
        const resp = await fetch(`${API_BASE}/registros/${id}`, {
          method: "DELETE",
        });
        if (resp.ok) {
          cargarDatos();
        }
      } catch (error) {
        console.error("Error al liberar:", error);
      }
    }
  };

  useEffect(() => {
    let mounted = true; // Control de montaje

    const cargarSiMontado = async () => {
      if (mounted) await cargarDatos();
    };

    cargarSiMontado();
    const interval = setInterval(cargarSiMontado, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const calcularEstancia = (entrada) => {
    const diff = Math.floor((new Date() - new Date(entrada)) / (1000 * 60));
    const horas = Math.floor(diff / 60);
    const mins = diff % 60;
    return horas > 0 ? `${horas}h ${mins}m` : `${mins}m`;
  };

  const getIconoCategoria = (nombre) => {
    const n = nombre.toLowerCase();
    if (n.includes("moto")) return <MdTwoWheeler />;
    if (n.includes("liviano") || n.includes("carro"))
      return <MdDirectionsCar />;
    return <MdDirectionsBus />;
  };

  const activosFiltrados = activos.filter((v) =>
    v.placa.toLowerCase().includes(filtro.toLowerCase()),
  );

  return (
    <div className={styles.container}>
      <header className={styles.headerDashboard}>
        <div>
          <h2 className={styles.titulo}>
            <MdEventNote /> Panel de Control Operativo
          </h2>
          <p className={styles.subt}>
            Estado actual de la portería en tiempo real
          </p>
        </div>
        <div className={styles.relojHoy}>
          <MdHistory />{" "}
          {new Date().toLocaleDateString("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
      </header>

      <div className={styles.gridCards}>
        <div className={`${styles.card} ${styles.cardPrincipal}`}>
          <div className={styles.cardInfo}>
            <span className={styles.cardLabel}>VEHÍCULOS DENTRO</span>
            <h3 className={styles.cardValor}>{stats.vehiculosActivos || 0}</h3>
          </div>
          <div className={styles.iconBox}>
            <MdDirectionsCar />
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardExito}`}>
          <div className={styles.cardInfo}>
            <span className={styles.cardLabel}>RECAUDO TURNO</span>
            <h3 className={styles.cardValor}>
              $ {(stats.ingresosHoy || 0).toLocaleString("es-CO")}
            </h3>
          </div>
          <div className={styles.iconBox}>
            <MdAttachMoney />
          </div>
        </div>

        <div className={styles.contenedorCategorias}>
          {Object.entries(stats.ocupacion || {}).map(([nombre, info]) => {
            const actual = info.actual || 0;
            const max = info.max || 100;
            const porcentaje = (actual / max) * 100;

            return (
              <div key={nombre} className={styles.cardMini}>
                <div className={styles.miniHeader}>
                  <span className={styles.miniLabel}>{nombre}</span>
                  <span className={styles.miniIcon}>
                    {getIconoCategoria(nombre)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h3 className={styles.miniValor}>{actual}</h3>
                  <small style={{ color: "#64748b" }}>/ {max}</small>
                </div>
                <div className={styles.barraCapacidad}>
                  <div
                    className={styles.progreso}
                    style={{
                      width: `${Math.min(porcentaje, 100)}%`,
                      backgroundColor: porcentaje >= 90 ? "#ef4444" : "#3b82f6",
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.tablaContainer}>
        <div className={styles.tablaHeader}>
          <div className={styles.inputBusquedaWrapper}>
            <MdSearch className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Filtrar por placa..."
              className={styles.inputBusqueda}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value.toUpperCase())}
            />
          </div>
          <button className={styles.btnRefrescar} onClick={cargarDatos}>
            <MdRefresh /> Actualizar
          </button>

          <button
            className={styles.btnRefrescar}
            style={{
              backgroundColor: "#f39c12",
              marginLeft: "10px",
              color: "white",
            }}
            onClick={() => {
              console.log(
                "Botón presionado, estado anterior:",
                mostrarReservas,
              );
              setMostrarReservas(true);
            }}
          >
            <MdEventNote /> Reservas Web
          </button>
        </div>

        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Puesto</th>
              <th>Categoría</th>
              <th>Estancia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {activosFiltrados.map((v) => (
              <tr key={v.id}>
                <td>
                  <div className={styles.placaEstilo}>{v.placa}</div>
                </td>
                <td>
                  <span className={styles.badgePuesto}>{v.puesto}</span>
                </td>
                <td>{v.categoria_nombre}</td>
                <td>{calcularEstancia(v.entrada)}</td>
                <td>
                  <button
                    className={styles.btnLiberar}
                    onClick={() => liberarPuesto(v.id, v.placa)}
                  >
                    <MdDeleteForever /> Liberar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activosFiltrados.length === 0 && (
          <div className={styles.vacio}>
            <p>No hay vehículos activos.</p>
          </div>
        )}
      </div>
      {mostrarReservas && (
        <ModalReservas alCerrar={() => setMostrarReservas(false)} />
      )}
    </div>
  );
}
