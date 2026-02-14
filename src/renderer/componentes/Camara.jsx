import { useState, useRef, useEffect, useCallback } from 'react'
import Tesseract from 'tesseract.js'
import jsQR from 'jsqr'
import styles from '../estilos/ingreso.module.css'

export default function Camara({ onLecturaPlaca, activo }) {
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [camarasDisponibles, setCamarasDisponibles] = useState([])
  const [camaraSeleccionada, setCamaraSeleccionada] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [deteccionExitosa, setDeteccionExitosa] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)

  // 1. Cargar cámaras disponibles al iniciar (CORREGIDO PARA APAGAR EL LED)
  useEffect(() => {
    const listarCamaras = async () => {
      try {
        // Pedimos permiso y guardamos el stream temporalmente
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        setCamarasDisponibles(cams);
        
        if (cams.length > 0 && !camaraSeleccionada) {
          setCamaraSeleccionada(cams[0].deviceId);
        }

        // --- SOLUCIÓN AL ERROR: Apagamos el stream de prueba inmediatamente ---
        tempStream.getTracks().forEach(track => track.stop());
        
      } catch (err) {
        console.error('Error al listar cámaras:', err);
      }
    };
    listarCamaras();
  }, []);

  const dispararEfectoVisual = () => {
    setDeteccionExitosa(true)
    setTimeout(() => setDeteccionExitosa(false), 1000)
  }

  // 2. Procesador de imagen (QR y OCR)
  const procesarFrame = useCallback(async () => {
    if (!videoRef.current || procesando || !camaraActiva) return
    setProcesando(true)

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    
    if (videoRef.current.videoWidth > 0) {
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

      // Intento de lectura QR
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code) {
        dispararEfectoVisual()
        try {
          const objetoQR = JSON.parse(code.data)
          onLecturaPlaca(objetoQR.placa.toUpperCase())
        } catch (e) {
          onLecturaPlaca(code.data.toUpperCase())
        }
        setProcesando(false)
        return;
      }

      // Intento de lectura OCR (Placa)
      try {
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng')
        const placaDetectada = text.replace(/[^A-Z0-9]/g, '').toUpperCase()
        if (placaDetectada.length >= 5) {
          dispararEfectoVisual()
          onLecturaPlaca(placaDetectada)
        }
      } catch (err) {
        console.error('Error OCR:', err)
      }
    }
    setProcesando(false)
  }, [procesando, camaraActiva, onLecturaPlaca])

  // 3. Manejo del intervalo de escaneo
  useEffect(() => {
    if (camaraActiva && activo) {
      intervalRef.current = setInterval(procesarFrame, 3000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [camaraActiva, activo, procesarFrame])

  // 4. Funciones de encendido y apagado
  const activarCamara = async () => {
    try {
      const constraints = {
        video: { deviceId: camaraSeleccionada ? { exact: camaraSeleccionada } : undefined }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCamaraActiva(true)
    } catch (err) {
      console.error(err)
      alert('No se pudo acceder a la cámara seleccionada.')
    }
  }

  const desactivarCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null; // Limpiamos la referencia
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null; // Desvinculamos el video del hardware
    }
    setCamaraActiva(false)
  }

  return (
    <div className={styles.camaraBox}>
      <div className={styles.controlesSuperiores}>
        <select 
          value={camaraSeleccionada} 
          onChange={(e) => setCamaraSeleccionada(e.target.value)}
          className={styles.selectCamara}
        >
          {camarasDisponibles.map((cam, idx) => (
            <option key={cam.deviceId} value={cam.deviceId}>
              {cam.label || `Cámara ${idx + 1}`}
            </option>
          ))}
        </select>

        {!camaraActiva ? (
          <button onClick={activarCamara} className={styles.btnActivar}>Encender Cámara</button>
        ) : (
          <button onClick={desactivarCamara} className={styles.btnDesactivar}>Apagar Cámara</button>
        )}
      </div>

      <div className={`${styles.videoContainer} ${deteccionExitosa ? styles.bordeExito : ''}`}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          style={{ display: camaraActiva ? 'block' : 'none', width: '100%', borderRadius: '8px' }}
        />
        {!camaraActiva && (
          <div className={styles.placeholderCamara}>
            <p>Cámara Apagada</p>
          </div>
        )}
        {deteccionExitosa && <div className={styles.mensajeExito}>LECTURA CORRECTA</div>}
      </div>
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}