/**
 * ArticleService
 * Maneja operaciones CRUD de artículos
 */

import { Pool, QueryResult } from 'pg';

interface Article {
  id: number;
  name: string;
  reference: string;
  description: string;
  description_long?: string;
  category: string;
  subcategory?: string;
  tags: string[];
  state: string;
  image_path?: string;
  composition_json?: any;
  pvpr: number;
  internal_notes?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface CreateArticleInput {
  name: string;
  reference: string;
  description: string;
  description_long?: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  image_path?: string;
  composition_json?: any;
  pvpr: number;
  internal_notes?: string;
  display_order?: number;
}

interface SearchArticlesInput {
  query?: string;
  category?: string;
  state?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export class ArticleService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Crear nuevo artículo
   */
  async createArticle(input: CreateArticleInput, userId: number): Promise<Article> {
    const {
      name,
      reference,
      description,
      description_long,
      category,
      subcategory,
      tags = [],
      image_path,
      composition_json,
      pvpr,
      internal_notes,
      display_order = 0,
    } = input;

    // Validar entrada
    if (!name || !reference || !category || !pvpr) {
      throw new Error('Name, reference, category and price are required');
    }

    try {
      // Verificar si reference ya existe
      const existing = await this.db.query(
        'SELECT id FROM articles WHERE reference = $1',
        [reference]
      );

      if (existing.rows.length > 0) {
        throw new Error('Reference already exists');
      }

      // Insertar artículo
      const result = await this.db.query(
        `INSERT INTO articles 
         (name, reference, description, description_long, category, subcategory, tags, 
          image_path, composition_json, pvpr, internal_notes, display_order, state) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active') 
         RETURNING *`,
        [
          name,
          reference,
          description,
          description_long || null,
          category,
          subcategory || null,
          tags.length > 0 ? tags : [],
          image_path || null,
          composition_json ? JSON.stringify(composition_json) : null,
          pvpr,
          internal_notes || null,
          display_order,
        ]
      );

      const article = result.rows[0];

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
        [userId, 'create_article', 'articles', article.id, JSON.stringify(article)]
      );

      return article;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener artículo por ID
   */
  async getArticleById(articleId: number): Promise<Article | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM articles WHERE id = $1',
        [articleId]
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
   * Obtener artículo por referencia
   */
  async getArticleByReference(reference: string): Promise<Article | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM articles WHERE reference = $1',
        [reference]
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
   * Obtener todos los artículos con filtros
   */
  async getAllArticles(input: SearchArticlesInput = {}): Promise<{ articles: Article[]; total: number }> {
    const {
      query = '',
      category = '',
      state = 'active',
      tags = [],
      limit = 50,
      offset = 0,
    } = input;

    try {
      let whereClause = 'WHERE state = $1';
      const params: any[] = [state];
      let paramIndex = 2;

      if (query) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR reference ILIKE $${paramIndex})`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      if (category) {
        whereClause += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (tags.length > 0) {
        whereClause += ` AND tags @> $${paramIndex}`;
        params.push(tags);
        paramIndex++;
      }

      // Contar total
      const countResult = await this.db.query(
        `SELECT COUNT(*) as total FROM articles ${whereClause}`,
        params
      );

      const total = parseInt(countResult.rows[0].total, 10);

      // Obtener artículos
      const result = await this.db.query(
        `SELECT * FROM articles ${whereClause} ORDER BY display_order, name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return {
        articles: result.rows,
        total,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualizar artículo
   */
  async updateArticle(articleId: number, input: Partial<CreateArticleInput>, userId: number): Promise<Article> {
    try {
      // Obtener artículo actual
      const currentResult = await this.db.query(
        'SELECT * FROM articles WHERE id = $1',
        [articleId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Article not found');
      }

      const current = currentResult.rows[0];

      // Preparar valores a actualizar
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      const fieldsToUpdate: (keyof CreateArticleInput)[] = [
        'name',
        'reference',
        'description',
        'description_long',
        'category',
        'subcategory',
        'tags',
        'image_path',
        'composition_json',
        'pvpr',
        'internal_notes',
        'display_order',
      ];

      for (const field of fieldsToUpdate) {
        if (field in input && input[field] !== undefined) {
          updates.push(`${field} = $${paramIndex}`);
          if (field === 'composition_json' && input[field]) {
            values.push(JSON.stringify(input[field]));
          } else if (field === 'tags') {
            values.push(input[field] || []);
          } else {
            values.push(input[field]);
          }
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        return current;
      }

      // Agregar timestamp
      updates.push(`updated_at = NOW()`);

      // Ejecutar actualización
      values.push(articleId);

      const result = await this.db.query(
        `UPDATE articles SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const updated = result.rows[0];

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [userId, 'update_article', 'articles', articleId, JSON.stringify(current), JSON.stringify(updated)]
      );

      return updated;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cambiar estado de artículo
   */
  async changeArticleState(articleId: number, newState: string, userId: number): Promise<Article> {
    const validStates = ['active', 'hidden', 'promo', 'highlighted'];

    if (!validStates.includes(newState)) {
      throw new Error(`Invalid state. Must be one of: ${validStates.join(', ')}`);
    }

    try {
      const result = await this.db.query(
        'UPDATE articles SET state = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [newState, articleId]
      );

      if (result.rows.length === 0) {
        throw new Error('Article not found');
      }

      const article = result.rows[0];

      // Registrar en audit
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
        [userId, `change_state_${newState}`, 'articles', articleId]
      );

      return article;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener artículos por categoría
   */
  async getArticlesByCategory(category: string): Promise<Article[]> {
    try {
      const result = await this.db.query(
        'SELECT * FROM articles WHERE category = $1 AND state = $2 ORDER BY display_order, name',
        [category, 'active']
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener categorías disponibles
   */
  async getCategories(): Promise<string[]> {
    try {
      const result = await this.db.query(
        'SELECT DISTINCT category FROM articles WHERE state = $1 ORDER BY category',
        ['active']
      );

      return result.rows.map((row) => row.category);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener tags disponibles
   */
  async getAllTags(): Promise<string[]> {
    try {
      const result = await this.db.query(
        `SELECT DISTINCT unnest(tags) as tag FROM articles WHERE state = $1 ORDER BY tag`,
        ['active']
      );

      return result.rows.map((row) => row.tag).filter((tag) => tag);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Eliminar artículo
   */
  async deleteArticle(articleId: number, userId: number): Promise<void> {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Obtener artículo antes de eliminar
        const result = await client.query('SELECT * FROM articles WHERE id = $1', [articleId]);

        if (result.rows.length === 0) {
          throw new Error('Article not found');
        }

        const article = result.rows[0];

        // Eliminar artículo
        await client.query('DELETE FROM articles WHERE id = $1', [articleId]);

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
          [userId, 'delete_article', 'articles', articleId, JSON.stringify(article)]
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

  /**
   * Importar artículos desde CSV
   */
  async importArticlesFromCSV(articles: CreateArticleInput[], userId: number): Promise<{ imported: number; errors: any[] }> {
    const errors: any[] = [];
    let imported = 0;

    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        for (let i = 0; i < articles.length; i++) {
          try {
            const article = articles[i];

            // Validación básica
            if (!article.name || !article.reference || !article.category || article.pvpr === undefined) {
              errors.push({
                row: i + 1,
                error: 'Missing required fields: name, reference, category, pvpr',
              });
              continue;
            }

            // Verificar si reference ya existe
            const existing = await client.query('SELECT id FROM articles WHERE reference = $1', [
              article.reference,
            ]);

            if (existing.rows.length > 0) {
              errors.push({
                row: i + 1,
                error: `Reference ${article.reference} already exists`,
              });
              continue;
            }

            // Insertar
            await client.query(
              `INSERT INTO articles 
               (name, reference, description, description_long, category, subcategory, tags, 
                image_path, composition_json, pvpr, internal_notes, display_order, state) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
              [
                article.name,
                article.reference,
                article.description || '',
                article.description_long || null,
                article.category,
                article.subcategory || null,
                article.tags || [],
                article.image_path || null,
                article.composition_json ? JSON.stringify(article.composition_json) : null,
                article.pvpr,
                article.internal_notes || null,
                article.display_order || 0,
              ]
            );

            imported++;
          } catch (error) {
            errors.push({
              row: i + 1,
              error: (error as Error).message,
            });
          }
        }

        // Registrar en audit
        await client.query(
          'INSERT INTO audit_log (user_id, action, table_name, timestamp) VALUES ($1, $2, $3, NOW())',
          [userId, `import_articles_${imported}`, 'articles']
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

    return { imported, errors };
  }
}
