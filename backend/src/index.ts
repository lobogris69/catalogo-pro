/**
 * CatalogPRO - Backend API
 * Servidor Express principal
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Cargar variables de entorno
dotenv.config();

// Tipos
interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

// ============================================================================
// CONFIGURACIÓN INICIAL
// ============================================================================

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Crear pool de conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============================================================================
// MIDDLEWARES GLOBALES
// ============================================================================

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging middleware (básico)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================================================
// RUTAS DE SALUD
// ============================================================================

/**
 * Health check
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Probar conexión a BD
    const result = await pool.query('SELECT NOW()');
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: (error as Error).message,
    });
  }
});

/**
 * Info del servidor
 */
app.get('/api/info', (req: Request, res: Response) => {
  res.json({
    name: 'CatalogPRO Backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// RUTAS DE PRUEBA (será reemplazado por rutas modulares)
// ============================================================================

/**
 * Login básico (será movido a AuthController)
 */
app.post('/api/auth/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Por ahora, respuesta genérica (será implementado en AuthService)
    res.json({
      message: 'Login endpoint - será implementado en Fase 1',
      email,
      note: 'Usa las credenciales de prueba en seed.sql',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Obtener artículos (será movido a ArticleController)
 */
app.get('/api/articles', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM articles LIMIT 10');
    res.json({
      data: result.rows,
      count: result.rows.length,
      message: 'Artículos obtenidos correctamente',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Obtener catálogos (será movido a CatalogController)
 */
app.get('/api/catalogs', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM catalogs');
    res.json({
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

/**
 * 404 - Ruta no encontrada
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

/**
 * Error handler global
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

async function startServer() {
  try {
    // Probar conexión a BD
    await pool.query('SELECT NOW()');
    console.log('✅ Base de datos conectada');

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`✅ Servidor CatalogPRO ejecutándose en puerto ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 API URL: http://localhost:${PORT}`);
      console.log(`💾 Database: ${process.env.DATABASE_URL?.split('@')[1]}`);
      console.log('');
      console.log('Rutas disponibles:');
      console.log('  GET  /health');
      console.log('  GET  /api/info');
      console.log('  POST /api/auth/login');
      console.log('  GET  /api/articles');
      console.log('  GET  /api/catalogs');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Exportar app y pool para testing
export { app, pool };

// Iniciar si no estamos en testing
if (require.main === module) {
  startServer();
}
