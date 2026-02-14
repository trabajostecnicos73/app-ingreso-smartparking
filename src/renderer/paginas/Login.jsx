import { useNavigate } from "react-router-dom";
import styles from "../estilos/login.module.css";
import logo from "../assets/logo.png";
import { useState } from "react";

export default function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorLocal, setErrorLocal] = useState(""); // Para mostrar errores en pantalla sin alerts molestos

  const irAtras = () => {
    navigate(-1);
  };

  const irAlSistema = async (e) => {
    e.preventDefault();
    if (cargando) return;

    setCargando(true);
    setErrorLocal("");

    try {
      // CORRECCIÓN: La URL debe coincidir con el main.cjs (http://127.0.0.1:3002/api/login)
      const res = await fetch("http://127.0.0.1:3002/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena }),
      });

      // Verificamos que la respuesta sea JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new TypeError("El servidor no respondió con JSON. Verifica que la App de Ingreso (Puerto 3002) esté corriendo correctamente.");
      }

      const data = await res.json();

      if (res.ok) {
        onLoginSuccess(data); 
        navigate("/parking"); 
      } else {
        // Aquí capturamos errores como "Contraseña incorrecta" o "Acceso denegado (Guardia)"
        setErrorLocal(data.error || "Credenciales incorrectas");
      }
    } catch (error) {
      console.error("Error de conexión:", error.message);
      setErrorLocal("Error de conexión: No se detecta el servidor en el puerto 3002.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <img src={logo} alt="SmartParking Logo" className={styles.logo} />

      <form className={styles.form} onSubmit={irAlSistema}>
        <h2 style={{ textAlign: 'center', color: '#1e293b', marginBottom: '20px' }}>Ingreso Portería</h2>
        
        <input
          type="text"
          placeholder="Usuario"
          className={styles.input}
          value={usuario}
          autoComplete="username"
          onChange={(e) => setUsuario(e.target.value)}
          required
          disabled={cargando}
        />
        <input
          type="password"
          placeholder="Contraseña"
          className={styles.input}
          value={contrasena}
          autoComplete="current-password"
          onChange={(e) => setContrasena(e.target.value)}
          required
          disabled={cargando}
        />

        {errorLocal && (
          <p style={{ 
            color: "#ef4444", 
            fontSize: "0.85rem", 
            backgroundColor: "#fee2e2", 
            padding: "10px", 
            borderRadius: "5px",
            textAlign: "center"
          }}>
            {errorLocal}
          </p>
        )}

        <button type="submit" className={styles.loginButton} disabled={cargando}>
          {cargando ? "Validando..." : "Ingresar al Sistema"}
        </button>
      </form>

      <button className={styles.backButton} onClick={irAtras} disabled={cargando}>
        Atrás
      </button>
    </div>
  );
}