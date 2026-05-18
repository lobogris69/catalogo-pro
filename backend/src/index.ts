/**
 * CatalogPRO - Backend API
 * Servidor Express principal - Etapa 2 (login real)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { AuthService } from './services/AuthService';
import { verifyToken, AuthRequest } from './middleware/auth';

dotenv.config();

const app: Express = express();
const PORT = Number(process.env.PORT) || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined,
});

const authService = new AuthService(pool);

app.use(helmet());
// CORS: permite peticiones desde cualquier origen.
// En esta etapa (sin frontend desplegado aun) aceptamos todos los origenes.
// Se restringira al dominio real en la etapa del frontend.
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.options('*', cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'CatalogPRO Backend',
    status: 'OK',
    version: '1.0.0',
    message: 'Servidor en marcha. Etapa 2: login real.',
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

app.get('/api/info/db', async (req: Request, res: Response) => {
  try {
    const tablas = await pool.query(
      "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
    );
    let usuarios = { rows: [{ n: 0 }] };
    try {
      usuarios = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    } catch (e) {
      // tabla users aun no existe
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

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const resultado = await authService.login({ email, password });
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: (error as Error).message || 'Login failed',
    });
  }
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    const resultado = await authService.register({ email, password, name });
    res.status(201).json({ success: true, ...resultado });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message || 'Registration failed',
    });
  }
});

app.get('/api/auth/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const user = await authService.getUserById(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Error',
    });
  }
});

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

async function esperarBaseDatos(maxIntentos = 15): Promise<boolean> {
  for (let i = 1; i <= maxIntentos; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Base de datos disponible');
      return true;
    } catch (e) {
      console.log(`Esperando base de datos... intento ${i}/${maxIntentos}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

async function prepararBaseDatos(): Promise<void> {
  try {
    const check = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') AS existe"
    );
    if (check.rows[0].existe) {
      console.log('Estructura de base de datos ya existe, no se recrea');
      return;
    }
    console.log('Creando estructura de base de datos...');
    const migDir = path.join(__dirname, 'db', 'migrations');
    const archivos = ['001_initial_schema.sql', '002_catalog_sharing.sql'];
    for (const archivo of archivos) {
      const ruta = path.join(migDir, archivo);
      if (fs.existsSync(ruta)) {
        const sql = fs.readFileSync(ruta, 'utf8');
        try {
          await pool.query(sql);
          console.log(`Migracion aplicada: ${archivo}`);
        } catch (e) {
          console.error(`Aviso aplicando ${archivo}:`, (e as Error).message);
        }
      } else {
        console.log(`No encontrada migracion ${archivo} (se omite)`);
      }
    }
    console.log('Estructura de base de datos preparada');
  } catch (error) {
    console.error('Error preparando base de datos:', (error as Error).message);
  }
}

async function crearUsuariosIniciales(): Promise<void> {
  try {
    const usuarios = [
      { email: 'admin@lomhifar.com', password: 'admin123', name: 'Fernando Admin', role: 'admin' },
      { email: 'comercial1@lomhifar.com', password: 'sales123', name: 'Juan Garcia', role: 'sales' },
      { email: 'comercial2@lomhifar.com', password: 'sales123', name: 'Maria Lopez', role: 'sales' },
    ];
    for (const u of usuarios) {
      const existe = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (existe.rows.length === 0) {
        const hash = await bcrypt.hash(u.password, 10);
        await pool.query(
          'INSERT INTO users (email, password_hash, role, name, is_active) VALUES ($1, $2, $3, $4, TRUE)',
          [u.email, hash, u.role, u.name]
        );
        console.log(`Usuario creado: ${u.email}`);
      } else {
        console.log(`Usuario ya existe: ${u.email}`);
      }
    }
  } catch (error) {
    console.error('Error creando usuarios iniciales:', (error as Error).message);
  }
}

async function startServer() {
  const bdOk = await esperarBaseDatos();
  if (!bdOk) {
    console.error('La base de datos no respondio tras varios intentos.');
    console.error('El servidor arrancara igual; revisa la variable DATABASE_URL.');
  } else {
    await prepararBaseDatos();
    await crearUsuariosIniciales();
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`Servidor CatalogPRO ejecutandose en puerto ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log('');
    console.log('Rutas disponibles:');
    console.log('  GET  /');
    console.log('  GET  /health');
    console.log('  GET  /api/info');
    console.log('  GET  /api/info/db');
    console.log('  POST /api/auth/login');
    console.log('  POST /api/auth/register');
    console.log('  GET  /api/auth/me');
    console.log('');
  });
}

export { app, pool };

if (require.main === module) {
  startServer();
}
