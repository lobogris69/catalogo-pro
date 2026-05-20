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
import multer from 'multer';
import { AuthService } from './services/AuthService';
import { CatalogService } from './services/CatalogService';
import { ArticleService } from './services/ArticleService';
import { CatalogSheetDeleteService } from './services/CatalogSheetDeleteService';
import { ShareService } from './services/ShareService';
import { OrderService } from './services/OrderService';
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
const sheetDeleteService = new CatalogSheetDeleteService(pool);
const shareService = new ShareService(pool);
const orderService = new OrderService(pool);

app.use(helmet({ contentSecurityPolicy: false }));
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

const FRONTEND_DIR = path.join(__dirname, 'public');
app.use(express.static(FRONTEND_DIR));

// ============================================================================
// IMAGENES: carpeta de subidas en VOLUMEN PERSISTENTE
// ============================================================================
const UPLOADS_DIR = process.env.UPLOADS_DIR
  || (fs.existsSync('/app/data') ? '/app/data/uploads' : path.join(process.cwd(), 'uploads'));

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('Carpeta de imagenes creada:', UPLOADS_DIR);
  } else {
    console.log('Carpeta de imagenes:', UPLOADS_DIR);
  }
} catch (e) {
  console.error('Aviso creando carpeta de imagenes:', (e as Error).message);
}

app.use('/uploads', express.static(UPLOADS_DIR));

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const nombre = 'art_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext;
    cb(null, nombre);
  },
});
const subidaImagen = multer({
  storage: almacenamiento,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/.test((file.mimetype || '').toLowerCase());
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP'));
  },
});

// ============================================================================
// RUTAS DE SALUD
// ============================================================================

app.get('/', (req: Request, res: Response) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      name: 'CatalogPRO Backend',
      status: 'OK',
      version: '1.0.0',
      message: 'Backend en marcha (frontend no encontrado).',
    });
  }
});

app.get('/api', (req: Request, res: Response) => {
  res.json({ name: 'CatalogPRO Backend', status: 'OK', version: '1.0.0' });
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

// ============================================================================
// RUTAS DE AUTENTICACION
// ============================================================================

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

// ============================================================================
// RUTAS DE ARTICULOS (protegidas: requieren login)
// ============================================================================

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

// ============================================================================
// RUTAS DE CATALOGOS (protegidas: requieren login)
// ============================================================================

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

// ============================================================================
// MANEJO DE ERRORES
// ============================================================================


// ============================================================================
// RUTAS DE ELIMINAR LAMINAS (doble confirmacion, protegidas)
// ============================================================================

app.get('/api/catalogs/:id/sheets/:num', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const info = await sheetDeleteService.getSheetInfo(Number(req.params.id), Number(req.params.num));
    if (!info) { res.status(404).json({ success: false, error: 'Sheet not found' }); return; }
    res.json({ success: true, sheet: info });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs/:id/sheets/:num/delete-request', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const solicitud = await sheetDeleteService.requestSheetDeletion(
      Number(req.params.id), Number(req.params.num), req.user.id
    );
    res.status(201).json({ success: true, delete_request: solicitud });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs/delete-confirm', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { delete_request_id } = req.body;
    if (!delete_request_id) { res.status(400).json({ success: false, error: 'delete_request_id required' }); return; }
    const resultado = await sheetDeleteService.confirmSheetDeletion(delete_request_id, req.user.id);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/catalogs/delete-cancel', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { delete_request_id } = req.body;
    await sheetDeleteService.cancelDeletion(delete_request_id, req.user.id);
    res.json({ success: true, message: 'Delete request cancelled' });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/catalogs/delete-requests/pending', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const pendientes = await sheetDeleteService.getPendingRequests(req.user.id);
    res.json({ success: true, pending: pendientes });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});


// ============================================================================
// RUTAS DE COMPARTIR CATALOGO POR EMAIL (protegidas)
// ============================================================================

