/**
 * OrderService
 * Maneja operaciones CRUD de órdenes/pedidos
 */

import { Pool } from 'pg';

interface OrderItem {
  id: number;
  order_id: number;
  article_id: number;
  quantity: number;
  composition_json?: any;
  notes?: string;
  created_at: string;
}

interface Order {
  id: number;
  user_id: number;
  catalog_id: number;
  client_name: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  synced_at?: string;
  items?: OrderItem[];
}

interface CreateOrderInput {
  catalog_id: number;
  client_name: string;
  notes?: string;
}

interface AddOrderItemInput {
  article_id: number;
  quantity: number;
  composition_json?: any;
  notes?: string;
}

export class OrderService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Crear nueva orden
   */
  async createOrder(input: CreateOrderInput, userId: number): Promise<Order> {
    const { catalog_id, client_name, notes } = input;

    if (!catalog_id || !client_name) {
      throw new Error('Catalog ID and client name are required');
    }

    try {
      const result = await this.db.query(
        `INSERT INTO orders (user_id, catalog_id, client_name, status, notes) 
         VALUES ($1, $2, $3, 'draft', $4) 
         RETURNING *`,
        [userId, catalog_id, client_name, notes || null]
      );

      const order = result.rows[0];

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
        [userId, 'create_order', 'orders', order.id, JSON.stringify(order)]
      );

      return order;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener orden por ID con items
   */
  async getOrderById(orderId: number): Promise<Order | null> {
    try {
      const result = await this.db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

      if (result.rows.length === 0) {
        return null;
      }

      const order = result.rows[0];

      // Obtener items
      const itemsResult = await this.db.query(
        `SELECT oi.*, a.name, a.reference, a.pvpr 
         FROM order_items oi 
         JOIN articles a ON oi.article_id = a.id 
         WHERE oi.order_id = $1 
         ORDER BY oi.created_at`,
        [orderId]
      );

      order.items = itemsResult.rows;

      return order;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener órdenes del usuario
   */
  async getUserOrders(userId: number, status?: string, limit: number = 50, offset: number = 0): Promise<Order[]> {
    try {
      let query =
        'SELECT o.*, COUNT(oi.id) as item_count FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.user_id = $1';
      const params: any[] = [userId];

      if (status) {
        query += ' AND o.status = $2';
        params.push(status);
      }

      query += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener todas las órdenes (admin)
   */
  async getAllOrders(status?: string, limit: number = 50, offset: number = 0): Promise<Order[]> {
    try {
      let query =
        'SELECT o.*, u.name as user_name, COUNT(oi.id) as item_count FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id LEFT JOIN users u ON o.user_id = u.id';
      const params: any[] = [];

      if (status) {
        query += ' WHERE o.status = $1';
        params.push(status);
      }

      query += ' GROUP BY o.id, u.name ORDER BY o.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await this.db.query(query, params);

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Añadir item a orden
   */
  async addOrderItem(orderId: number, input: AddOrderItemInput): Promise<OrderItem> {
    const { article_id, quantity, composition_json, notes } = input;

    if (!article_id || !quantity) {
      throw new Error('Article ID and quantity are required');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    try {
      // Verificar que orden existe y está en draft
      const orderResult = await this.db.query('SELECT status FROM orders WHERE id = $1', [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      if (orderResult.rows[0].status !== 'draft') {
        throw new Error('Cannot modify confirmed order');
      }

      // Verificar que artículo existe
      const articleResult = await this.db.query('SELECT id FROM articles WHERE id = $1', [article_id]);

      if (articleResult.rows.length === 0) {
        throw new Error('Article not found');
      }

      // Verificar si item ya existe
      const existingResult = await this.db.query(
        'SELECT id, quantity FROM order_items WHERE order_id = $1 AND article_id = $2',
        [orderId, article_id]
      );

      if (existingResult.rows.length > 0) {
        // Actualizar cantidad
        const newQuantity = existingResult.rows[0].quantity + quantity;
        const updateResult = await this.db.query(
          'UPDATE order_items SET quantity = $1 WHERE order_id = $2 AND article_id = $3 RETURNING *',
          [newQuantity, orderId, article_id]
        );

        return updateResult.rows[0];
      }

      // Crear nuevo item
      const result = await this.db.query(
        `INSERT INTO order_items (order_id, article_id, quantity, composition_json, notes) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [orderId, article_id, quantity, composition_json ? JSON.stringify(composition_json) : null, notes || null]
      );

      // Actualizar order updated_at
      await this.db.query('UPDATE orders SET updated_at = NOW() WHERE id = $1', [orderId]);

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualizar cantidad de item en orden
   */
  async updateOrderItem(orderId: number, itemId: number, quantity: number): Promise<OrderItem> {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    try {
      // Verificar que orden está en draft
      const orderResult = await this.db.query('SELECT status FROM orders WHERE id = $1', [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      if (orderResult.rows[0].status !== 'draft') {
        throw new Error('Cannot modify confirmed order');
      }

      // Actualizar item
      const result = await this.db.query(
        'UPDATE order_items SET quantity = $1 WHERE id = $2 AND order_id = $3 RETURNING *',
        [quantity, itemId, orderId]
      );

      if (result.rows.length === 0) {
        throw new Error('Order item not found');
      }

      // Actualizar order updated_at
      await this.db.query('UPDATE orders SET updated_at = NOW() WHERE id = $1', [orderId]);

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Eliminar item de orden
   */
  async removeOrderItem(orderId: number, itemId: number): Promise<void> {
    try {
      // Verificar que orden está en draft
      const orderResult = await this.db.query('SELECT status FROM orders WHERE id = $1', [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      if (orderResult.rows[0].status !== 'draft') {
        throw new Error('Cannot modify confirmed order');
      }

      // Eliminar item
      await this.db.query('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [itemId, orderId]);

      // Actualizar order updated_at
      await this.db.query('UPDATE orders SET updated_at = NOW() WHERE id = $1', [orderId]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Confirmar orden
   */
  async confirmOrder(orderId: number, userId: number): Promise<Order> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Obtener orden
        const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);

        if (orderResult.rows.length === 0) {
          throw new Error('Order not found');
        }

        const order = orderResult.rows[0];

        if (order.status !== 'draft') {
          throw new Error('Only draft orders can be confirmed');
        }

        // Verificar que hay items
        const itemsResult = await client.query('SELECT COUNT(*) as count FROM order_items WHERE order_id = $1', [orderId]);

        if (parseInt(itemsResult.rows[0].count, 10) === 0) {
          throw new Error('Order must have at least one item');
        }

        // Actualizar estado
        const updateResult = await client.query(
          'UPDATE orders SET status = $1, confirmed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
          ['confirmed', orderId]
        );

        const confirmedOrder = updateResult.rows[0];

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
          [userId, 'confirm_order', 'orders', orderId]
        );

        await client.query('COMMIT');

        return confirmedOrder;
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
   * Marcar orden como enviada
   */
  async markOrderAsSent(orderId: number, userId: number): Promise<Order> {
    try {
      const result = await this.db.query(
        'UPDATE orders SET status = $1, synced_at = NOW(), updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING *',
        ['sent', orderId, 'confirmed']
      );

      if (result.rows.length === 0) {
        throw new Error('Order not found or not confirmed');
      }

      const order = result.rows[0];

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
        [userId, 'mark_order_sent', 'orders', orderId]
      );

      return order;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener resumen de órdenes (estadísticas)
   */
  async getOrderSummary(userId?: number): Promise<any> {
    try {
      let query =
        'SELECT status, COUNT(*) as count, SUM(oi.quantity) as total_items FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id';

      const params: any[] = [];

      if (userId) {
        query += ' WHERE o.user_id = $1';
        params.push(userId);
      }

      query += ' GROUP BY o.status';

      const result = await this.db.query(query, params);

      return result.rows.reduce((acc: any, row: any) => {
        acc[row.status] = {
          count: parseInt(row.count, 10),
          total_items: parseInt(row.total_items, 10) || 0,
        };
        return acc;
      }, {});
    } catch (error) {
      throw error;
    }
  }
}
