/**
 * ShareService
 * Maneja envío de catálogos y láminas por email y WhatsApp
 */

import { Pool } from 'pg';
import axios from 'axios';
import nodemailer from 'nodemailer';

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
      throw new Error('Phone recipient is required');
    }

    if (!this.isValidPhone(recipient_phone)) {
      throw new Error('Invalid phone format');
    }

    try {
      const catalogResult = await this.db.query(
        'SELECT id, name, version FROM catalogs WHERE id = $1',
        [catalog_id]
      );

      if (catalogResult.rows.length === 0) {
        throw new Error('Catalog not found');
      }

      const catalog = catalogResult.rows[0];

      const sheets = await this.getCatalogSheets(catalog_id, sheet_numbers);

      if (sheets.length === 0) {
        throw new Error('No sheets found to send');
      }

      const whatsappMessage = this.buildWhatsAppMessage(catalog, sheets, recipient_name, message);

      const whatsappResult = await this.sendWhatsApp({
        to: recipient_phone,
        message: whatsappMessage,
      });

      if (!whatsappResult.success) {
        throw new Error(`WhatsApp send failed: ${whatsappResult.error}`);
      }

      const logResult = await this.db.query(
        `INSERT INTO catalog_shares 
         (user_id, catalog_id, share_type, recipient, status, sheet_numbers, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
         RETURNING *`,
        [userId, catalog_id, 'whatsapp', recipient_phone, 'sent', JSON.stringify(sheet_numbers || [])]
      );

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
      SELECT ca.sheet_number, 
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
    let sheetsHtml = '';

    sheets.forEach((sheet: any) => {
      let articlesHtml = '';
      sheet.articles.forEach((article: any) => {
        articlesHtml += `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${article.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${article.reference}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">€${article.pvpr || '-'}</td>
          </tr>
        `;
      });

      sheetsHtml += `
        <div style="margin-bottom: 30px; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #17a2b8; margin-top: 0;">Lámina ${sheet.sheet_number}</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px; text-align: left;">Artículo</th>
                <th style="padding: 10px; text-align: left;">Referencia</th>
                <th style="padding: 10px; text-align: right;">PVP</th>
              </tr>
            </thead>
            <tbody>
              ${articlesHtml}
            </tbody>
          </table>
        </div>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; padding: 20px; }
          .header { background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
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
   * Enviar email por SMTP (Gmail), mismo método que el Gestor PNT
   */
  private async sendEmail(input: { to: string; subject: string; html: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // Envio real por SMTP (Gmail), mismo metodo que el Gestor PNT.
      // Railway permite SMTP en plan Pro. Variables: SMTP_HOST/PORT/USER/PASS/FROM.
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || user;

      if (!user || !pass) {
        console.error('SMTP no configurado: faltan SMTP_USER o SMTP_PASS');
        return { success: false, error: 'SMTP no configurado (faltan credenciales)' };
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure, // true para 465, false para 587
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });

      console.log(`Email enviado a ${input.to} (id: ${info.messageId})`);
      return { success: true };
    } catch (error) {
      console.error('Error enviando email:', (error as Error).message);
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
        `SELECT cs.*, u.name as user_name 
         FROM catalog_shares cs 
         LEFT JOIN users u ON cs.user_id = u.id 
         WHERE cs.catalog_id = $1 
         ORDER BY cs.created_at DESC 
         LIMIT $2 OFFSET $3`,
        [catalogId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}
