import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // Asegúrate de que App.jsx esté en la misma carpeta
import './index.css'        // Si no tienes index.css, puedes comentar esta línea

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)