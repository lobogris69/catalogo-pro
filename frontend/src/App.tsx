/**
 * CatalogPRO - Componente principal de la aplicación
 */

import React from 'react';
import './styles/App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1>🏥 CatalogPRO</h1>
          <p>Gestión de Catálogos Digitales para LOMHIFAR</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <section className="welcome">
            <h2>Bienvenido a CatalogPRO</h2>
            <p>
              Plataforma profesional para gestionar catálogos digitales de productos
              farmacéuticos y dispositivos médicos.
            </p>

            <div className="status-grid">
              <div className="status-card">
                <h3>✅ Frontend</h3>
                <p>React 18 + TypeScript</p>
                <p className="status-ok">Funcionando</p>
              </div>

              <div className="status-card">
                <h3>🔧 Backend</h3>
                <p>Node.js + Express</p>
                <p className="status-pending">Conectando...</p>
              </div>

              <div className="status-card">
                <h3>💾 Base de Datos</h3>
                <p>PostgreSQL 15</p>
                <p className="status-pending">Verificando...</p>
              </div>

              <div className="status-card">
                <h3>📱 PWA</h3>
                <p>Offline Ready</p>
                <p className="status-pending">Inicializando...</p>
              </div>
            </div>

            <section className="features">
              <h3>Características principales:</h3>
              <ul>
                <li>✅ Gestión centralizada de artículos</li>
                <li>✅ Catálogos personalizados por comercial</li>
                <li>✅ Modo offline/online automático</li>
                <li>✅ Generación de PDFs de pedidos</li>
                <li>✅ Versionado automático de catálogos</li>
                <li>✅ Auditoría completa</li>
                <li>✅ Interfaz optimizada para tablet</li>
              </ul>
            </section>

            <section className="next-steps">
              <h3>🚀 Próximos pasos:</h3>
              <ol>
                <li>Ejecutar Docker Compose: <code>docker-compose up -d</code></li>
                <li>Esperar a que todos los servicios arranquen (2-3 minutos)</li>
                <li>Ir a <code>http://localhost:3001/health</code> para verificar backend</li>
                <li>Implementar módulos de autenticación</li>
                <li>Desarrollar gestión de artículos y catálogos</li>
              </ol>
            </section>

            <section className="credentials">
              <h3>Credenciales de Prueba (seed.sql):</h3>
              <table className="credentials-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Contraseña</th>
                    <th>Rol</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>admin@lomhifar.com</td>
                    <td>admin123</td>
                    <td>admin</td>
                  </tr>
                  <tr>
                    <td>comercial1@lomhifar.com</td>
                    <td>sales123</td>
                    <td>sales</td>
                  </tr>
                  <tr>
                    <td>comercial2@lomhifar.com</td>
                    <td>sales123</td>
                    <td>sales</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>&copy; 2026 LOMHIFAR S.L. - Distribución de Productos Farmacéuticos</p>
          <p>CatalogPRO v1.0.0</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
