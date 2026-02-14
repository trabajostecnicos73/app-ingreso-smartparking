import { useState, useRef, useEffect } from "react";
import styles from "../estilos/ingreso.module.css";
import Camara from "./Camara";
import TicketIngreso from "./TicketIngreso";
// Iconos profesionales
import {
  MdDirectionsCar,
  MdQrCodeScanner,
  MdFactCheck,
  MdOutlineColorLens,
  MdErrorOutline,
  MdClose,
  MdCheckCircle, // Icono para reserva encontrada
} from "react-icons/md";

export default function IngresoParqueadero({ turno_id }) {
  const [placa, setPlaca] = useState("");
  const [placaManual, setPlacaManual] = useState("");
  const [tipoVehiculo, setTipoVehiculo] = useState("");
  const [color, setColor] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [datosTicket, setDatosTicket] = useState({});

  // --- NUEVO ESTADO PARA RESERVAS ---
  const [reservaEncontrada, setReservaEncontrada] = useState(null);

  const inputManualRef = useRef(null);

  // 1. Cargar categorías sincronizadas (SQLite)
  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:3002/api/dashboard/stats",
        );
        const data = await response.json();
        if (data.ocupacion) {
          const listaCats = Object.keys(data.ocupacion).map((nombre) => ({
            id: nombre,
            nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
          }));
          setCategorias(listaCats);
        }
      } catch (error) {
        console.error("Error cargando categorías:", error);
      }
    };
    cargarCategorias();
  }, []);

  // --- 2. LÓGICA DE BÚSQUEDA Y AUTO-COMPLETADO TOTAL ---
