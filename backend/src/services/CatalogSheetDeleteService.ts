/**
 * CatalogSheetDeleteService
 * Elimina láminas de catálogos con confirmación doble para evitar borrados accidentales
 */

import { Pool } from 'pg';

interface DeleteRequest {
  id: string;
  catalog_id: number;
  sheet_number: number;
  created_at: string;
  expires_at: string;
  status: string; // 'pending' | 'confirmed' | 'cancelled' | 'expired'
}

interface SheetInfo {
  sheet_number: number;
  article_count: number;
  articles: Array<{
    id: number;
    name: string;
    reference: string;
  }>;
}

export class CatalogSheetDeleteService {
  private db: Pool;
  private DELETE_REQUEST_TIMEOUT: number = 5 * 60 * 1000; // 5 minutos

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Crear solicitud de eliminación (Paso 1)
   * Devuelve un código de confirmación que el usuario debe re-enviar
   */
  async requestSheetDeletion(
    catalogId: number,
    sheetNumber: number,
    userId: number
  ): Promise<DeleteRequest> {
    try {
      // Verificar que el catálogo existe
      const catalogResult = await this.db.query(
        'SELECT id, is_draft FROM catalogs WHERE id = $1',
        [catalogId]
      );

      if (catalogResult.rows.length === 0) {
        throw new Error('Catalog not found');
      }

      // Verificar que la lámina existe
      const sheetResult = await this.db.query(
        'SELECT COUNT(*) as count FROM catalog_articles WHERE catalog_id = $1 AND sheet_number = $2',
        [catalogId, sheetNumber]
      );

      if (parseInt(sheetResult.rows[0].count, 10) === 0) {
        throw new Error('Sheet not found in catalog');
      }

      // Crear solicitud de eliminación pendiente
      const deleteRequestId = `del_${catalogId}_${sheetNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + this.DELETE_REQUEST_TIMEOUT);

      // Guardar en tabla temporal
      const result = await this.db.query(
        `INSERT INTO catalog_delete_requests 
         (delete_request_id, catalog_id, sheet_number, user_id, status, created_at, expires_at) 
         VALUES ($1, $2, $3, $4, 'pending', NOW(), $5) 
         RETURNING *`,
        [deleteRequestId, catalogId, sheetNumber, userId, expiresAt]
      );

      console.log(`🗑️ Delete request created: ${deleteRequestId} for sheet ${sheetNumber} of catalog ${catalogId}`);

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Confirmar eliminación (Paso 2)
   * Requiere el código de confirmación exacto del Paso 1
   */
  async confirmSheetDeletion(deleteRequestId: string, userId: number): Promise<{ success: boolean; message: string }> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Obtener solicitud de eliminación
      const requestResult = await client.query(
        `SELECT * FROM catalog_delete_requests 
         WHERE delete_request_id = $1 AND user_id = $2`,
        [deleteRequestId, userId]
      );

      if (requestResult.rows.length === 0) {
        throw new Error('Delete request not found or unauthorized');
      }

      const deleteRequest = requestResult.rows[0];

      // Validar que no haya expirado
      if (new Date(deleteRequest.expires_at) < new Date()) {
        await client.query(
          'UPDATE catalog_delete_requests SET status = $1 WHERE delete_request_id = $2',
          ['expired', deleteRequestId]
        );
        throw new Error('Delete request has expired. Please request a new one.');
      }

      // Validar que no haya sido cancelado
      if (deleteRequest.status !== 'pending') {
        throw new Error(`Delete request is already ${deleteRequest.status}`);
      }

      // Obtener información de la lámina antes de eliminar
      const sheetInfo = await client.query(
        `SELECT ca.sheet_number,
                COUNT(ca.id) as article_count,
                json_agg(json_build_object('id', ca.id, 'name', a.name, 'reference', a.reference)) as articles
         FROM catalog_articles ca
         JOIN articles a ON ca.article_id = a.id
         WHERE ca.catalog_id = $1 AND ca.sheet_number = $2
         GROUP BY ca.sheet_number`,
        [deleteRequest.catalog_id, deleteRequest.sheet_number]
      );

      if (sheetInfo.rows.length === 0) {
        throw new Error('Sheet not found');
      }

      const sheet = sheetInfo.rows[0];

      // ELIMINAR artículos de la lámina
      const deleteResult = await client.query(
        `DELETE FROM catalog_articles 
         WHERE catalog_id = $1 AND sheet_number = $2 
         RETURNING id`,
        [deleteRequest.catalog_id, deleteRequest.sheet_number]
      );

      const deletedCount = deleteResult.rows.length;

      // Actualizar solicitud a confirmada
      await client.query(
        'UPDATE catalog_delete_requests SET status = $1 WHERE delete_request_id = $2',
        ['confirmed', deleteRequestId]
      );

      // Registrar en auditoría
      await client.query(
        `INSERT INTO audit_log 
         (user_id, action, table_name, record_id, old_data, timestamp) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          userId,
          'delete_catalog_sheet',
          'catalog_articles',
          deleteRequest.catalog_id,
          JSON.stringify({
            sheet_number: deleteRequest.sheet_number,
            deleted_articles_count: deletedCount,
            articles: sheet.articles,
          }),
        ]
      );

