import React, { useState, useEffect } from "react";
import styles from "../estilos/salida.module.css";
// Importación de iconos profesionales
import { 
  MdPayments, 
  MdAttachMoney, 
  MdCreditCard, 
  MdSmartphone, 
  MdCheckCircle, 
  MdCancel,
  MdInfoOutline 
} from "react-icons/md";

export default function ModalCobro({ datos, onConfirmar, onCancelar }) {
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [recibido, setRecibido] = useState("");
  const [cambio, setCambio] = useState(0);

  // Cálculo automático de vueltas/cambio
  useEffect(() => {
    if (metodoPago === "efectivo" && recibido >= datos.total) {
      setCambio(recibido - datos.total);
    } else {
      setCambio(0);
    }
  }, [recibido, metodoPago, datos.total]);

  const manejarConfirmacion = () => {
    onConfirmar({
      metodo_pago: metodoPago,
      // Si es digital, el recibido es el total exacto; si es efectivo, lo que digitó el cajero
      recibido: metodoPago === "efectivo" ? recibido : datos.total,
      cambio: cambio
    });
  };

  return (
    <div className={styles.overlayCobro}>
      <div className={styles.modalCobro}>
        <header className={styles.modalHeader}>
          <div className={styles.iconTitulo}>
            <MdPayments size={30} color="#1e293b" />
            <h2 className={styles.modalTitulo}>Procesar Pago</h2>
          </div>
          <p className={styles.modalSubt}>
            Liquidación de salida: <strong>{datos.placa}</strong>
          </p>
        </header>

        <div className={styles.seccionMetodo}>
          <label className={styles.labelInput}>Forma de Pago:</label>
          <div className={styles.selectWrapper}>
            <select 
              className={styles.selectMetodo} 
              value={metodoPago} 
              onChange={(e) => {
                setMetodoPago(e.target.value);
                setRecibido(""); 
              }}
            >
              <option value="efectivo">Efectivo</option>
              <option value="datafono">Tarjeta (Datáfono)</option>
              <option value="transferencia">Transferencia (Nequi/Daviplata)</option>
            </select>
          </div>
        </div>

        <div className={styles.cajaPrecios}>
          <div className={styles.precioItem}>
            <span><MdAttachMoney /> TOTAL A COBRAR</span>
            <span className={styles.montoTotal}>$ {datos.total.toLocaleString('es-CO')}</span>
          </div>

          {metodoPago === "efectivo" && (
            <>
              <div className={styles.precioItem}>
                <span><MdPayments /> DINERO RECIBIDO</span>
                <input 
                  type="number" 
                  className={styles.inputRecibido}
                  placeholder="0"
                  value={recibido}
                  onChange={(e) => setRecibido(Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()} 
                  autoFocus
                />
              </div>

              <div className={`${styles.precioItem} ${styles.areaCambio}`}>
                <span>CAMBIO (VUELTAS)</span>
                <span className={styles.montoCambio}>$ {cambio.toLocaleString('es-CO')}</span>
              </div>
            </>
          )}

          {/* MENSAJE DE ADVERTENCIA PARA PAGOS NO EFECTIVOS */}
          {metodoPago !== "efectivo" && (
            <div className={styles.infoDigital}>
              <MdInfoOutline size={20} />
              <p>
                Confirme que recibió el dinero en 
                <strong> {metodoPago === "datafono" ? "Datáfono" : "App Móvil"} </strong> 
                antes de continuar.
              </p>
            </div>
          )}
        </div>

        <div className={styles.botonesAccion}>
          <button 
            className={styles.btnFinalizar} 
            onClick={manejarConfirmacion}
            disabled={metodoPago === "efectivo" && (recibido < datos.total || recibido === 0)}
          >
            <MdCheckCircle size={20} /> CONFIRMAR Y FACTURAR
          </button>
          
          <button className={styles.btnVolverModal} onClick={onCancelar}>
            <MdCancel size={20} /> CANCELAR
          </button>
        </div>
      </div>
    </div>
  );
}