useEffect(() => {
  // Limpiamos la placa de guiones y espacios para buscarla en el servidor
  const placaLimpia = (placaManual || placa).replace(/[-\s]/g, '').toUpperCase();
  
  if (placaLimpia.length >= 6) {
    const buscarReserva = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:3002/api/reservas/buscar/${placaLimpia}`);
        
        if (res.ok) {
          const data = await res.json();
          setReservaEncontrada(data);
          
          // A. AUTO-COMPLETADO DE CATEGORÍA
          // Mapeamos lo que viene de la web (LIVIANOS) con lo que tienes local (Carros)
          const catLocal = categorias.find(c => {
            const local = c.nombre.toUpperCase();
            const remota = data.categoria.toUpperCase();
            return local === remota || 
                   (remota.includes("LIVIANO") && (local.includes("LIVIANO") || local.includes("CARRO"))) ||
                   (remota.includes("MOTO") && local.includes("MOTO"));
          });
          
          if (catLocal) setTipoVehiculo(catLocal.id);

          // B. AUTO-COMPLETADO DE COLOR
          if (data.color) {
            setColor(data.color.toUpperCase());
          }

          // C. FIJAR LA PLACA (Si se detectó por cámara o manual sin fijar)
          if (!placa) setPlaca(placaLimpia);

        } else {
          // Si no hay reserva, no limpiamos los campos por si el portero está escribiendo
          setReservaEncontrada(null);
        }
      } catch (err) {
        console.error("Error buscando reserva:", err);
      }
    };
    buscarReserva();
  } else {
    setReservaEncontrada(null);
  }
}, [placaManual, placa, categorias]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  useEffect(() => {
    if (!mostrarTicket) {
      inputManualRef.current?.focus();
    }
  }, [mostrarTicket]);

  const validarPlacaColombia = (p, categoria) => {
    const pLimpia = p.toUpperCase().replace(/\s/g, "").trim();
    const regexCarro = /^[A-Z]{3}[0-9]{3}$/;
    const regexMoto = /^[A-Z]{3}[0-9]{2}[A-Z]$/;

    if (categoria.toLowerCase().includes("moto"))
      return regexMoto.test(pLimpia);
    return regexCarro.test(pLimpia);
  };

  const generarIngreso = async () => {
    setErrorMsg("");

    if (!placa || !tipoVehiculo || !color) {
      setErrorMsg("⚠️ Complete todos los campos requeridos.");
      return;
    }

    const placaProcesada = placa.toUpperCase().replace(/\s/g, "").trim();

    if (!validarPlacaColombia(placaProcesada, tipoVehiculo)) {
      setErrorMsg(
        tipoVehiculo.toLowerCase().includes("moto")
          ? "❌ Formato Moto inválido (AAA11A)"
          : "❌ Formato Carro inválido (AAA111)",
      );
      return;
    }

    try {
      const response = await fetch("http://127.0.0.1:3002/api/ingreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: placaProcesada,
          categoria_id: tipoVehiculo,
          color: color.trim(),
          id_turno: turno_id,
          id_reserva: reservaEncontrada?.id_reserva || null, // Enviamos ID de reserva si existe
          puesto_reserva: reservaEncontrada?.numero_puesto || null
        }),
      });

      const resData = await response.json();

      if (response.ok) {
        const ahora = new Date();
        const horaIngreso = ahora.toLocaleString("es-CO", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        setDatosTicket({
          placa: placaProcesada,
          horaIngreso,
          ubicacion: resData.puesto,
          tipoVehiculo: categorias.find(c => c.id === tipoVehiculo)?.nombre || tipoVehiculo,
          color,
        });
        setMostrarTicket(true);

        // Reset
        setPlaca("");
        setPlacaManual("");
        setColor("");
        setTipoVehiculo("");
        setManualMode(false);
        setReservaEncontrada(null);
      } else {
        setErrorMsg(resData.error || "Error al registrar el vehículo");
      }
    } catch (error) {
      setErrorMsg("Error de conexión con la base de datos local.");
    }
  };

  const registrarManual = () => {
    const limpia = placaManual.toUpperCase().replace(/\s/g, "").trim();
    if (limpia.length < 6) {
      setErrorMsg("⚠️ La placa debe tener al menos 6 caracteres.");
      inputManualRef.current?.focus();
      return;
    }
    setPlaca(limpia);
    setPlacaManual("");
    setManualMode(true);
  };

  return (
    <div className={styles.contenedorIngreso}>
      <header className={styles.headerIngreso}>
        <h2 className={styles.titulo}>
          <MdQrCodeScanner /> Registro de Ingreso
        </h2>
        <p className={styles.subt}>Escanee la placa o ingrésela manualmente</p>
      </header>

      {errorMsg && (
        <div className={styles.alertaError}>
          <MdErrorOutline size={20} /> {errorMsg}
        </div>
      )}

      {/* --- AVISO DE RESERVA WEB --- */}
      {reservaEncontrada && (
        <div
          style={{
            backgroundColor: "#f39c12",
            color: "white",
            padding: "15px",
            borderRadius: "10px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "15px",
            animation: "pulse 2s infinite",
          }}
        >
          <MdCheckCircle size={30} />
          <div>
            <h4 style={{ margin: 0 }}>¡RESERVA WEB DETECTADA!</h4>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              Puesto asignado:{" "}
              <strong>{reservaEncontrada.numero_puesto}</strong> (
              {reservaEncontrada.categoria})
            </p>
          </div>
        </div>
      )}

      <Camara
        activo={!manualMode && !mostrarTicket}
        onLecturaPlaca={(placaDetectada) => {
          if (!manualMode) {
            setPlaca(placaDetectada.replace(/\s/g, "").toUpperCase());
          }
        }}
      />

      <div className={styles.formularioBox}>
        <label className={styles.label}>Búsqueda Manual:</label>
        <div className={styles.formRow}>
          <input
            ref={inputManualRef}
            type="text"
            value={placaManual}
            onChange={(e) =>
              setPlacaManual(e.target.value.toUpperCase().replace(/\s/g, ""))
            }
            placeholder="Ej: ABC123"
            maxLength={6}
            className={styles.input}
            onKeyDown={(e) => e.key === "Enter" && registrarManual()}
          />
          <button onClick={registrarManual} className={styles.btnFijar}>
            Asignar Placa
          </button>
        </div>
      </div>

      {placa && (
        <div className={styles.tablaBox}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>
                  <MdDirectionsCar /> PLACA
                </th>
                <th>
                  <MdFactCheck /> CATEGORÍA
                </th>
                <th>
                  <MdOutlineColorLens /> COLOR
                </th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.placaEnfoque}>{placa}</td>
                <td>
                  <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value)}
                    className={styles.select}
                  >
                    <option value="">Seleccione...</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Ej: Rojo"
                    className={styles.input}
                    onKeyDown={(e) => e.key === "Enter" && generarIngreso()}
                  />
                </td>
                <td>
                  <button
                    onClick={generarIngreso}
                    className={styles.btnGenerar}
                  >
                    Confirmar Ingreso
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {mostrarTicket && (
        <>
          <div
            className={styles.overlay}
            onClick={() => setMostrarTicket(false)}
          ></div>
          <div className={styles.ticketFlotante}>
            <button
              onClick={() => setMostrarTicket(false)}
              className={styles.btnCerrarX}
            >
              <MdClose size={24} />
            </button>
            <TicketIngreso datos={datosTicket} />
          </div>
        </>
      )}
    </div>
  );
}
