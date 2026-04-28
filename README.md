# 🏥 CatalogPRO - Catálogo Digital Profesional para LOMHIFAR

Plataforma profesional de gestión de catálogos digitales para comerciales de LOMHIFAR.

## 📋 Características

✅ **Gestión centralizada** de artículos y catálogos  
✅ **Catálogos personalizados** por comercial  
✅ **Modo offline/online** automático con sincronización  
✅ **Generación de PDFs** de pedidos  
✅ **Versionado automático** de catálogos  
✅ **Reversión de versiones** anteriores  
✅ **Auditoría completa** de cambios  
✅ **Interfaz optimizada** para tablet  
✅ **Favoritos personales**  
✅ **Búsqueda avanzada**  

## 🚀 Quick Start

### Requisitos
- Docker & Docker Compose (recomendado)
- O: Node.js 18+, PostgreSQL 15+

### Opción 1: Con Docker (Recomendado)

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd catalogo-pro

# 2. Copiar archivos de entorno
cp infra/.env.example infra/.env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Editar variables de entorno (importante cambiar contraseñas)
nano backend/.env

# 4. Iniciar servicios
docker-compose up -d

# 5. Esperar a que arranque (2-3 minutos)
docker-compose logs -f

# 6. La aplicación estará disponible en:
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# PostgreSQL: localhost:5432
```

### Opción 2: Local (Desarrollo)

```bash
# Backend
cd backend
npm install
cp .env.example .env
npm run build
npm run db:migrate
npm run db:seed
npm run dev

# Frontend (en otra terminal)
cd frontend
npm install
cp .env.example .env
npm start
```

## 🔑 Usuarios de Prueba

Credenciales en `backend/src/db/seed.sql`:

| Email | Contraseña | Rol | Acceso |
|-------|-----------|-----|--------|
| admin@lomhifar.com | admin123 | admin | Panel de administración |
| comercial1@lomhifar.com | sales123 | sales | Catálogo y pedidos |
| comercial2@lomhifar.com | sales123 | sales | Catálogo y pedidos |

## 📁 Estructura del Proyecto

```
catalogo-pro/
├── backend/                    # API Node.js + Express
│   ├── src/
│   │   ├── index.ts           # Servidor principal
│   │   ├── services/          # Servicios (Auth, Catalog, Article, Order)
│   │   ├── middleware/        # Middleware de autenticación
│   │   ├── db/
│   │   │   ├── migrations/    # Schema SQL
│   │   │   └── seed.sql       # Datos iniciales
│   │   └── utils/
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/                   # React + TypeScript
│   ├── src/
│   │   ├── components/        # Componentes React
│   │   ├── pages/             # Páginas principales
│   │   ├── store/             # Redux Toolkit
│   │   │   └── slices/        # Auth, Articles, Orders, Offline
│   │   ├── services/          # API, DB, Sync
│   │   ├── hooks/             # Custom hooks
│   │   ├── types/             # TypeScript types
│   │   ├── styles/            # CSS global
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── public/
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── infra/
│   ├── docker-compose.yml     # Orquestación de servicios
│   ├── nginx.conf             # Configuración Nginx
│   └── .env.example
│
├── docs/                       # Documentación adicional
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   └── DEPLOYMENT.md
│
├── .gitignore
└── docker-compose.yml
```

## 🔧 Configuración

### Variables de Entorno

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql://catalogo_user:password@postgres:5432/catalogo_pro
JWT_SECRET=your_secret_change_me_in_production
JWT_EXPIRY=7d
NODE_ENV=development
PORT=3001
```

**Frontend** (`frontend/.env`):
```
REACT_APP_API_URL=http://localhost:3001
REACT_APP_API_PREFIX=/api
REACT_APP_ENV=development
REACT_APP_ENABLE_OFFLINE=true
```

## 📡 API Endpoints

### Autenticación
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro
- `POST /api/auth/refresh` - Refrescar token

### Artículos
- `GET /api/articles` - Obtener artículos
- `GET /api/articles/search` - Buscar
- `GET /api/articles/:id` - Obtener detalle
- `GET /api/articles/categories` - Categorías
- `POST /api/articles` - Crear (admin)
- `PUT /api/articles/:id` - Actualizar (admin)

### Catálogos
- `GET /api/catalogs` - Obtener catálogos
- `GET /api/catalogs/:id` - Obtener catálogo
- `GET /api/catalogs/:id/articles` - Artículos del catálogo
- `POST /api/catalogs` - Crear (admin)
- `POST /api/catalogs/:id/publish` - Publicar (admin)
- `GET /api/catalogs/:id/versions` - Historial de versiones
- `POST /api/catalogs/:id/revert/:version` - Revertir versión

