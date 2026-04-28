-- CatalogPRO - Schema SQL Inicial
-- Base de datos: catalogo_pro
-- Usuario: catalogo_user

-- Crear extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- TABLA: users
-- ============================================================================
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'sales',
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- TABLA: articles
-- ============================================================================
CREATE TABLE articles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  reference VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  description_long TEXT,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  state VARCHAR(50) DEFAULT 'active',
  image_path VARCHAR(500),
  composition_json JSONB,
  pvpr DECIMAL(10,2),
  internal_notes TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_articles_reference ON articles(reference);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_state ON articles(state);
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);

-- ============================================================================
-- TABLA: catalogs
-- ============================================================================
CREATE TABLE catalogs (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  is_draft BOOLEAN DEFAULT TRUE,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_catalogs_created_by ON catalogs(created_by);
CREATE INDEX idx_catalogs_is_draft ON catalogs(is_draft);

-- ============================================================================
-- TABLA: catalog_articles
-- ============================================================================
CREATE TABLE catalog_articles (
  id BIGSERIAL PRIMARY KEY,
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE CASCADE NOT NULL,
  article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  display_order INTEGER DEFAULT 0,
  sheet_number INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(catalog_id, article_id)
);

CREATE INDEX idx_catalog_articles_catalog ON catalog_articles(catalog_id);
CREATE INDEX idx_catalog_articles_article ON catalog_articles(article_id);

-- ============================================================================
-- TABLA: orders
-- ============================================================================
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE SET NULL,
  client_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  synced_at TIMESTAMP
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ============================================================================
-- TABLA: order_items
-- ============================================================================
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  composition_json JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_article ON order_items(article_id);

-- ============================================================================
-- TABLA: catalog_assignments
-- ============================================================================
CREATE TABLE catalog_assignments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, catalog_id)
);

CREATE INDEX idx_assignments_user ON catalog_assignments(user_id);
CREATE INDEX idx_assignments_catalog ON catalog_assignments(catalog_id);

-- ============================================================================
-- TABLA: user_favorites
-- ============================================================================
CREATE TABLE user_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX idx_favorites_user ON user_favorites(user_id);

-- ============================================================================
-- TABLA: catalog_versions
-- ============================================================================
CREATE TABLE catalog_versions (
  id BIGSERIAL PRIMARY KEY,
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  change_description TEXT
);

CREATE INDEX idx_versions_catalog ON catalog_versions(catalog_id);
CREATE INDEX idx_versions_version ON catalog_versions(catalog_id, version_number);

-- ============================================================================
-- TABLA: audit_log
-- ============================================================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(100),
  record_id BIGINT,
  old_data JSONB,
  new_data JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);

-- ============================================================================
-- TABLA: sync_log
-- ============================================================================
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  last_sync_at TIMESTAMP,
  last_sync_version INTEGER,
  device_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  error_msg TEXT,
  synced_records INTEGER DEFAULT 0,
  sync_duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_user ON sync_log(user_id);
CREATE INDEX idx_sync_status ON sync_log(status);
CREATE INDEX idx_sync_timestamp ON sync_log(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger para versionado automático de catálogos
CREATE OR REPLACE FUNCTION version_catalog_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version OR NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO catalog_versions (catalog_id, version_number, snapshot_json, created_by)
    VALUES (NEW.id, NEW.version, row_to_json(NEW), NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catalog_version_trigger
AFTER UPDATE ON catalogs
FOR EACH ROW EXECUTE FUNCTION version_catalog_on_update();

-- Trigger para auditoría automática
CREATE OR REPLACE FUNCTION audit_insert_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp)
  VALUES (
    COALESCE(current_setting('app.user_id', true)::BIGINT, NULL),
    TG_ARGV[0]::TEXT,
    TG_TABLE_NAME,
    NEW.id,
    row_to_json(NEW),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Activar auditoría en tablas
CREATE TRIGGER audit_articles_insert
AFTER INSERT ON articles FOR EACH ROW EXECUTE FUNCTION audit_insert_update('create');

CREATE TRIGGER audit_articles_update
AFTER UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION audit_insert_update('update');

CREATE TRIGGER audit_catalogs_insert
AFTER INSERT ON catalogs FOR EACH ROW EXECUTE FUNCTION audit_insert_update('create');

CREATE TRIGGER audit_catalogs_update
AFTER UPDATE ON catalogs FOR EACH ROW EXECUTE FUNCTION audit_insert_update('update');

CREATE TRIGGER audit_orders_insert
AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION audit_insert_update('create');

CREATE TRIGGER audit_orders_update
AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION audit_insert_update('update');

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Comando para verificar tablas: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
