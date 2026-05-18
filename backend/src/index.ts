/**
 * CatalogPRO - Backend API
 * Servidor Express principal - Etapa 3 (catalogos y articulos)
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
import { CatalogService } from './services/CatalogService';
import { ArticleService } from './services/ArticleService';
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
const catalogService = new CatalogService(pool);
const articleService = new ArticleService(pool);

app.use(helmet());
// CORS: permite peticiones desde cualquier origen.
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
    message: 'Servidor en marcha. Etapa 3: catalogos y articulos.',
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
    let articulos = { rows: [{ n: 0 }] };
    let catalogos = { rows: [{ n: 0 }] };
    try { usuarios = await pool.query('SELECT COUNT(*)::int AS n FROM users'); } catch (e) {}
    try { articulos = await pool.query('SELECT COUNT(*)::int AS n FROM articles'); } catch (e) {}
    try { catalogos = await pool.query('SELECT COUNT(*)::int AS n FROM catalogs'); } catch (e) {}
    res.json({
      status: 'OK',
      tablas_publicas: tablas.rows[0].n,
      usuarios: usuarios.rows[0].n,
      articulos: articulos.rows[0].n,
      catalogos: catalogos.rows[0].n,
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
    res.status(401).json({ success: false, error: (error as Error).message || 'Login failed' });
  }
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    const resultado = await authService.register({ email, password, name });
    res.status(201).json({ success: true, ...resultado });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message || 'Registration failed' });
  }
});

app.get('/api/auth/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const user = await authService.getUserById(req.user.id);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message || 'Error' });
  }
});

app.get('/api/articles', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { query, category, state, limit, offset } = req.query;
    const resultado = await articleService.getAllArticles({
      query: query ? String(query) : undefined,
      category: category ? String(category) : undefined,
      state: state ? String(state) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/articles/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const articulo = await articleService.getArticleById(Number(req.params.id));
    if (!articulo) { res.status(404).json({ success: false, error: 'Article not found' }); return; }
    res.json({ success: true, article: articulo });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/articles', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const articulo = await articleService.createArticle(req.body, req.user.id);
    res.status(201).json({ success: true, article: articulo });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/articles/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const articulo = await articleService.updateArticle(Number(req.params.id), req.body, req.user.id);
    res.json({ success: true, article: articulo });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/categories', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const categorias = await articleService.getCategories();
    res.json({ success: true, categories: categorias });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/catalogs', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { limit, offset } = req.query;
    const catalogos = await catalogService.getAllCatalogs(
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0
    );
    res.json({ success: true, catalogs: catalogos });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/catalogs/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const catalogo = await catalogService.getCatalogById(Number(req.params.id));
    if (!catalogo) { res.status(404).json({ success: false, error: 'Catalog not found' }); return; }
    const articulos = await catalogService.getCatalogArticles(Number(req.params.id));
    res.json({ success: true, catalog: catalogo, articles: articulos });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const catalogo = await catalogService.createCatalog(req.body, req.user.id);
    res.status(201).json({ success: true, catalog: catalogo });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/catalogs/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const catalogo = await catalogService.updateCatalog(Number(req.params.id), req.body, req.user.id);
    res.json({ success: true, catalog: catalogo });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs/:id/publish', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const catalogo = await catalogService.publishCatalog(Number(req.params.id), req.user.id);
    res.json({ success: true, catalog: catalogo });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs/:id/articles', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { article_id, display_order, sheet_number } = req.body;
    const resultado = await catalogService.addArticleToCatalog(
      Number(req.params.id),
      Number(article_id),
      Number(display_order) || 0,
      Number(sheet_number) || 1
    );
    res.status(201).json({ success: true, catalog_article: resultado });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.delete('/api/catalogs/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    await catalogService.deleteCatalog(Number(req.params.id), req.user.id);
    res.json({ success: true, message: 'Catalog deleted' });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
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

async function crearDatosEjemplo(): Promise<void> {
  try {
    const cuenta = await pool.query('SELECT COUNT(*)::int AS n FROM articles');
    if (cuenta.rows[0].n > 0) {
      console.log('Ya existen articulos, no se recrean datos de ejemplo');
      return;
    }

    console.log('Creando articulos de ejemplo...');
    const articulos = [
      ['Paracetamol 500mg', 'PAR-500', 'Analgesico y antipiretico, 20 comprimidos', 'Analgesicos', 'Sin prescripcion', ['Novedad', 'Top ventas'], 4.50, 1],
      ['Ibuprofeno 400mg', 'IBU-400', 'Antiinflamatorio no esteroideo, 30 comprimidos', 'Analgesicos', 'Sin prescripcion', ['Top ventas'], 6.99, 2],
      ['Aspirina 500mg', 'ASP-500', 'Analgesico y anticoagulante, 20 comprimidos', 'Analgesicos', 'Sin prescripcion', ['Clasico'], 3.99, 3],
      ['Amoxicilina 500mg', 'AMX-500', 'Antibiotico de amplio espectro, capsula x 10', 'Antibioticos', 'Con prescripcion', ['Necesita receta'], 12.50, 4],
      ['Vitamina C 500mg', 'VIT-C', 'Suplemento vitaminico, 60 comprimidos', 'Vitaminas', 'Complemento', ['Novedad'], 8.99, 5],
      ['Termometro Digital', 'TERM-DIG', 'Termometro de contacto infrarrojo', 'Dispositivos', 'Medicion', ['Novedad', 'Tecnologia'], 19.99, 6],
    ];
    for (const a of articulos) {
      await pool.query(
        `INSERT INTO articles (name, reference, description, category, subcategory, tags, state, pvpr, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)`,
        [a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]]
      );
    }
    console.log(`${articulos.length} articulos de ejemplo creados`);

    const admin = await pool.query("SELECT id FROM users WHERE email = 'admin@lomhifar.com'");
    const adminId = admin.rows.length > 0 ? admin.rows[0].id : null;
    if (adminId) {
      const cat = await pool.query(
        `INSERT INTO catalogs (name, created_by, is_draft, description)
         VALUES ($1, $2, FALSE, $3) RETURNING id`,
        ['Catalogo Maestro Q2 2026', adminId, 'Catalogo maestro con articulos de ejemplo']
      );
      const catId = cat.rows[0].id;
      const arts = await pool.query('SELECT id FROM articles ORDER BY display_order');
      let orden = 1;
      for (const row of arts.rows) {
        await pool.query(
          'INSERT INTO catalog_articles (catalog_id, article_id, display_order, sheet_number) VALUES ($1, $2, $3, 1)',
          [catId, row.id, orden++]
        );
      }
      console.log('Catalogo de ejemplo creado con sus articulos');
    }
  } catch (error) {
    console.error('Error creando datos de ejemplo:', (error as Error).message);
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
    await crearDatosEjemplo();
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`Servidor CatalogPRO ejecutandose en puerto ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log('');
    console.log('Rutas: /health /api/info/db /api/auth/* /api/articles /api/catalogs');
    console.log('');
  });
}

export { app, pool };

if (require.main === module) {
  startServer();
}
