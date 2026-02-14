import React, { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image"; 
import styles from "../estilos/ingreso.module.css";
import { MdWhatsapp, MdPrint, MdPhoneIphone, MdQrCodeScanner } from "react-icons/md";

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function TicketIngreso({ datos }) {
  const [telefono, setTelefono] = useState("");
  const [errorWhatsApp, setErrorWhatsApp] = useState("");
  const ticketRef = useRef(null); 
  const inputTelefonoRef = useRef(null);
  const { placa, horaIngreso, ubicacion, tipoVehiculo, color } = datos;

  useEffect(() => {
    const timer = setTimeout(() => inputTelefonoRef.current?.focus(), 400);
    return () => clearTimeout(timer);
  }, []);

  const gestionarEnvioWhatsApp = async () => {
    if (!telefono || telefono.length < 10) {
      setErrorWhatsApp("Número inválido");
      return;
    }
    try {
      const dataUrl = await toPng(ticketRef.current, { backgroundColor: "#fff", pixelRatio: 2 });
      if (ipcRenderer) {
        ipcRenderer.send('copiar-imagen-portapapeles', dataUrl);
        const mensaje = `*SmartParking*%0AComprobante de Ingreso: *${placa}*%0A_Pega la imagen del ticket aquí._`;
        window.open(`https://wa.me/57${telefono}?text=${mensaje}`, "_blank");
      }
    } catch (err) { setErrorWhatsApp("Error imagen"); }
  };

  return (
    <div className={styles.contenedorTicketAcciones}>
      
      {/* TICKET COMPACTO (300px) */}
      <div ref={ticketRef} className={styles.ticketPapel}>
        <div className={styles.ticketHeader}>
          <h3 className={styles.logoEmpresa}>SMART PARKING</h3>
          <p className={styles.nit}>NIT: 123.456.789-0</p>
          <div className={styles.divisorDashed}></div>
        </div>

        <div className={styles.ticketBody}>
          <div className={styles.qrContainer}>
            <QRCodeSVG value={JSON.stringify({ placa, entrada: horaIngreso })} size={120} />
          </div>
          <h1 className={styles.placaGrande}>{placa}</h1>
          
          <div className={styles.detallesGrid}>
            <div className={styles.detalleItem}><span>PUESTO:</span> <strong>{ubicacion}</strong></div>
            <div className={styles.detalleItem}><span>INGRESO:</span> <span>{horaIngreso}</span></div>
            <div className={styles.detalleItem}><span>VEHÍCULO:</span> <span>{tipoVehiculo} ({color})</span></div>
          </div>
        </div>

        <div className={styles.ticketFooter}>
          <div className={styles.divisorDashed}></div>
          <p>Conserve este ticket para retirar su vehículo</p>
        </div>
      </div>

      {/* PANEL DE CONTROLES */}
      <div className={styles.controlesTicket}>
        <div className={styles.inputGrupo}>
          <MdPhoneIphone />
          <input 
            ref={inputTelefonoRef}
            type="tel" 
            placeholder="WhatsApp" 
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && gestionarEnvioWhatsApp()}
          />
        </div>
        
        <div className={styles.botonesAccion}>
          <button onClick={gestionarEnvioWhatsApp} className={styles.btnWsp}>
            <MdWhatsapp /> Enviar
          </button>
          <button onClick={() => window.print()} className={styles.btnPrn}>
            <MdPrint /> Imprimir
          </button>
        </div>
        {errorWhatsApp && <span className={styles.error}>{errorWhatsApp}</span>}
      </div>
    </div>
  );
}