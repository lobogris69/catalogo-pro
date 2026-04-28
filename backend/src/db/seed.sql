-- CatalogPRO - Seed Data
-- Inserta usuarios y artículos de prueba

-- ============================================================================
-- USUARIOS (Las contraseñas son: admin123 y sales123, hasheadas con bcrypt)
-- ============================================================================

-- Hash para "admin123": $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/sadO2I
-- Hash para "sales123": $2a$10$uxTKg2N7RdgPNQkqVBJxL.3ViN8LNTKWUCxg0pUKz2QqZEZ0ZBVMe

INSERT INTO users (email, password_hash, role, name, is_active) VALUES
('admin@lomhifar.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36P4/sadO2I', 'admin', 'Fernando Admin', true),
('comercial1@lomhifar.com', '$2a$10$uxTKg2N7RdgPNQkqVBJxL.3ViN8LNTKWUCxg0pUKz2QqZEZ0ZBVMe', 'sales', 'Juan García', true),
('comercial2@lomhifar.com', '$2a$10$uxTKg2N7RdgPNQkqVBJxL.3ViN8LNTKWUCxg0pUKz2QqZEZ0ZBVMe', 'sales', 'María López', true);

-- ============================================================================
-- ARTÍCULOS EJEMPLO
-- ============================================================================

INSERT INTO articles (name, reference, description, category, subcategory, tags, state, pvpr, display_order) VALUES

-- Analgésicos
('Paracetamol 500mg', 'PAR-500', 'Analgésico y antipirético, 20 comprimidos', 'Analgésicos', 'Sin prescripción', ARRAY['Novedad', 'Top ventas'], 'active', 4.50, 1),
('Ibuprofeno 400mg', 'IBU-400', 'Antiinflamatorio no esteroideo, 30 comprimidos', 'Analgésicos', 'Sin prescripción', ARRAY['Top ventas'], 'active', 6.99, 2),
('Aspirina 500mg', 'ASP-500', 'Analgésico y anticoagulante, 20 comprimidos', 'Analgésicos', 'Sin prescripción', ARRAY['Clásico'], 'active', 3.99, 3),

-- Antibióticos
('Amoxicilina 500mg', 'AMX-500', 'Antibiótico de amplio espectro, cápsula x 10', 'Antibióticos', 'Con prescripción', ARRAY['Necesita receta'], 'active', 12.50, 4),
('Azitromicina 500mg', 'AZI-500', 'Antibiótico macrólido, tableta x 6', 'Antibióticos', 'Con prescripción', ARRAY['Necesita receta'], 'active', 15.99, 5),

-- Vitaminas
('Vitamina C 500mg', 'VIT-C', 'Suplemento vitamínico, 60 comprimidos', 'Vitaminas', 'Complemento', ARRAY['Novedad'], 'active', 8.99, 6),
('Vitamina D3 1000UI', 'VIT-D3', 'Suplemento de Vitamina D, 30 gotas', 'Vitaminas', 'Complemento', ARRAY['Recomendado'], 'active', 12.50, 7),
('Complejo B', 'VITB-CPLEX', 'Vitaminas del complejo B, 30 comprimidos', 'Vitaminas', 'Complemento', ARRAY['Popular'], 'active', 9.99, 8),

-- Dispositivos
('Termómetro Digital', 'TERM-DIG', 'Termómetro de contacto infrarrojo', 'Dispositivos', 'Medición', ARRAY['Novedad', 'Tecnología'], 'active', 19.99, 9),
('Tensiómetro Automático', 'TENS-AUTO', 'Medidor de presión arterial digital', 'Dispositivos', 'Medición', ARRAY['Recomendado'], 'active', 34.99, 10),
('Oxímetro de Pulso', 'OXIM-PULSO', 'Dispositivo para medir oxigenación', 'Dispositivos', 'Medición', ARRAY['Profesional'], 'active', 24.99, 11);

-- ============================================================================
-- CATÁLOGOS
-- ============================================================================

INSERT INTO catalogs (name, version, created_by, is_draft, published_at, description) VALUES
(1, 'Catálogo Maestro Q2 2026', 1, 1, FALSE, NOW(), 'Catálogo maestro con todos los artículos disponibles'),
(1, 'Catálogo Madrid - Juan García', 1, 1, FALSE, NOW(), 'Catálogo personalizado para Juan García - Zona Madrid');

-- ============================================================================
-- ASIGNACIONES DE CATÁLOGOS
-- ============================================================================

INSERT INTO catalog_assignments (user_id, catalog_id, assigned_by) VALUES
(2, 2, 1),
(3, 2, 1);

-- ============================================================================
-- ARTÍCULOS EN CATÁLOGOS
-- ============================================================================

-- Catálogo Maestro incluye todos los artículos
INSERT INTO catalog_articles (catalog_id, article_id, display_order, sheet_number) VALUES
(1, 1, 1, 1),
(1, 2, 2, 1),
(1, 3, 3, 1),
(1, 4, 1, 2),
(1, 5, 2, 2),
(1, 6, 1, 3),
(1, 7, 2, 3),
(1, 8, 3, 3),
(1, 9, 1, 4),
(1, 10, 2, 4),
(1, 11, 3, 4);

-- Catálogo Madrid (solo artículos principales)
INSERT INTO catalog_articles (catalog_id, article_id, display_order, sheet_number) VALUES
(2, 1, 1, 1),
(2, 2, 2, 1),
(2, 6, 1, 2),
(2, 9, 1, 3);

-- ============================================================================
-- FAVORITOS DE PRUEBA
-- ============================================================================

INSERT INTO user_favorites (user_id, article_id) VALUES
(2, 1),
(2, 2),
(2, 6),
(3, 1),
(3, 9);

-- ============================================================================
-- ÓRDENES DE EJEMPLO (BORRADORES)
-- ============================================================================

INSERT INTO orders (user_id, catalog_id, client_name, status, notes) VALUES
(2, 2, 'Cliente A - Madrid', 'draft', 'Pedido de prueba en borrador'),
(2, 2, 'Cliente B - Madrid', 'confirmed', 'Pedido completado de ejemplo');

-- ============================================================================
-- ÍTEMS DE ORDEN
-- ============================================================================

INSERT INTO order_items (order_id, article_id, quantity, notes) VALUES
(1, 1, 50, 'Solicitado por cliente'),
(1, 2, 30, 'Medicamento principal'),
(2, 1, 100, 'Pedido grande'),
(2, 6, 50, 'Vitaminas');

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- SELECT COUNT(*) FROM users;
-- SELECT COUNT(*) FROM articles;
-- SELECT COUNT(*) FROM catalogs;
-- SELECT COUNT(*) FROM orders;
