import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // Esto evita que Vite cambie al puerto 5174 si el 5173 está ocupado
    host: '127.0.0.1', // Forzamos IPv4 para asegurar compatibilidad con Electron
  }
})