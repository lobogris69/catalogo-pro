/**
 * ShareService
 * Maneja envío de catálogos y láminas por email y WhatsApp
 */

import { Pool } from 'pg';
import axios from 'axios';

interface ShareInput {
  catalog_id: number;
  sheet_numbers?: number[]; // Si no se especifica, envía todas las láminas
  recipient_email?: string;
  recipient_phone?: string;
  recipient_name: string;
  message?: string;
}

interface ShareLog {
  id: number;
  user_id: number;
  catalog_id: number;
  share_type: string; // 'email' | 'whatsapp'
  recipient: string;
  status: string; // 'pending' | 'sent' | 'failed'
  created_at: string;
}

export class ShareService {
  private db: Pool;
  private emailProvider: string;
  private whatsappProvider: string;

  constructor(db: Pool) {
    this.db = db;
    this.emailProvider = process.env.EMAIL_PROVIDER || 'sendgrid'; // O mailgun, smtp, etc
    this.whatsappProvider = process.env.WHATSAPP_PROVIDER || 'twilio'; // O vonage, etc
  }

  /**
   * Enviar catálogo/láminas por email
   */
  async shareByEmail(input: ShareInput, userId: number): Promise<ShareLog> {
    const { catalog_id, sheet_numbers, recipient_email, recipient_name, message } = input;

    if (!recipient_email) {
      throw new Error('Email recipient is required');
    }

    if (!this.isValidEmail(recipient_email)) {
      throw new Error('Invalid email format');
    }

    try {
      // Obtener información del catálogo
      const catalogResult = await this.db.query(
        'SELECT id, name, version FROM catalogs WHERE id = $1',
        [catalog_id]
      );

      if (catalogResult.rows.length === 0) {
        throw new Error('Catalog not found');
      }

      const catalog = catalogResult.rows[0];

      // Obtener láminas a enviar
      const sheets = await this.getCatalogSheets(catalog_id, sheet_numbers);

      if (sheets.length === 0) {
        throw new Error('No sheets found to send');
      }

      // Preparar contenido del email
      const emailContent = this.buildEmailContent(catalog, sheets, recipient_name, message);

      // Enviar email
      const emailResult = await this.sendEmail({
        to: recipient_email,
        subject: `Catálogo ${catalog.name} - ${sheets.length} láminas`,
        html: emailContent,
      });

      if (!emailResult.success) {
        throw new Error(`Email send failed: ${emailResult.error}`);
      }

      // Registrar en BD
      const logResult = await this.db.query(
        `INSERT INTO catalog_shares 
         (user_id, catalog_id, share_type, recipient, status, sheet_numbers, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
         RETURNING *`,
        [userId, catalog_id, 'email', recipient_email, 'sent', JSON.stringify(sheet_numbers || [])]
      );

      // Auditoría
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
        [
          userId,
          'share_catalog_email',
          'catalogs',
          catalog_id,
          JSON.stringify({
            recipient: recipient_email,
            sheets: sheet_numbers,
            catalog_name: catalog.name,
          }),
        ]
      );

      return logResult.rows[0];
    } catch (error) {
      // Registrar error
      await this.db.query(
        `INSERT INTO catalog_shares 
         (user_id, catalog_id, share_type, recipient, status, error_msg, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [userId, catalog_id, 'email', recipient_email, 'failed', (error as Error).message]
      );

      throw error;
    }
  }

  /**
   * Enviar catálogo/láminas por WhatsApp
   */
  async shareByWhatsApp(input: ShareInput, userId: number): Promise<ShareLog> {
    const { catalog_id, sheet_numbers, recipient_phone, recipient_name, message } = input;

    if (!recipient_phone) {
      throw new Error('Phone number is required');
    }

    if (!this.isValidPhone(recipient_phone)) {
      throw new Error('Invalid phone format');
    }

    try {
      // Obtener información del catálogo
      const catalogResult = await this.db.query(
        'SELECT id, name, version FROM catalogs WHERE id = $1',
        [catalog_id]
      );

      if (catalogResult.rows.length === 0) {
        throw new Error('Catalog not found');
      }

      const catalog = catalogResult.rows[0];

      // Obtener láminas
      const sheets = await this.getCatalogSheets(catalog_id, sheet_numbers);

      if (sheets.length === 0) {
        throw new Error('No sheets found to send');
      }

      // Preparar mensaje WhatsApp
      const whatsappMessage = this.buildWhatsAppMessage(catalog, sheets, recipient_name, message);

      // Enviar WhatsApp
      const whatsappResult = await this.sendWhatsApp({
        to: recipient_phone,
        message: whatsappMessage,
      });

      if (!whatsappResult.success) {
        throw new Error(`WhatsApp send failed: ${whatsappResult.error}`);
      }

      // Registrar en BD
      const logResult = await this.db.query(
        `INSERT INTO catalog_shares 
         (user_id, catalog_id, share_type, recipient, status, sheet_numbers, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
         RETURNING *`,
        [userId, catalog_id, 'whatsapp', recipient_phone, 'sent', JSON.stringify(sheet_numbers || [])]
      );

      // Auditoría
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, new_data, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())',
        [
          userId,
          'share_catalog_whatsapp',
          'catalogs',
          catalog_id,
          JSON.stringify({
            recipient: recipient_phone,
            sheets: sheet_numbers,
            catalog_name: catalog.name,
          }),
        ]
      );

      return logResult.rows[0];
    } catch (error) {
      // Registrar error
      await this.db.query(
        `INSERT INTO catalog_shares 
         (user_id, catalog_id, share_type, recipient, status, error_msg, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [userId, catalog_id, 'whatsapp', recipient_phone, 'failed', (error as Error).message]
      );

      throw error;
    }
  }

  /**
   * Obtener láminas del catálogo
   */
  private async getCatalogSheets(catalogId: number, sheetNumbers?: number[]): Promise<any[]> {
    let query = `
      SELECT DISTINCT ca.sheet_number, 
             COUNT(ca.id) as article_count,
             json_agg(json_build_object(
               'id', ca.id,
               'name', a.name,
               'reference', a.reference,
               'image_path', a.image_path,
               'pvpr', a.pvpr
             )) as articles
      FROM catalog_articles ca
      JOIN articles a ON ca.article_id = a.id
      WHERE ca.catalog_id = $1
    `;

    const params: any[] = [catalogId];

    if (sheetNumbers && sheetNumbers.length > 0) {
      query += ' AND ca.sheet_number = ANY($2)';
      params.push(sheetNumbers);
    }

    query += ' GROUP BY ca.sheet_number ORDER BY ca.sheet_number';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Construir contenido HTML del email
   */
  private buildEmailContent(catalog: any, sheets: any[], recipientName: string, message?: string): string {
    const sheetsHtml = sheets
      .map(
        (sheet) => `
      <div style="margin-bottom: 30px; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
        <h3 style="color: #1F4E78; margin-bottom: 15px;">Lámina ${sheet.sheet_number}</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
          ${sheet.articles
            .map(
              (article: any) => `
            <div style="text-align: center;">
              ${article.image_path ? `<img src="${article.image_path}" style="max-width: 100%; height: auto; border-radius: 4px;" alt="${article.name}" />` : ''}
              <p style="font-weight: bold; margin: 10px 0 5px 0;">${article.name}</p>
              <p style="font-size: 12px; color: #666; margin: 0;">Ref: ${article.reference}</p>
              <p style="font-size: 14px; color: #1F4E78; font-weight: bold;">€${article.pvpr}</p>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
          .header { background: linear-gradient(135deg, #1F4E78 0%, #2E5C8A 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { max-width: 800px; margin: 0 auto; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏥 CatalogPRO</h1>
          <p>Catálogo Digital de LOMHIFAR</p>
        </div>

        <div class="content">
          <p>Hola <strong>${recipientName}</strong>,</p>

          <p>Te compartimos el catálogo <strong>"${catalog.name}"</strong> (Versión ${catalog.version}) con ${sheets.length} lámina${sheets.length !== 1 ? 's' : ''}.</p>

          ${message ? `<p style="background: #f0f7ff; padding: 15px; border-left: 4px solid #17a2b8; border-radius: 4px;">${message}</p>` : ''}

          <div style="margin: 30px 0;">
            ${sheetsHtml}
          </div>

          <div style="background: #f0fff4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0;"><strong>¿Interesado?</strong></p>
            <p style="margin: 5px 0 0 0;">Contacta con nosotros para realizar tu pedido.</p>
          </div>
        </div>

        <div class="footer">
          <p>Este email fue enviado desde CatalogPRO por LOMHIFAR S.L.</p>
          <p>© 2026 LOMHIFAR S.L. - Todos los derechos reservados</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Construir mensaje WhatsApp
   */
  private buildWhatsAppMessage(catalog: any, sheets: any[], recipientName: string, message?: string): string {
    const articleCount = sheets.reduce((sum: number, sheet: any) => sum + sheet.articles.length, 0);

    let msg = `🏥 *CatalogPRO - LOMHIFAR*\n\n`;
    msg += `Hola ${recipientName},\n\n`;
    msg += `Te compartimos el catálogo *"${catalog.name}"* (Versión ${catalog.version})\n`;
    msg += `📄 ${sheets.length} lámina${sheets.length !== 1 ? 's' : ''} con ${articleCount} artículo${articleCount !== 1 ? 's' : ''}\n\n`;

    if (message) {
      msg += `📝 ${message}\n\n`;
    }

    sheets.forEach((sheet: any) => {
      msg += `\n*Lámina ${sheet.sheet_number}*\n`;
      sheet.articles.slice(0, 5).forEach((article: any) => {
        msg += `• ${article.name} (${article.reference}) - €${article.pvpr}\n`;
      });
      if (sheet.articles.length > 5) {
        msg += `• ... y ${sheet.articles.length - 5} más\n`;
      }
    });

    msg += `\n¿Interesado? Cuéntanos más 📞\n`;
    msg += `#CatalogPRO #LOMHIFAR`;

    return msg;
  }

  /**
   * Enviar email (implementación genérica)
   */
  private async sendEmail(input: { to: string; subject: string; html: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // Aquí iría la integración con SendGrid, Mailgun, etc.
      // Por ahora es un placeholder
      console.log(`📧 Sending email to ${input.to} with subject: ${input.subject}`);

      // En producción, descomentar y configurar:
      // const response = await axios.post(`https://api.sendgrid.com/v3/mail/send`, {
      //   personalizations: [{ to: [{ email: input.to }] }],
      //   from: { email: process.env.SENDGRID_FROM_EMAIL },
      //   subject: input.subject,
      //   content: [{ type: 'text/html', value: input.html }],
      // }, {
      //   headers: { 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}` }
      // });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Enviar WhatsApp (implementación genérica)
   */
  private async sendWhatsApp(input: { to: string; message: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // Aquí iría la integración con Twilio, Vonage, etc.
      console.log(`💬 Sending WhatsApp to ${input.to}`);

      // En producción, descomentar y configurar:
      // const response = await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      //   new URLSearchParams({
      //     From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      //     To: `whatsapp:${input.to}`,
      //     Body: input.message,
      //   }),
      //   {
      //     auth: {
      //       username: process.env.TWILIO_ACCOUNT_SID,
      //       password: process.env.TWILIO_AUTH_TOKEN,
      //     },
      //   }
      // );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Validar email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validar teléfono
   */
  private isValidPhone(phone: string): boolean {
    // Aceptar formatos internacionales: +34612345678, +34 612 345 678, etc.
    const phoneRegex = /^(\+\d{1,3}[\s.-]?)?\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s.-]/g, ''));
  }

  /**
   * Obtener historial de comparticiones
   */
  async getShareHistory(catalogId: number, limit: number = 50, offset: number = 0): Promise<ShareLog[]> {
    try {
      const result = await this.db.query(
        `SELECT id, user_id, catalog_id, share_type, recipient, status, created_at 
         FROM catalog_shares 
         WHERE catalog_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [catalogId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}
