/**
 * CatalogService
 * Maneja operaciones CRUD de catálogos
 */

import { Pool, QueryResult } from 'pg';

interface Catalog {
  id: number;
  name: string;
  version: number;
  created_by: number;
  created_at: string;
  published_at: string | null;
  is_draft: boolean;
  description: string;
  article_count?: number;
}

interface CatalogArticle {
  id: number;
  catalog_id: number;
  article_id: number;
  display_order: number;
  sheet_number: number;
}

interface CreateCatalogInput {
  name: string;
  description?: string;
  duplicate_from?: number;
}

export class CatalogService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Crear nuevo catálogo
   */
  async createCatalog(input: CreateCatalogInput, userId: number): Promise<Catalog> {
    const { name, description, duplicate_from } = input;

    if (!name) {
      throw new Error('Catalog name is required');
    }

    try {
      // Iniciar transacción
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Crear catálogo
        const catalogResult = await client.query(
          'INSERT INTO catalogs (name, created_by, is_draft, description) VALUES ($1, $2, TRUE, $3) RETURNING *',
          [name, userId, description || null]
        );

        const catalog = catalogResult.rows[0];

        // Si es duplicado, copiar artículos
        if (duplicate_from) {
          const articlesResult = await client.query(
            'SELECT article_id, display_order, sheet_number FROM catalog_articles WHERE catalog_id = $1',
            [duplicate_from]
          );

          for (const article of articlesResult.rows) {
            await client.query(
              'INSERT INTO catalog_articles (catalog_id, article_id, display_order, sheet_number) VALUES ($1, $2, $3, $4)',
              [catalog.id, article.article_id, article.display_order, article.sheet_number]
            );
          }
        }

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
          [userId, 'create_catalog', 'catalogs', catalog.id, JSON.stringify(catalog)]
        );

        await client.query('COMMIT');

        return catalog;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener catálogo por ID con artículos
   */
  async getCatalogById(catalogId: number): Promise<Catalog | null> {
    try {
      const result = await this.db.query(
        `SELECT c.*, COUNT(ca.id) as article_count 
         FROM catalogs c 
         LEFT JOIN catalog_articles ca ON c.id = ca.catalog_id 
         WHERE c.id = $1 
         GROUP BY c.id`,
        [catalogId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener todos los catálogos
   */
  async getAllCatalogs(limit: number = 50, offset: number = 0): Promise<Catalog[]> {
    try {
      const result = await this.db.query(
        `SELECT c.*, COUNT(ca.id) as article_count 
         FROM catalogs c 
         LEFT JOIN catalog_articles ca ON c.id = ca.catalog_id 
         GROUP BY c.id 
         ORDER BY c.created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualizar catálogo y crear versión
   */
  async updateCatalog(catalogId: number, input: any, userId: number): Promise<Catalog> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Obtener catálogo actual
        const currentResult = await client.query(
          'SELECT * FROM catalogs WHERE id = $1',
          [catalogId]
        );

        if (currentResult.rows.length === 0) {
          throw new Error('Catalog not found');
        }

        const currentCatalog = currentResult.rows[0];

        // Incrementar versión
        const newVersion = (currentCatalog.version || 1) + 1;

        // Actualizar catálogo
        const updateResult = await client.query(
          'UPDATE catalogs SET name = $1, description = $2, version = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
          [input.name || currentCatalog.name, input.description || currentCatalog.description, newVersion, catalogId]
        );

        const updatedCatalog = updateResult.rows[0];

        // Crear versión en historial
        await client.query(
          'INSERT INTO catalog_versions (catalog_id, version_number, snapshot_json, created_by) VALUES ($1, $2, $3, $4)',
          [catalogId, newVersion, JSON.stringify(updatedCatalog), userId]
        );

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
          [userId, 'update_catalog', 'catalogs', catalogId, JSON.stringify(currentCatalog), JSON.stringify(updatedCatalog)]
        );

        await client.query('COMMIT');

        return updatedCatalog;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Publicar catálogo
   */
  async publishCatalog(catalogId: number, userId: number): Promise<Catalog> {
    try {
      const result = await this.db.query(
        'UPDATE catalogs SET is_draft = FALSE, published_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
        [catalogId]
      );

      if (result.rows.length === 0) {
        throw new Error('Catalog not found');
      }

      const catalog = result.rows[0];

      // Crear versión
      await this.db.query(
        'INSERT INTO catalog_versions (catalog_id, version_number, snapshot_json, created_by) VALUES ($1, $2, $3, $4)',
        [catalogId, catalog.version, JSON.stringify(catalog), userId]
      );

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
        [userId, 'publish_catalog', 'catalogs', catalogId]
      );

      return catalog;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener historial de versiones
   */
  async getCatalogVersions(catalogId: number): Promise<any[]> {
    try {
      const result = await this.db.query(
        'SELECT id, version_number, created_at, created_by, change_description FROM catalog_versions WHERE catalog_id = $1 ORDER BY version_number DESC',
        [catalogId]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Revertir a versión anterior
   */
  async revertToVersion(catalogId: number, versionNumber: number, userId: number): Promise<Catalog> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Obtener snapshot de versión
        const versionResult = await client.query(
          'SELECT snapshot_json FROM catalog_versions WHERE catalog_id = $1 AND version_number = $2',
          [catalogId, versionNumber]
        );

        if (versionResult.rows.length === 0) {
          throw new Error('Version not found');
        }

        const snapshot = versionResult.rows[0].snapshot_json;

        // Obtener versión actual
        const currentResult = await client.query(
          'SELECT version FROM catalogs WHERE id = $1',
          [catalogId]
        );

        const currentVersion = currentResult.rows[0].version;

        // Actualizar catálogo con datos de versión anterior
        const updateResult = await client.query(
          'UPDATE catalogs SET name = $1, description = $2, version = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
          [snapshot.name, snapshot.description, currentVersion + 1, catalogId]
        );

        const updatedCatalog = updateResult.rows[0];

        // Registrar nueva versión como reversión
        await client.query(
          'INSERT INTO catalog_versions (catalog_id, version_number, snapshot_json, created_by, change_description) VALUES ($1, $2, $3, $4, $5)',
          [catalogId, currentVersion + 1, JSON.stringify(updatedCatalog), userId, `Reverted to version ${versionNumber}`]
        );

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
          [userId, 'revert_catalog', 'catalogs', catalogId]
        );

        await client.query('COMMIT');

        return updatedCatalog;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Añadir artículo a catálogo
   */
  async addArticleToCatalog(catalogId: number, articleId: number, displayOrder: number, sheetNumber: number = 1): Promise<CatalogArticle> {
    try {
      const result = await this.db.query(
        'INSERT INTO catalog_articles (catalog_id, article_id, display_order, sheet_number) VALUES ($1, $2, $3, $4) RETURNING *',
        [catalogId, articleId, displayOrder, sheetNumber]
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener artículos de catálogo
   */
  async getCatalogArticles(catalogId: number): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT ca.*, a.name, a.reference, a.image_path, a.pvpr, a.tags, a.state 
         FROM catalog_articles ca 
         JOIN articles a ON ca.article_id = a.id 
         WHERE ca.catalog_id = $1 
         ORDER BY ca.sheet_number, ca.display_order`,
        [catalogId]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Eliminar catálogo
   */
  async deleteCatalog(catalogId: number, userId: number): Promise<void> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Eliminar catálogo (cascade elimina artículos)
        await client.query('DELETE FROM catalogs WHERE id = $1', [catalogId]);

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
          [userId, 'delete_catalog', 'catalogs', catalogId]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw error;
    }
  }
}
