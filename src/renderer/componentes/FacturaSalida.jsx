import React, { useRef, useState, useEffect } from "react";
import * as htmlToImage from 'html-to-image';
import styles from "../estilos/factura.module.css";
import { 
  MdPrint, 
  MdRefresh, 
  MdPhoneIphone, 
  MdCheckCircle, 
  MdReceiptLong, 
  MdAccessTime 
} from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa";

const ipcRenderer = window.electronAPI || null;

export default function FacturaSalida({ datos, onFinalizar }) {
  const facturaRef = useRef(null);
  const [telefonoManual, setTelefonoManual] = useState("");

  // Asegura que el scroll suba al mostrar la factura
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const enviarWhatsApp = async () => {
    if (!telefonoManual || telefonoManual.length < 10) {
      alert("Por favor ingrese un número de WhatsApp válido.");
      return;
    }

    try {
      const dataUrl = await htmlToImage.toPng(facturaRef.current, { 
        backgroundColor: '#fff',
        pixelRatio: 2 
      });
      
      if (ipcRenderer) {
      ipcRenderer.copiarImagenPortapapeles(dataUrl);
      const mensaje = `*SmartParking*%0AComprobante de pago placa: *${datos.placa}*%0A_Copia y pega la imagen adjunta._`;
      const url = `https://wa.me/57${telefonoManual}?text=${mensaje}`;
      ipcRenderer.abrirWhatsapp(url);
    }
    } catch (error) {
      console.error("Error al generar imagen:", error);
    }
  };

  return (
    <div className={styles.overlayFactura}>
      <div className={styles.contenedorScroll}>
        
        {/* COMPROBANTE COMPACTO */}
        <div ref={facturaRef} className={styles.facturaPapel}>
          <div className={styles.headerTicket}>
            <MdReceiptLong size={30} />
            <h2>SMART PARKING</h2>
            <p>Comprobante de Salida</p>
          </div>

          <div className={styles.cuerpoTicket}>
            <div className={styles.itemTicket}>
              <span>PLACA:</span>
              <strong className={styles.placa}>{datos.placa}</strong>
            </div>
            <div className={styles.itemTicket}>
              <span>TIPO:</span>
              <span>{datos.tipoVehiculo}</span>
            </div>
            <div className={styles.itemTicket}>
              <span>INGRESO:</span>
              <span>{new Date(datos.entrada).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className={styles.itemTicket}>
              <span>ESTANCIA:</span>
              <span>{datos.minutos} min</span>
            </div>
            
            <div className={styles.divisor}></div>
            
            <div className={styles.totalTicket}>
              <span>TOTAL PAGADO</span>
              <span>$ {Number(datos.total).toLocaleString('es-CO')}</span>
            </div>
            
            <div className={styles.itemTicket}>
              <span>MÉTODO:</span>
              <span>{datos.metodo_pago}</span>
            </div>
          </div>

          <div className={styles.footerTicket}>
            <MdCheckCircle color="#10b981" />
            <p>¡Vuelva pronto!</p>
          </div>
        </div>

        {/* CONTROLES (NO SE IMPRIMEN) */}
        <div className={`${styles.controlesFactura} no-print`}>
          <div className={styles.inputGrupo}>
            <MdPhoneIphone />
            <input 
              type="tel" 
              placeholder="WhatsApp Cliente" 
              value={telefonoManual}
              onChange={(e) => setTelefonoManual(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <div className={styles.gridAcciones}>
            <button className={styles.btnWhatsApp} onClick={enviarWhatsApp}>
              <FaWhatsapp /> Enviar
            </button>
            <button className={styles.btnImprimir} onClick={() => window.print()}>
              <MdPrint /> Imprimir
            </button>
          </div>

          <button className={styles.btnCerrarTodo} onClick={onFinalizar}>
            <MdRefresh /> NUEVA OPERACIÓN (CERRAR)
          </button>
        </div>

      </div>
    </div>
  );
}