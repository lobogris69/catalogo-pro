/**
 * CatalogPRO - Backend API
 * Servidor Express principal - Preparado para Railway (Etapa 1)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Cargar variables de entorno
dotenv.config();

// ============================================================================
// CONFIGURACIÓN INICIAL
// ============================================================================

const app: Express = express();
const PORT = Number(process.env.PORT) || 3001;

// Crear pool de conexión a PostgreSQL.
// Railway provee DATABASE_URL automáticamente al enlazar el servicio Postgres.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Railway Postgres requiere SSL en conexiones externas; internas no.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined,
});

// ============================================================================
// MIDDLEWARES GLOBALES
// ============================================================================

app.use(helmet());

// CORS: en esta etapa permitimos todos los orígenes (aún no hay frontend
// desplegado). Se restringirá en la etapa del frontend.
app.use(cors({
  origin: (process.env.CORS_ORIGIN || '*').split(','),
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging básico
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

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'CatalogPRO Backend',
    status: 'OK',
    version: '1.0.0',
    message: 'Servidor en marcha. Etapa 1: backend vivo + base de datos.',
  });
});

app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT NOW()');
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

app.get('/api/info', (req: Request, res: Response) => {
  res.json({
    name: 'CatalogPRO Backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Comprobación de datos: cuántas tablas y usuarios hay (para verificar la BD)
app.get('/api/info/db', async (req: Request, res: Response) => {
  try {
    const tablas = await pool.query(
      "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
    );
    let usuarios = { rows: [{ n: 0 }] };
    try {
      usuarios = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    } catch (e) {
      // tabla users aún no existe
    }
    res.json({
      status: 'OK',
      tablas_publicas: tablas.rows[0].n,
      usuarios: usuarios.rows[0].n,
    });
  } catch (error) {
    res.status(503).json({ status: 'ERROR', error: (error as Error).message });
  }
});

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// PREPARACIÓN DE LA BASE DE DATOS (migraciones al arrancar)
// ============================================================================

/**
 * Espera a que la base de datos esté disponible.
 * Railway puede tardar unos segundos en levantar Postgres.
 */
async function esperarBaseDatos(maxIntentos = 15): Promise<boolean> {
  for (let i = 1; i <= maxIntentos; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Base de datos disponible');
      return true;
    } catch (e) {
      console.log(`⏳ Esperando base de datos... intento ${i}/${maxIntentos}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

/**
 * Ejecuta las migraciones SQL si las tablas aún no existen.
 * Idempotente: si ya está creada la estructura, no hace nada.
 */
async function prepararBaseDatos(): Promise<void> {
  try {
    // ¿Existe ya la tabla 'users'? Si existe, asumimos BD ya preparada.
    const check = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') AS existe"
    );
    if (check.rows[0].existe) {
      console.log('✅ Estructura de base de datos ya existe, no se recrea');
      return;
    }

    console.log('🔧 Creando estructura de base de datos...');
    const migDir = path.join(__dirname, 'db', 'migrations');
    const archivos = ['001_initial_schema.sql', '002_catalog_sharing.sql'];

    for (const archivo of archivos) {
      const ruta = path.join(migDir, archivo);
      if (fs.existsSync(ruta)) {
        const sql = fs.readFileSync(ruta, 'utf8');
        try {
          await pool.query(sql);
          console.log(`✅ Migración aplicada: ${archivo}`);
        } catch (e) {
          console.error(`⚠️ Aviso aplicando ${archivo}:`, (e as Error).message);
        }
      } else {
        console.log(`⏭ No encontrada migración ${archivo} (se omite)`);
      }
    }
    console.log('✅ Estructura de base de datos preparada');
  } catch (error) {
    console.error('⚠️ Error preparando base de datos:', (error as Error).message);
    // No tiramos el servidor: arranca igual y /health avisará si la BD falla.
  }
}

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

async function startServer() {
  // 1. Esperar a que la BD esté lista
  const bdOk = await esperarBaseDatos();
  if (!bdOk) {
    console.error('❌ La base de datos no respondió tras varios intentos.');
    console.error('   El servidor arrancará igual; revisa la variable DATABASE_URL.');
  } else {
    // 2. Preparar estructura (crear tablas si no existen)
    await prepararBaseDatos();
  }

  // 3. Arrancar el servidor (escuchando en 0.0.0.0 para Railway)
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`✅ Servidor CatalogPRO ejecutándose en puerto ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log('');
    console.log('Rutas disponibles:');
    console.log('  GET  /');
    console.log('  GET  /health');
    console.log('  GET  /api/info');
    console.log('  GET  /api/info/db');
    console.log('');
  });
}

export { app, pool };

if (require.main === module) {
  startServer();
}