### Pedidos
- `GET /api/orders/my-orders` - Mis pedidos
- `GET /api/orders/:id` - Obtener pedido
- `POST /api/orders` - Crear pedido
- `POST /api/orders/:id/items` - Añadir item
- `PUT /api/orders/:id/items/:itemId` - Actualizar item
- `DELETE /api/orders/:id/items/:itemId` - Eliminar item
- `POST /api/orders/:id/confirm` - Confirmar pedido
- `GET /api/orders/:id/pdf` - Descargar PDF

## 🛠️ Desarrollo

### Backend

```bash
cd backend

# Instalación
npm install

# Compilar TypeScript
npm run build

# Desarrollo (con auto-reload)
npm run dev

# Testing
npm test

# Linting
npm run lint
```

**Servicios principales:**
- `AuthService` - Autenticación y JWT
- `ArticleService` - Gestión de artículos
- `CatalogService` - Gestión de catálogos y versionado
- `OrderService` - Gestión de pedidos

### Frontend

```bash
cd frontend

# Instalación
npm install

# Desarrollo
npm start

# Build producción
npm run build

# Testing
npm test
```

**Redux Slices:**
- `authSlice` - Autenticación y usuario
- `articlesSlice` - Estado de artículos
- `ordersSlice` - Estado de pedidos y carrito
- `offlineSlice` - Estado offline/sync

**Servicios:**
- `api.ts` - Cliente HTTP con axios
- `db.ts` - IndexedDB para almacenamiento local
- `sync.ts` - Sincronización offline/online

## 🗄️ Base de Datos

### Tablas principales
- `users` - Usuarios del sistema
- `articles` - Artículos disponibles
- `catalogs` - Catálogos maestros
- `catalog_articles` - Relación artículos en catálogos
- `orders` - Pedidos/órdenes
- `order_items` - Items de los pedidos
- `catalog_versions` - Historial de versiones
- `audit_log` - Log de auditoría completo
- `sync_log` - Log de sincronizaciones

### Índices y Triggers
- Índices GIN para búsqueda full-text
- Trigger automático para versionado
- Trigger automático para auditoría

## 🔐 Seguridad

✅ JWT para autenticación  
✅ HTTPS/TLS en producción  
✅ Roles (admin/sales)  
✅ Contraseñas hasheadas con bcrypt  
✅ Auditoría completa de cambios  
✅ Validación de entrada  
✅ CORS configurado  
✅ Helmet para headers de seguridad  

## 📱 PWA y Offline

✅ Funciona offline automáticamente  
✅ IndexedDB para almacenamiento local  
✅ Sincronización automática al conectar  
✅ Cola de pedidos en caso de desconexión  
✅ Service Workers para cacheo  

## 🚀 Deploy

### Producción con Docker

```bash
# Build para producción
docker-compose -f docker-compose.prod.yml build

# Iniciar servicios
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Checklist pre-deploy

- [ ] Cambiar JWT_SECRET en .env
- [ ] Cambiar POSTGRES_PASSWORD en .env
- [ ] Configurar HTTPS/TLS en Nginx
- [ ] Configurar dominio/DNS
- [ ] Crear backups automáticos
- [ ] Configurar monitoreo
- [ ] Revisar firewall

## 📊 Monitoreo

**Logs del sistema:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

**Health checks:**
```bash
curl http://localhost:3001/health
curl http://localhost:3000
```

## 🐛 Troubleshooting

### Puerto ya en uso
```bash
lsof -i :3000
kill -9 <PID>
```

### BD no se conecta
```bash
docker-compose logs postgres
docker-compose exec postgres psql -U catalogo_user -d catalogo_pro
```

### Frontend no conecta con backend
```bash
# Verificar REACT_APP_API_URL en frontend/.env
# Debe ser http://localhost:3001 en desarrollo
```

### Limpiar todo y comenzar de nuevo
```bash
docker-compose down -v
docker-compose up -d
```

## 📚 Documentación Completa

- `docs/ARCHITECTURE.md` - Decisiones arquitectónicas
- `docs/API.md` - Referencia completa de API
- `docs/DATABASE.md` - Schema y modelos de datos
- `docs/DEPLOYMENT.md` - Guía de deploy a producción

## 📞 Soporte

Para soporte contactar al equipo técnico de LOMHIFAR.

## 📄 Licencia

LOMHIFAR S.L. - Todos los derechos reservados.

---

**Última actualización:** Abril 2026  
**Versión:** 1.0.0  
**Estado:** MVP en desarrollo