      // Incrementar versión del catálogo (registrar cambio)
      await client.query(
        `UPDATE catalogs 
         SET version = version + 1, updated_at = NOW() 
         WHERE id = $1`,
        [deleteRequest.catalog_id]
      );

      // Crear versión en historial
      const catalogResult = await client.query(
        'SELECT * FROM catalogs WHERE id = $1',
        [deleteRequest.catalog_id]
      );

      const catalog = catalogResult.rows[0];

      await client.query(
        `INSERT INTO catalog_versions 
         (catalog_id, version_number, snapshot_json, created_by, change_description) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          deleteRequest.catalog_id,
          catalog.version,
          JSON.stringify(catalog),
          userId,
          `Deleted sheet ${deleteRequest.sheet_number} with ${deletedCount} articles`,
        ]
      );

      await client.query('COMMIT');

      console.log(`✅ Sheet ${deleteRequest.sheet_number} deleted successfully from catalog ${deleteRequest.catalog_id}`);

      return {
        success: true,
        message: `Sheet ${deleteRequest.sheet_number} with ${deletedCount} articles has been successfully deleted.`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancelar solicitud de eliminación
   */
  async cancelDeletion(deleteRequestId: string, userId: number): Promise<void> {
    try {
      const result = await this.db.query(
        `UPDATE catalog_delete_requests 
         SET status = 'cancelled' 
         WHERE delete_request_id = $1 AND user_id = $2 AND status = 'pending'
         RETURNING *`,
        [deleteRequestId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Delete request not found, unauthorized, or already processed');
      }

      console.log(`❌ Delete request cancelled: ${deleteRequestId}`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener información de la lámina a eliminar
   */
  async getSheetInfo(catalogId: number, sheetNumber: number): Promise<SheetInfo | null> {
    try {
      const result = await this.db.query(
        `SELECT ca.sheet_number,
                COUNT(ca.id) as article_count,
                json_agg(json_build_object(
                  'id', ca.id,
                  'name', a.name,
                  'reference', a.reference
                )) as articles
         FROM catalog_articles ca
         JOIN articles a ON ca.article_id = a.id
         WHERE ca.catalog_id = $1 AND ca.sheet_number = $2
         GROUP BY ca.sheet_number`,
        [catalogId, sheetNumber]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        sheet_number: result.rows[0].sheet_number,
        article_count: parseInt(result.rows[0].article_count, 10),
        articles: result.rows[0].articles,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Limpiar solicitudes expiradas (ejecutar periódicamente)
   */
  async cleanupExpiredRequests(): Promise<number> {
    try {
      const result = await this.db.query(
        `UPDATE catalog_delete_requests 
         SET status = 'expired' 
         WHERE status = 'pending' AND expires_at < NOW()
         RETURNING id`
      );

      const expiredCount = result.rows.length;

      if (expiredCount > 0) {
        console.log(`🧹 Cleaned up ${expiredCount} expired delete requests`);
      }

      return expiredCount;
    } catch (error) {
      console.error('Error cleaning up expired requests:', error);
      return 0;
    }
  }

  /**
   * Obtener historial de solicitudes de eliminación
   */
  async getDeleteRequestHistory(catalogId: number, limit: number = 50): Promise<DeleteRequest[]> {
    try {
      const result = await this.db.query(
        `SELECT delete_request_id as id, catalog_id, sheet_number, created_at, expires_at, status 
         FROM catalog_delete_requests 
         WHERE catalog_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [catalogId, limit]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener todas las solicitudes pendientes del usuario
   */
  async getPendingRequests(userId: number): Promise<
    Array<{
      delete_request_id: string;
      catalog_id: number;
      sheet_number: number;
      created_at: string;
      expires_in_seconds: number;
      articles_count: number;
    }>
  > {
    try {
      const result = await this.db.query(
        `SELECT cdr.delete_request_id,
                cdr.catalog_id,
                cdr.sheet_number,
                cdr.created_at,
                EXTRACT(EPOCH FROM (cdr.expires_at - NOW()))::INTEGER as expires_in_seconds,
                COUNT(ca.id) as articles_count
         FROM catalog_delete_requests cdr
         LEFT JOIN catalog_articles ca ON cdr.catalog_id = ca.catalog_id AND cdr.sheet_number = ca.sheet_number
         WHERE cdr.user_id = $1 AND cdr.status = 'pending'
         GROUP BY cdr.delete_request_id, cdr.catalog_id, cdr.sheet_number, cdr.created_at, cdr.expires_at
         ORDER BY cdr.created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}
