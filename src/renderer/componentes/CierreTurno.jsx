import React, { useState, useEffect } from "react";
// Importación de iconos profesionales consistentes con el resto de la app
import { 
  MdAccountBalanceWallet, 
  MdCreditCard, 
  MdDirectionsCar, 
  MdPrint, 
  MdAccountCircle, 
  MdExitToApp,
  MdTrendingUp,
  MdTrendingDown,
  MdInfoOutline
} from "react-icons/md";
import styles from "../estilos/cierre.module.css";

export default function CierreTurno({ sesion, turno, onLogout }) {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);

  const obtenerResumen = async () => {
    if (!turno?.id) {
      console.error("CierreTurno: No se detectó un ID de turno válido.");
      setCargando(false);
      return;
    }

    try {
      const resp = await fetch(`http://127.0.0.1:3002/api/turnos/resumen-actual?turno_id=${turno.id}`);
      
      if (resp.ok) {
        const data = await resp.json();
        setResumen(data);
      } else {
        console.warn("CierreTurno: El servidor no encontró el turno solicitado.");
        setResumen(null);
      }
    } catch (error) {
      console.error("CierreTurno: Error de conexión:", error);
      setResumen(null);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    obtenerResumen();
  }, [turno]);

  const handleFinalizarTurno = async () => {
    if (!resumen) return;

    const totalEfectivoCaja = resumen.base_inicial + (resumen.total_efectivo || 0);
    const totalDigital = (resumen.total_digital || 0);

    const confirmar = window.confirm(
      `¿Desea cerrar el turno #${resumen.id}?\n\n` +
      `Efectivo esperado en caja: $${totalEfectivoCaja.toLocaleString()}\n` +
      `Ventas digitales: $${totalDigital.toLocaleString()}`
    );

    if (confirmar) {
      try {
        const resp = await fetch("http://127.0.0.1:3002/api/turnos/cerrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            turno_id: resumen.id,
            total_efectivo: resumen.total_efectivo,
            total_digital: totalDigital
          })
        });

        if (resp.ok) {
          window.print(); 
          alert("Turno cerrado y arqueo enviado al sistema central. La sesión se cerrará ahora.");
          onLogout(); 
        }
      } catch (error) {
        alert("Error crítico al intentar cerrar el turno en el servidor.");
      }
    }
  };

  if (cargando) return (
    <div className={styles.loader}>
      <MdTrendingUp className={styles.spin} /> 
      <p>Calculando balance de cierre...</p>
    </div>
  );
  
  if (!resumen) return (
    <div className={styles.error}>
      <MdInfoOutline size={48} />
      <h3>No se detectó información del turno activo.</h3>
      <p>Reinicie la sesión o contacte soporte si el error persiste.</p>
      <button onClick={obtenerResumen} className={styles.btnReintentar}>Reintentar</button>
    </div>
  );

  const totalEfectivoCaja = resumen.base_inicial + (resumen.total_efectivo || 0);

  return (
    <div className={styles.containerCierre}>
      
      {/* --- PANEL DE CIERRE (INTERFAZ DE USUARIO) --- */}
      <div className={`${styles.glassCard} no-print`}>
        <header className={styles.headerCierre}>
          <div className={styles.userBadge}>
            <MdAccountCircle className={styles.userIcon} />
            <div>
              <h3>{sesion?.nombre || "Cajero"}</h3>
              <span>Operador Responsable</span>
            </div>
          </div>
          <div className={styles.chipTurno}>Turno #{resumen.id}</div>
        </header>

        <div className={styles.mainGrid}>
          <div className={`${styles.infoBox} ${styles.boxEfectivo}`}>
            <div className={styles.iconCircle}><MdAccountBalanceWallet /></div>
            <div className={styles.data}>
              <label>EFECTIVO ESPERADO EN CAJA</label>
              <h2>$ {totalEfectivoCaja.toLocaleString('es-CO')}</h2>
              <small>Base: ${resumen.base_inicial.toLocaleString()} + Ventas: ${(resumen.total_efectivo || 0).toLocaleString()}</small>
            </div>
          </div>

          <div className={styles.subGrid}>
            <div className={styles.miniBox}>
              <MdCreditCard className={styles.miniIcon} />
              <div><label>Ventas Digitales</label><p>$ {(resumen.total_digital || 0).toLocaleString()}</p></div>
            </div>
            <div className={styles.miniBox}>
              <MdDirectionsCar className={styles.miniIcon} />
              <div><label>Vehículos en Patio</label><p>{resumen.vehiculos_pendientes || 0} unidades</p></div>
            </div>
          </div>
        </div>

        <section className={styles.statsSection}>
          <h4><MdTrendingUp /> RESUMEN DE ACTIVIDAD</h4>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statVal}><MdTrendingUp /> {resumen.vehiculos_ingresados || 0}</span>
              <span className={styles.statLab}>Ingresos</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statVal}><MdTrendingDown /> {resumen.vehiculos_salidos || 0}</span>
              <span className={styles.statLab}>Salidas</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statVal}><MdDirectionsCar /> {resumen.vehiculos_pendientes || 0}</span>
              <span className={styles.statLab}>Pendientes</span>
            </div>
          </div>
        </section>

        <button className={styles.btnFinalizar} onClick={handleFinalizarTurno}>
          <MdPrint /> Cerrar Turno e Imprimir Reporte
        </button>
      </div>

      {/* --- REPORTE TÉRMICO (SOLO IMPRESIÓN) --- */}
      <div className="ticket-impresion">
        <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '11px' }}>
          <h2 style={{ margin: '5px 0' }}>SMART PARKING</h2>
          <p>*** CIERRE DE CAJA ***</p>
          <p>--------------------------------</p>
          <div style={{ textAlign: 'left' }}>
            <p>ID TURNO : #{resumen.id}</p>
            <p>OPERADOR : {sesion?.nombre}</p>
            <p>APERTURA : {new Date(resumen.hora_apertura).toLocaleString()}</p>
            <p>CIERRE   : {new Date().toLocaleString()}</p>
            <p>--------------------------------</p>
            <p>BASE INICIAL :  ${resumen.base_inicial.toLocaleString()}</p>
            <p>VENTAS EFECT.:  ${(resumen.total_efectivo || 0).toLocaleString()}</p>
            <p style={{ fontWeight: 'bold' }}>TOTAL CAJA  :  ${totalEfectivoCaja.toLocaleString()}</p>
            <p>--------------------------------</p>
            <p>VENTAS DIGIT.:  ${(resumen.total_digital || 0).toLocaleString()}</p>
            <p>--------------------------------</p>
            <p>BALANCE DE VEHICULOS:</p>
            <p>INGRESADOS : {resumen.vehiculos_ingresados || 0}</p>
            <p>SALIDOS    : {resumen.vehiculos_salidos || 0}</p>
            <p>EN PATIO   : {resumen.vehiculos_pendientes || 0}</p>
          </div>
          <p>--------------------------------</p>
          <br /><br />
          <p>__________________________</p>
          <p>Firma de Recibido</p>
        </div>
      </div>

      <style>{`
        @media screen {
          .ticket-impresion { display: none; }
        }
        @media print {
          body * { visibility: hidden; }
          .ticket-impresion, .ticket-impresion * { 
            visibility: visible; 
          }
          .ticket-impresion {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page { margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}