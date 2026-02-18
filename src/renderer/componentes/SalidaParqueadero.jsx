import React, { useState, useRef, useEffect } from "react";
import Camara from "./Camara";
import ModalCobro from "./ModalCobro"; 
import FacturaSalida from "./FacturaSalida";
import styles from "../estilos/salida.module.css";

// Importación de iconos profesionales
import { 
  MdDirectionsCar, 
  MdSearch, 
  MdAccessTime, 
  MdCalendarToday, 
  MdPlace, 
  MdPayments, 
  MdDeleteSweep, 
  MdInfoOutline,
  MdQrCodeScanner
} from "react-icons/md";

export default function SalidaParqueadero({ turno_id }) {
  const [busqueda, setBusqueda] = useState("");
  const [datosCobro, setDatosCobro] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [facturaFinal, setFacturaFinal] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorLocal, setErrorLocal] = useState("");

  const inputBusquedaRef = useRef(null);

  // Auto-foco inicial al input de placa
  useEffect(() => {
    if (!datosCobro && !mostrarModal && !facturaFinal) {
      inputBusquedaRef.current?.focus();
    }
  }, [datosCobro, mostrarModal, facturaFinal]);

  // Limpiar mensajes de error automáticamente tras 4 segundos
  useEffect(() => {
    if (errorLocal) {
      const timer = setTimeout(() => setErrorLocal(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [errorLocal]);

  // Formatea minutos a un formato legible por el humano (d, h, m)
  const calcularTiempoHumano = (minutosTotales) => {
    if (!minutosTotales || minutosTotales <= 0) return "1m (Mínimo)";
    const dias = Math.floor(minutosTotales / 1440);
    const horas = Math.floor((minutosTotales % 1440) / 60);
    const minutos = minutosTotales % 60;
    
    let partes = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0 || partes.length === 0) partes.push(`${minutos}m`);
    return partes.join(" ");
  };

  const consultarLiquidacion = async (valorEntrada) => {
    if (!valorEntrada || cargando) return;
    setErrorLocal("");
    
    const placaLimpia = valorEntrada.toString().toUpperCase().trim();
    const placaURL = encodeURIComponent(placaLimpia);

    setCargando(true);
    try {
      // Petición al servidor de portería (Puerto 3002)
      const resp = await fetch(`http://127.0.0.1:3002/api/vehiculo/${placaURL}`);
      
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("El servidor de portería no respondió correctamente.");
      }

      const data = await resp.json();
      
      if (resp.ok) {
        setDatosCobro(data);
      } else {
        setErrorLocal(data.error || "Vehículo no registrado o ya salió.");
        setDatosCobro(null);
        setTimeout(() => inputBusquedaRef.current?.focus(), 100);
      }
    } catch (error) {
      setErrorLocal("No hay conexión con la portería (Puerto 3002).");
    } finally { setCargando(false); }
  };

  const procesarPagoFinal = async (datosPago) => {
    if (!turno_id) {
      setErrorLocal("Error: No se detectó un turno activo.");
      return;
    }

    try {
      const resp = await fetch("http://127.0.0.1:3002/api/procesar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: datosCobro.id,
          total_pagado: datosCobro.total_pagar,
          metodo_pago: datosPago.metodo_pago,
          id_turno: turno_id 
        })
      });

      if (resp.ok) {
        // ALINEACIÓN CON FacturaSalida.jsx
        setFacturaFinal({
          placa: datosCobro.placa,
          tipoVehiculo: datosCobro.categoria_nombre || "Vehículo",
          entrada: datosCobro.entrada,
          minutos: datosCobro.minutos_totales, 
          total: datosCobro.total_pagar,
          metodo_pago: datosPago.metodo_pago,
          cambio: datosPago.cambio
        });

        setMostrarModal(false);
        setDatosCobro(null);
        setBusqueda("");
      } else {
        const errData = await resp.json();
        setErrorLocal(errData.error || "Error al registrar el pago.");
      }
    } catch (error) {
      setErrorLocal("Error crítico de comunicación con el servidor local.");
    }
  };

  return (
    <div className={styles.contenedorSalida}>
      <div className={styles.panelCamara}>
        <div className={styles.headerPanel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MdDirectionsCar size={24} color="#1e293b" />
            <h3>Control de Salida</h3>
          </div>
          <p>Liquidación de estancia por minutos</p>
        </div>

        <Camara 
          onLecturaPlaca={(p) => consultarLiquidacion(p)} 
          activo={!datosCobro && !mostrarModal && !facturaFinal} 
        />
        
        <div className={styles.busquedaManual}>
          <div className={styles.inputWrapper}>
            <MdSearch className={styles.searchIcon} />
            <input 
              ref={inputBusquedaRef}
              type="text" 
              placeholder="Digite la Placa..." 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && consultarLiquidacion(busqueda)}
            />
          </div>
          <button onClick={() => consultarLiquidacion(busqueda)} disabled={cargando}>
            {cargando ? "Procesando..." : "Liquidar"}
          </button>
        </div>
      </div>

      <div className={styles.panelLiquidacion}>
        {errorLocal && (
          <div className={styles.alertaError}>
            <MdInfoOutline size={20} /> {errorLocal}
          </div>
        )}

        {datosCobro ? (
          <div className={styles.cardCobro}>
            <div className={styles.encabezadoResumen}>
              <span className={styles.badge}>ESTADO DE CUENTA</span>
              <h2 className={styles.placaTitulo}>{datosCobro.placa}</h2>
            </div>

            <div className={styles.gridInfoDetalle}>
              <div className={styles.datoFila}>
                <label><MdCalendarToday /> Ingreso: </label>
                <strong>{new Date(datosCobro.entrada).toLocaleDateString()}</strong>
              </div>
              <div className={styles.datoFila}>
                <label><MdAccessTime /> Hora: </label>
                <strong>{new Date(datosCobro.entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </div>
              <div className={styles.datoFila}>
                <label><MdPlace /> Puesto: </label>
                <strong>{datosCobro.puesto || "N/A"}</strong>
              </div>
              <div className={styles.datoFilaDestacada}>
                <label><MdAccessTime /> TIEMPO:</label>
                <span>{calcularTiempoHumano(datosCobro.minutos_totales)}</span>
              </div>
            </div>

            <div className={styles.totalCaja}>
              <span className={styles.totalLabel}>TOTAL A COBRAR</span>
              <h1 className={styles.totalValor}>$ {Number(datosCobro.total_pagar).toLocaleString('es-CO')}</h1>
              <small>Liquidado automáticamente por minuto</small>
            </div>

            <div className={styles.accionesCobro}>
              <button className={styles.btnPagar} onClick={() => setMostrarModal(true)}>
                <MdPayments /> PROCESAR PAGO
              </button>
              <button className={styles.btnAnular} onClick={() => { setDatosCobro(null); setBusqueda(""); }}>
                <MdDeleteSweep /> CANCELAR
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.esperandoCaja}>
            <div className={styles.animacionEscaner}>
               <MdQrCodeScanner size={60} color="#3b82f6" />
            </div>
            <p>Escanee o digite una placa para liquidar el cobro.</p>
          </div>
        )}
      </div>

      {mostrarModal && (
        <ModalCobro 
            datos={{...datosCobro, total: datosCobro.total_pagar}} 
            onConfirmar={procesarPagoFinal} 
            onCancelar={() => setMostrarModal(false)} 
        />
      )}

      {facturaFinal && (
        <FacturaSalida 
            datos={facturaFinal} 
            onFinalizar={() => { 
              setFacturaFinal(null); 
              inputBusquedaRef.current?.focus(); 
            }} 
        />
      )}
    </div>
  );
}