app.post('/api/catalogs/:id/share/email', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { recipient_email, recipient_name, sheet_numbers, message } = req.body;
    const resultado = await shareService.shareByEmail({
      catalog_id: Number(req.params.id),
      recipient_email,
      recipient_name: recipient_name || 'Cliente',
      sheet_numbers: Array.isArray(sheet_numbers) ? sheet_numbers : undefined,
      message,
    }, req.user.id);
    res.json({ success: true, share: resultado });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/catalogs/:id/share/history', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const historial = await shareService.getShareHistory(Number(req.params.id));
    res.json({ success: true, history: historial });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});


// ============================================================================
// RUTAS DE PEDIDOS (protegidas)
// ============================================================================

app.get('/api/orders', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { status, limit, offset } = req.query;
    const lim = limit ? Number(limit) : 50;
    const off = offset ? Number(offset) : 0;
    const est = status ? String(status) : undefined;
    let pedidos;
    if (req.user.role === 'admin') {
      pedidos = await orderService.getAllOrders(est, lim, off);
    } else {
      pedidos = await orderService.getUserOrders(req.user.id, est, lim, off);
    }
    res.json({ success: true, orders: pedidos });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/orders/summary', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const userId = req.user.role === 'admin' ? undefined : req.user.id;
    const resumen = await orderService.getOrderSummary(userId);
    res.json({ success: true, summary: resumen });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/orders/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const pedido = await orderService.getOrderById(Number(req.params.id));
    if (!pedido) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
    res.json({ success: true, order: pedido });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/orders', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { catalog_id, client_name, notes } = req.body;
    const pedido = await orderService.createOrder({ catalog_id, client_name, notes }, req.user.id);
    res.status(201).json({ success: true, order: pedido });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/orders/:id/items', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { article_id, quantity, composition_json, notes } = req.body;
    const item = await orderService.addOrderItem(Number(req.params.id), {
      article_id: Number(article_id),
      quantity: Number(quantity) || 1,
      composition_json: composition_json,
      notes: notes,
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/orders/:id/items/:itemId', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { quantity } = req.body;
    const item = await orderService.updateOrderItem(
      Number(req.params.id), Number(req.params.itemId), Number(quantity)
    );
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.delete('/api/orders/:id/items/:itemId', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    await orderService.removeOrderItem(Number(req.params.id), Number(req.params.itemId));
    res.json({ success: true, message: 'Item removed' });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/orders/:id/confirm', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const pedido = await orderService.confirmOrder(Number(req.params.id), req.user.id);
    res.json({ success: true, order: pedido });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/orders/:id/sent', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const pedido = await orderService.markOrderAsSent(Number(req.params.id), req.user.id);
    res.json({ success: true, order: pedido });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================
// RUTAS DEVOLUCIONES (returns) - parte de la Nota de visita
// ============================================================================

app.get('/api/orders/:id/returns', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const orderId = Number(req.params.id);
    const r = await pool.query(
      `SELECT rt.id, rt.order_id, rt.article_id, rt.quantity, rt.state, rt.action, rt.notes,
              rt.created_at, rt.updated_at,
              a.name, a.reference
       FROM returns rt
       LEFT JOIN articles a ON a.id = rt.article_id
       WHERE rt.order_id = $1
       ORDER BY rt.id ASC`,
      [orderId]
    );
    res.json({ success: true, returns: r.rows });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/orders/:id/returns', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const orderId = Number(req.params.id);
    const { article_id, quantity, state, action, notes } = req.body || {};
    if (!article_id || !quantity || !state || !action) {
      res.status(400).json({ success: false, error: 'Faltan campos obligatorios: article_id, quantity, state, action' });
      return;
    }
    const estadosValidos = ['caducado','defectuoso','confundido','no_rota','otro'];
    const accionesValidas = ['abonar','cambio_mismo','cambio_otra','solo_retirar'];
    if (!estadosValidos.includes(state)) {
      res.status(400).json({ success: false, error: 'Estado no valido' });
      return;
    }
    if (!accionesValidas.includes(action)) {
      res.status(400).json({ success: false, error: 'Accion no valida' });
      return;
    }
    const cant = Number(quantity);
    if (!cant || cant < 1) {
      res.status(400).json({ success: false, error: 'La cantidad debe ser mayor que 0' });
      return;
    }
    const chkOrder = await pool.query('SELECT id FROM orders WHERE id = $1', [orderId]);
    if (chkOrder.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Pedido no encontrado' });
      return;
    }
    const chkArt = await pool.query('SELECT id, name, reference FROM articles WHERE id = $1', [Number(article_id)]);
    if (chkArt.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Article not found' });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO returns (order_id, article_id, quantity, state, action, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, order_id, article_id, quantity, state, action, notes, created_at`,
      [orderId, Number(article_id), cant, state, action, notes || null, req.user.id]
    );
    const ret = ins.rows[0];
    ret.name = chkArt.rows[0].name;
    ret.reference = chkArt.rows[0].reference;
    res.json({ success: true, return: ret });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/orders/:id/returns/:returnId', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const orderId = Number(req.params.id);
    const returnId = Number(req.params.returnId);
    const { quantity, state, action, notes } = req.body || {};
    const chk = await pool.query('SELECT id FROM returns WHERE id = $1 AND order_id = $2', [returnId, orderId]);
    if (chk.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Devolucion no encontrada' });
      return;
    }
    const estadosValidos = ['caducado','defectuoso','confundido','no_rota','otro'];
    const accionesValidas = ['abonar','cambio_mismo','cambio_otra','solo_retirar'];
    if (state !== undefined && !estadosValidos.includes(state)) {
      res.status(400).json({ success: false, error: 'Estado no valido' });
      return;
    }
    if (action !== undefined && !accionesValidas.includes(action)) {
      res.status(400).json({ success: false, error: 'Accion no valida' });
      return;
    }
    if (quantity !== undefined) {
      const cant = Number(quantity);
      if (!cant || cant < 1) {
        res.status(400).json({ success: false, error: 'La cantidad debe ser mayor que 0' });
        return;
      }
    }
    const upd = await pool.query(
      `UPDATE returns
       SET quantity = COALESCE($1, quantity),
           state = COALESCE($2, state),
           action = COALESCE($3, action),
           notes = COALESCE($4, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND order_id = $6
       RETURNING id, order_id, article_id, quantity, state, action, notes, updated_at`,
      [quantity !== undefined ? Number(quantity) : null,
       state !== undefined ? state : null,
       action !== undefined ? action : null,
       notes !== undefined ? notes : null,
       returnId, orderId]
    );
    res.json({ success: true, return: upd.rows[0] });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.delete('/api/orders/:id/returns/:returnId', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const orderId = Number(req.params.id);
    const returnId = Number(req.params.returnId);
    const del = await pool.query(
      'DELETE FROM returns WHERE id = $1 AND order_id = $2 RETURNING id',
      [returnId, orderId]
    );
    if (del.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Devolucion no encontrada' });
      return;
    }
    res.json({ success: true, deleted: del.rows[0].id });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================// RUTAS DE CLIENTES (clients)
// ============================================================================
import * as XLSX from 'xlsx';

const subidaExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const ok = file.mimetype.includes('spreadsheet') ||
               file.mimetype.includes('excel') ||
               file.originalname.toLowerCase().endsWith('.xlsx') ||
               file.originalname.toLowerCase().endsWith('.xls');
    if (ok) cb(null, true);
    else cb(new Error('Solo se aceptan archivos Excel (.xlsx, .xls)'));
  }
});

app.get('/api/clients', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const soloActivos = req.query.active !== 'false';
    let sql = "SELECT id, sage_code, commercial_code, razon_social, cif, telefono, whatsapp, email, municipio, provincia, cp, direccion, codigo_contable, categoria, is_active, is_new_from_visit, created_at FROM clients";
    const conds: string[] = [];
    const params: any[] = [];
    if (soloActivos) {
      conds.push('is_active = TRUE');
    }
    if (req.user.role !== 'admin') {
      const usr = await pool.query('SELECT sage_commercial_code FROM users WHERE id = $1', [req.user.id]);
      const codigo = usr.rows.length > 0 ? usr.rows[0].sage_commercial_code : null;
      if (codigo) {
        params.push(codigo);
        conds.push(`commercial_code = $${params.length}`);
      }
    }
    if (conds.length > 0) {
      sql += ' WHERE ' + conds.join(' AND ');
    }
    sql += ' ORDER BY razon_social ASC';
    const r = await pool.query(sql, params);
    res.json({ success: true, clients: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/clients', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    const { razon_social, cif, telefono, whatsapp, email, municipio, provincia, cp, direccion, numero_cuenta } = req.body || {};
    if (!razon_social || !String(razon_social).trim()) {
      res.status(400).json({ success: false, error: 'La razon social es obligatoria' });
      return;
    }
    const existe = await pool.query('SELECT id FROM clients WHERE LOWER(razon_social) = LOWER($1) LIMIT 1', [String(razon_social).trim()]);
    if (existe.rows.length > 0) {
      res.status(400).json({ success: false, error: 'Ya existe un cliente con esa razon social. Usa el desplegable para elegirlo.' });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO clients (razon_social, cif, telefono, whatsapp, email, municipio, provincia, cp, direccion, numero_cuenta, is_active, is_new_from_visit, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, TRUE, $11)
       RETURNING id, razon_social, cif, telefono, whatsapp, email, municipio, provincia, cp, direccion, is_new_from_visit, created_at`,
      [String(razon_social).trim(),
       cif ? String(cif).trim() : null,
       telefono ? String(telefono).trim() : null,
       whatsapp ? String(whatsapp).trim() : null,
       email ? String(email).trim() : null,
       municipio ? String(municipio).trim() : null,
       provincia ? String(provincia).trim() : null,
       cp ? String(cp).trim() : null,
       direccion ? String(direccion).trim() : null,
       numero_cuenta ? String(numero_cuenta).trim() : null,
       req.user.id]
    );
    res.json({ success: true, client: ins.rows[0] });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/clients/import', verifyToken, (req: AuthRequest, res: Response) => {
  subidaExcel.single('excel')(req, res, async (err: any) => {
    try {
      if (err) {
        res.status(400).json({ success: false, error: err.message || 'Error subiendo Excel' });
        return;
      }
      if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
      if (req.user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Solo el admin puede importar clientes' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No se recibio ningun archivo Excel' });
        return;
      }
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const filas: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (filas.length === 0) {
        res.status(400).json({ success: false, error: 'El Excel esta vacio' });
        return;
      }
      let insertados = 0, actualizados = 0, ignorados = 0, errores = 0;
      const errorDetalles: string[] = [];
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const razonSocial = String(f['Razón social'] || f['Razon social'] || f['razon_social'] || '').trim();
        if (!razonSocial) { errores++; errorDetalles.push(`Fila ${i+2}: sin razon social`); continue; }
        if (razonSocial.toUpperCase().startsWith('BAJA-') || razonSocial.toUpperCase().startsWith('BAJA ')) {
          ignorados++;
          continue;
        }
        const sageCode = f['Cód. cliente'] != null ? String(f['Cód. cliente']).trim() : null;
        const cif = f['CIF/DNI'] != null ? String(f['CIF/DNI']).trim() : null;
        const delegacion = f['Deleg.'] != null ? String(f['Deleg.']).trim() : null;
        const telefono = f['Teléfono'] != null ? String(f['Teléfono']).trim() : null;
        const municipio = f['Municipio'] != null ? String(f['Municipio']).trim() : null;
        const provincia = f['Provincia'] != null ? String(f['Provincia']).trim() : null;
        const commercialCode = f['Comercial asig.'] != null ? String(f['Comercial asig.']).trim() : null;
        const codigoContable = f['Cód. contable'] != null ? String(f['Cód. contable']).trim() : null;
        const categoria = f['Categoría'] != null ? String(f['Categoría']).trim() : null;
        const email = f['Correo Electrónico1'] != null ? String(f['Correo Electrónico1']).trim() : null;
        try {
          if (sageCode) {
            const existe = await pool.query('SELECT id FROM clients WHERE sage_code = $1', [sageCode]);
            if (existe.rows.length > 0) {
              await pool.query(
                `UPDATE clients SET razon_social=$1, cif=$2, delegacion=$3, telefono=$4, municipio=$5, provincia=$6,
                   commercial_code=$7, codigo_contable=$8, categoria=$9, email=$10, is_active=TRUE,
                   updated_at=CURRENT_TIMESTAMP
                 WHERE sage_code=$11`,
                [razonSocial, cif, delegacion, telefono, municipio, provincia, commercialCode, codigoContable, categoria, email, sageCode]
              );
              actualizados++;
            } else {
              await pool.query(
                `INSERT INTO clients (sage_code, razon_social, cif, delegacion, telefono, municipio, provincia,
                   commercial_code, codigo_contable, categoria, email, is_active, is_new_from_visit, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,FALSE,$12)`,
                [sageCode, razonSocial, cif, delegacion, telefono, municipio, provincia, commercialCode, codigoContable, categoria, email, req.user!.id]
              );
              insertados++;
            }
          } else {
            await pool.query(
              `INSERT INTO clients (razon_social, cif, delegacion, telefono, municipio, provincia,
                 commercial_code, codigo_contable, categoria, email, is_active, is_new_from_visit, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,FALSE,$11)`,
              [razonSocial, cif, delegacion, telefono, municipio, provincia, commercialCode, codigoContable, categoria, email, req.user!.id]
            );
            insertados++;
          }
        } catch (eIns) {
          errores++;
          errorDetalles.push(`Fila ${i+2} (${razonSocial}): ${(eIns as Error).message}`);
        }
      }
      res.json({
        success: true,
        resumen: {
          total_filas: filas.length,
          insertados, actualizados, ignorados_baja: ignorados, errores
        },
        errores_detalle: errorDetalles.slice(0, 10)
      });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  });
});

// ============================================================================
// RUTAS DE USUARIOS (admin) - asignar sage_commercial_code
// ============================================================================
app.get('/api/users', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    if (req.user.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Solo el admin puede ver la lista de usuarios' });
      return;
    }
    const r = await pool.query(
      'SELECT id, email, name, role, is_active, sage_commercial_code, created_at FROM users ORDER BY role DESC, name ASC'
    );
    res.json({ success: true, users: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/users/:id/sage-code', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }
    if (req.user.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Solo el admin puede modificar codigos de comercial' });
      return;
    }
    const userId = Number(req.params.id);
    const { sage_commercial_code } = req.body || {};
    let valor: string | null = null;
    if (sage_commercial_code !== null && sage_commercial_code !== undefined) {
      const v = String(sage_commercial_code).trim();
      if (v.length > 0) {
        if (v.length > 30) {
          res.status(400).json({ success: false, error: 'El codigo es demasiado largo (max 30 caracteres)' });
          return;
        }
        valor = v;
      }
    }
    const upd = await pool.query(
      'UPDATE users SET sage_commercial_code = $1 WHERE id = $2 RETURNING id, email, name, role, sage_commercial_code',
      [valor, userId]
    );
    if (upd.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }
    res.json({ success: true, user: upd.rows[0] });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ============================================================================
// RUTA SUBIR IMAGEN DE ARTICULO (protegida)
// ============================================================================

app.post('/api/upload/image', verifyToken, (req: AuthRequest, res: Response) => {
  subidaImagen.single('imagen')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ success: false, error: err.message || 'Error subiendo imagen' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibio ninguna imagen' });
      return;
    }
    const rutaPublica = '/uploads/' + req.file.filename;
    res.json({ success: true, image_path: rutaPublica });
  });
});

app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
    return;
  }
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// PREPARACION DE LA BASE DE DATOS
// ============================================================================

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

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================


async function asegurarTablasEtapa4(): Promise<void> {
  try {
    const existe = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_delete_requests') AS e"
    );
    if (existe.rows[0].e) {
      console.log('Tablas Etapa 4 ya existen, no se recrean');
      return;
    }
    console.log('Faltan tablas Etapa 4: creandolas (sin tocar datos existentes)...');
    const migDir = path.join(__dirname, 'db', 'migrations');
    const ruta = path.join(migDir, '002_catalog_sharing.sql');
    if (fs.existsSync(ruta)) {
      const sql = fs.readFileSync(ruta, 'utf8');
      try {
        await pool.query(sql);
        console.log('Tablas Etapa 4 creadas correctamente (compartir/eliminar)');
      } catch (e) {
        console.error('Aviso creando tablas Etapa 4:', (e as Error).message);
      }
    } else {
      console.log('No se encontro 002_catalog_sharing.sql');
    }
  } catch (error) {
    console.error('Error asegurando tablas Etapa 4:', (error as Error).message);
  }
}

async function asegurarTablaDevoluciones(): Promise<void> {
  try {
    const existe = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='returns') AS e"
    );
    if (existe.rows[0].e) {
      console.log('Tabla devoluciones (returns) ya existe, no se recrea');
      return;
    }
    console.log('Creando tabla devoluciones (returns) (sin tocar datos existentes)...');
    const sqlReturns = `
      CREATE TABLE returns (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        article_id INTEGER NOT NULL REFERENCES articles(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        state VARCHAR(30) NOT NULL CHECK (state IN ('caducado','defectuoso','confundido','no_rota','otro')),
        action VARCHAR(30) NOT NULL CHECK (action IN ('abonar','cambio_mismo','cambio_otra','solo_retirar')),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_returns_order_id ON returns(order_id);
    `;
    try {
      await pool.query(sqlReturns);
      console.log('Tabla devoluciones (returns) creada correctamente');
    } catch (e) {
      console.error('Aviso creando tabla devoluciones:', (e as Error).message);
    }
  } catch (error) {
    console.error('Error asegurando tabla devoluciones:', (error as Error).message);
  }
}

async function asegurarTablaClients(): Promise<void> {
  try {
    const existe = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clients') AS e"
    );
    if (existe.rows[0].e) {
      console.log('Tabla clients ya existe, no se recrea');
      return;
    }
    console.log('Creando tabla clients (sin tocar datos existentes)...');
    const sqlClients = `
      CREATE TABLE clients (
        id SERIAL PRIMARY KEY,
        sage_code VARCHAR(30) UNIQUE,
        commercial_code VARCHAR(30),
        razon_social VARCHAR(200) NOT NULL,
        cif VARCHAR(30),
        delegacion VARCHAR(50),
        telefono VARCHAR(50),
        whatsapp VARCHAR(50),
        email VARCHAR(150),
        municipio VARCHAR(100),
        provincia VARCHAR(100),
        cp VARCHAR(10),
        direccion VARCHAR(250),
        codigo_contable VARCHAR(30),
        categoria VARCHAR(30),
        numero_cuenta VARCHAR(34),
        is_active BOOLEAN DEFAULT TRUE,
        is_new_from_visit BOOLEAN DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_clients_commercial_code ON clients(commercial_code);
      CREATE INDEX idx_clients_razon_social ON clients(razon_social);
      CREATE INDEX idx_clients_sage_code ON clients(sage_code);
    `;
    try {
      await pool.query(sqlClients);
      console.log('Tabla clients creada correctamente');
    } catch (e) {
      console.error('Aviso creando tabla clients:', (e as Error).message);
    }
  } catch (error) {
    console.error('Error asegurando tabla clients:', (error as Error).message);
  }
}

async function asegurarColumnaSageCode(): Promise<void> {
  try {
    const existe = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='sage_commercial_code') AS e"
    );
    if (existe.rows[0].e) {
      console.log('Columna users.sage_commercial_code ya existe, no se recrea');
      return;
    }
    console.log('Añadiendo columna sage_commercial_code a users...');
    try {
      await pool.query("ALTER TABLE users ADD COLUMN sage_commercial_code VARCHAR(30)");
      console.log('Columna users.sage_commercial_code creada correctamente');
    } catch (e) {
      console.error('Aviso creando columna sage_commercial_code:', (e as Error).message);
    }
  } catch (error) {
    console.error('Error asegurando columna sage_commercial_code:', (error as Error).message);
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
    await asegurarTablasEtapa4();
    await asegurarTablaDevoluciones();
    await asegurarTablaClients();
    await asegurarColumnaSageCode();
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
