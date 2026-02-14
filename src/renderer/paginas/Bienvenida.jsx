import { useNavigate } from "react-router-dom";
import styles from "../estilos/bienvenida.module.css"; // Import correcto para CSS Modules
import logo from "../assets/logo.png";

import iconParking from "../assets/parqueo.svg";

export default function Bienvenida() {
  const navigate = useNavigate();

  const irALogin = () => {
    navigate("/login");
  };

  return (
    <div className={styles.bienvenidaContainer}>
      <img src={logo} alt="SmartParking Logo" className={styles.logo} />
      <div className={styles.contenedorTexto}>
        <h1 className={styles.titulo}>SMARTPARKIN</h1>
        <h2 className={styles.subtitulo}>Gestión de Ventas</h2>
      </div>

      <div className={styles.iconosContainer}>
        <button className={styles.iconoBoton} onClick={irALogin}>
          <img src={iconParking} alt="Parking" />
        </button>
      </div>
    </div>
  );
}
