-- ============================================================================
-- MIGRACIONES ADICIONALES PARA COMPARTICIÓN Y ELIMINACIÓN DE LÁMINAS
-- ============================================================================
-- Ejecutar con: psql -d catalogo_pro -f migrations/002_catalog_sharing.sql

-- ============================================================================
-- TABLA: catalog_shares
-- Registra todo envío de catálogos/láminas por email o WhatsApp
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_shares (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE CASCADE NOT NULL,
  share_type VARCHAR(50) NOT NULL, -- 'email' | 'whatsapp'
  recipient VARCHAR(255) NOT NULL, -- email o número teléfono
  recipient_name VARCHAR(255),
  message TEXT,
  sheet_numbers JSONB, -- array de números de lámina
  status VARCHAR(50) DEFAULT 'sent', -- 'pending' | 'sent' | 'failed'
  error_msg TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  shared_at TIMESTAMP
);

CREATE INDEX idx_shares_user ON catalog_shares(user_id);
CREATE INDEX idx_shares_catalog ON catalog_shares(catalog_id);
CREATE INDEX idx_shares_type ON catalog_shares(share_type);
CREATE INDEX idx_shares_status ON catalog_shares(status);
CREATE INDEX idx_shares_created_at ON catalog_shares(created_at DESC);

-- ============================================================================
-- TABLA: catalog_delete_requests
-- Solicitudes de eliminación de láminas con confirmación doble
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_delete_requests (
  id BIGSERIAL PRIMARY KEY,
  delete_request_id VARCHAR(100) UNIQUE NOT NULL, -- código único de confirmación
  catalog_id BIGINT REFERENCES catalogs(id) ON DELETE CASCADE NOT NULL,
  sheet_number INTEGER NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'confirmed' | 'cancelled' | 'expired'
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL, -- 5 minutos de expiración
  confirmed_at TIMESTAMP,
  confirmation_code VARCHAR(6), -- código de 6 dígitos opcional adicional
  FOREIGN KEY (catalog_id, sheet_number) REFERENCES catalog_articles(catalog_id, sheet_number)
);

CREATE INDEX idx_delete_requests_id ON catalog_delete_requests(delete_request_id);
CREATE INDEX idx_delete_requests_catalog ON catalog_delete_requests(catalog_id);
CREATE INDEX idx_delete_requests_user ON catalog_delete_requests(user_id);
CREATE INDEX idx_delete_requests_status ON catalog_delete_requests(status);
CREATE INDEX idx_delete_requests_expires ON catalog_delete_requests(expires_at);

-- ============================================================================
-- TRIGGER: Limpiar solicitudes expiradas automáticamente
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_delete_requests()
RETURNS void AS $$
BEGIN
  UPDATE catalog_delete_requests
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Ejecutar limpieza cada 5 minutos (en una tarea cron del servidor)
-- SELECT cleanup_expired_delete_requests();

-- ============================================================================
-- VISTA: Resumen de comparticiones de catálogo
-- ============================================================================

CREATE OR REPLACE VIEW catalog_share_summary AS
SELECT
  catalog_id,
  COUNT(CASE WHEN share_type = 'email' THEN 1 END) as email_shares,
  COUNT(CASE WHEN share_type = 'whatsapp' THEN 1 END) as whatsapp_shares,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_shares,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_shares,
  COUNT(*) as total_shares,
  MAX(created_at) as last_share_at
FROM catalog_shares
GROUP BY catalog_id;

-- ============================================================================
-- VISTA: Solicitudes de eliminación pendientes
-- ============================================================================

CREATE OR REPLACE VIEW pending_delete_requests_view AS
SELECT
  cdr.delete_request_id,
  cdr.catalog_id,
  c.name as catalog_name,
  cdr.sheet_number,
  COUNT(ca.id) as articles_in_sheet,
  u.name as requested_by,
  cdr.created_at,
  cdr.expires_at,
  EXTRACT(EPOCH FROM (cdr.expires_at - NOW()))::INTEGER as seconds_until_expiry
FROM catalog_delete_requests cdr
JOIN catalogs c ON cdr.catalog_id = c.id
LEFT JOIN catalog_articles ca ON cdr.catalog_id = ca.catalog_id AND cdr.sheet_number = ca.sheet_number
JOIN users u ON cdr.user_id = u.id
WHERE cdr.status = 'pending'
GROUP BY cdr.delete_request_id, cdr.catalog_id, c.name, cdr.sheet_number, u.name, cdr.created_at, cdr.expires_at
ORDER BY cdr.created_at DESC;

-- ============================================================================
-- TABLA: user_deletion_settings (opcional)
-- Permite a los admins configurar si una lámina requiere confirmación adicional
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_deletion_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  require_double_confirmation BOOLEAN DEFAULT TRUE,
  require_sms_code BOOLEAN DEFAULT FALSE,
  require_email_confirmation BOOLEAN DEFAULT FALSE,
  max_sheets_per_day INTEGER DEFAULT 10,
  allow_delete_published_sheets BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_deletion_settings_user ON user_deletion_settings(user_id);

-- ============================================================================
-- TRIGGER: Auditoría de comparticiones
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_catalog_shares()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp)
  VALUES (
    NEW.user_id,
    'share_catalog',
    'catalogs',
    NEW.catalog_id,
    row_to_json(NEW),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER share_audit_trigger
AFTER INSERT ON catalog_shares
FOR EACH ROW EXECUTE FUNCTION audit_catalog_shares();

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Ver tablas creadas:
-- SELECT tablename FROM pg_tables WHERE tablename IN ('catalog_shares', 'catalog_delete_requests', 'user_deletion_settings');

-- Ver vistas creadas:
-- SELECT viewname FROM pg_views WHERE viewname LIKE '%share%' OR viewname LIKE '%delete%';

-- Insertar configuración de eliminación para usuario:
-- INSERT INTO user_deletion_settings (user_id, require_double_confirmation, require_sms_code)
-- VALUES (1, TRUE, FALSE)
-- ON CONFLICT (user_id) DO UPDATE SET require_double_confirmation = TRUE;
