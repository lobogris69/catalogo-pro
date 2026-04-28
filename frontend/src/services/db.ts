/**
 * IndexedDB Service
 * Almacenamiento local para modo offline
 */

import Dexie, { Table } from 'dexie';

interface CatalogDB extends Dexie {
  articles: Table;
  catalogs: Table;
  catalogArticles: Table;
  orders: Table;
  orderItems: Table;
  syncLog: Table;
}

// Crear base de datos
export const db = new Dexie('CatalogProDB') as CatalogDB;

db.version(1).stores({
  articles: 'id, reference, category, state',
  catalogs: 'id, created_at',
  catalogArticles: 'id, catalog_id, article_id',
  orders: 'id, user_id, status, created_at',
  orderItems: 'id, order_id, article_id',
  syncLog: 'id, user_id, created_at',
});

/**
 * ARTÍCULOS
 */
export const articleService = {
  /**
   * Guardar artículos en IndexedDB
   */
  async saveArticles(articles: any[]): Promise<void> {
    try {
      await db.articles.bulkPut(articles);
      console.log(`✅ Saved ${articles.length} articles to IndexedDB`);
    } catch (error) {
      console.error('❌ Error saving articles:', error);
    }
  },

  /**
   * Obtener todos los artículos
   */
  async getAllArticles(): Promise<any[]> {
    try {
      return await db.articles.toArray();
    } catch (error) {
      console.error('Error getting articles:', error);
      return [];
    }
  },

  /**
   * Obtener artículo por ID
   */
  async getArticleById(id: number): Promise<any | null> {
    try {
      return await db.articles.get(id);
    } catch (error) {
      console.error('Error getting article:', error);
      return null;
    }
  },

  /**
   * Buscar artículos
   */
  async searchArticles(query: string): Promise<any[]> {
    try {
      const articles = await db.articles.toArray();
      const lowerQuery = query.toLowerCase();

      return articles.filter(
        (a) =>
          a.name.toLowerCase().includes(lowerQuery) ||
          a.reference.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('Error searching articles:', error);
      return [];
    }
  },

  /**
   * Obtener artículos por categoría
   */
  async getArticlesByCategory(category: string): Promise<any[]> {
    try {
      return await db.articles.where('category').equals(category).toArray();
    } catch (error) {
      console.error('Error getting articles by category:', error);
      return [];
    }
  },

  /**
   * Limpiar todos los artículos
   */
  async clearArticles(): Promise<void> {
    try {
      await db.articles.clear();
      console.log('✅ Articles cleared from IndexedDB');
    } catch (error) {
      console.error('Error clearing articles:', error);
    }
  },
};

/**
 * CATÁLOGOS
 */
export const catalogService = {
  /**
   * Guardar catálogos
   */
  async saveCatalogs(catalogs: any[]): Promise<void> {
    try {
      await db.catalogs.bulkPut(catalogs);
      console.log(`✅ Saved ${catalogs.length} catalogs to IndexedDB`);
    } catch (error) {
      console.error('Error saving catalogs:', error);
    }
  },

  /**
   * Obtener todos los catálogos
   */
  async getAllCatalogs(): Promise<any[]> {
    try {
      return await db.catalogs.toArray();
    } catch (error) {
      console.error('Error getting catalogs:', error);
      return [];
    }
  },

  /**
   * Obtener catálogo por ID
   */
  async getCatalogById(id: number): Promise<any | null> {
    try {
      return await db.catalogs.get(id);
    } catch (error) {
      console.error('Error getting catalog:', error);
      return null;
    }
  },

  /**
   * Guardar artículos de catálogo
   */
  async saveCatalogArticles(articles: any[]): Promise<void> {
    try {
      await db.catalogArticles.bulkPut(articles);
    } catch (error) {
      console.error('Error saving catalog articles:', error);
    }
  },

  /**
   * Obtener artículos de catálogo
   */
  async getCatalogArticles(catalogId: number): Promise<any[]> {
    try {
      return await db.catalogArticles.where('catalog_id').equals(catalogId).toArray();
    } catch (error) {
      console.error('Error getting catalog articles:', error);
      return [];
    }
  },
};

/**
 * ÓRDENES
 */
export const orderService = {
  /**
   * Guardar borrador de orden
   */
  async saveDraftOrder(order: any): Promise<number> {
    try {
      const id = await db.orders.add(order);
      console.log(`✅ Draft order saved: ${id}`);
      return id as number;
    } catch (error) {
      console.error('Error saving draft order:', error);
      throw error;
    }
  },

  /**
   * Actualizar orden
   */
  async updateOrder(id: number, order: any): Promise<void> {
    try {
      await db.orders.update(id, order);
      console.log(`✅ Order updated: ${id}`);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  },

  /**
   * Obtener orden por ID
   */
  async getOrderById(id: number): Promise<any | null> {
    try {
      return await db.orders.get(id);
    } catch (error) {
      console.error('Error getting order:', error);
      return null;
    }
  },

  /**
   * Obtener borradores locales
   */
  async getDraftOrders(): Promise<any[]> {
    try {
      return await db.orders.where('status').equals('draft').toArray();
    } catch (error) {
      console.error('Error getting draft orders:', error);
      return [];
    }
  },

  /**
   * Obtener todas las órdenes
   */
  async getAllOrders(): Promise<any[]> {
    try {
      return await db.orders.toArray();
    } catch (error) {
      console.error('Error getting orders:', error);
      return [];
    }
  },

  /**
   * Eliminar orden
   */
  async deleteOrder(id: number): Promise<void> {
    try {
      await db.orders.delete(id);
      await db.orderItems.where('order_id').equals(id).delete();
      console.log(`✅ Order deleted: ${id}`);
    } catch (error) {
      console.error('Error deleting order:', error);
    }
  },

  /**
   * Guardar item de orden
   */
  async saveOrderItem(item: any): Promise<number> {
    try {
      return (await db.orderItems.add(item)) as number;
    } catch (error) {
      console.error('Error saving order item:', error);
      throw error;
    }
  },

  /**
   * Obtener items de orden
   */
  async getOrderItems(orderId: number): Promise<any[]> {
    try {
      return await db.orderItems.where('order_id').equals(orderId).toArray();
    } catch (error) {
      console.error('Error getting order items:', error);
      return [];
    }
  },

  /**
   * Eliminar item de orden
   */
  async deleteOrderItem(id: number): Promise<void> {
    try {
      await db.orderItems.delete(id);
    } catch (error) {
      console.error('Error deleting order item:', error);
    }
  },

  /**
   * Limpiar órdenes
   */
  async clearOrders(): Promise<void> {
    try {
      await db.orders.clear();
      await db.orderItems.clear();
      console.log('✅ Orders cleared from IndexedDB');
    } catch (error) {
      console.error('Error clearing orders:', error);
    }
  },
};

/**
 * SYNC LOG
 */
export const syncLogService = {
  /**
   * Registrar sincronización
   */
  async logSync(log: any): Promise<number> {
    try {
      return (await db.syncLog.add({
        ...log,
        created_at: new Date().toISOString(),
      })) as number;
    } catch (error) {
      console.error('Error logging sync:', error);
      throw error;
    }
  },

  /**
   * Obtener último sync
   */
  async getLastSync(userId: number): Promise<any | null> {
    try {
      const logs = await db.syncLog.where('user_id').equals(userId).reverse().limit(1).toArray();
      return logs.length > 0 ? logs[0] : null;
    } catch (error) {
      console.error('Error getting last sync:', error);
      return null;
    }
  },
};

/**
 * UTILIDADES
 */
export const dbUtils = {
  /**
   * Obtener tamaño de base de datos
   */
  async getDatabaseSize(): Promise<any> {
    try {
      const articles = await db.articles.count();
      const catalogs = await db.catalogs.count();
      const orders = await db.orders.count();
      const orderItems = await db.orderItems.count();

      return {
        articles,
        catalogs,
        orders,
        orderItems,
        total: articles + catalogs + orders + orderItems,
      };
    } catch (error) {
      console.error('Error getting database size:', error);
      return null;
    }
  },

  /**
   * Limpiar toda la BD
   */
  async clearAllData(): Promise<void> {
    try {
      await db.delete();
      await db.open();
      console.log('✅ All IndexedDB data cleared');
    } catch (error) {
      console.error('Error clearing database:', error);
    }
  },

  /**
   * Exportar datos (para backup)
   */
  async exportData(): Promise<any> {
    try {
      return {
        articles: await db.articles.toArray(),
        catalogs: await db.catalogs.toArray(),
        orders: await db.orders.toArray(),
        orderItems: await db.orderItems.toArray(),
        exported_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  },

  /**
   * Importar datos
   */
  async importData(data: any): Promise<void> {
    try {
      if (data.articles) await db.articles.bulkPut(data.articles);
      if (data.catalogs) await db.catalogs.bulkPut(data.catalogs);
      if (data.orders) await db.orders.bulkPut(data.orders);
      if (data.orderItems) await db.orderItems.bulkPut(data.orderItems);
      console.log('✅ Data imported successfully');
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  },
};
