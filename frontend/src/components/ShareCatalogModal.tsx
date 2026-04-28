/**
 * ShareCatalogModal.tsx
 * Modal para compartir catálogos/láminas por email y WhatsApp
 */

import React, { useState, useEffect } from 'react';
import '../styles/ShareCatalogModal.css';

interface Sheet {
  sheet_number: number;
  article_count: number;
}

interface ShareCatalogModalProps {
  catalogId: number;
  catalogName: string;
  sheets: Sheet[];
  isOpen: boolean;
  onClose: () => void;
  onShare: (data: ShareData) => Promise<void>;
}

interface ShareData {
  catalog_id: number;
  share_type: 'email' | 'whatsapp';
  recipient_email?: string;
  recipient_phone?: string;
  recipient_name: string;
  sheet_numbers: number[];
  message?: string;
}

export const ShareCatalogModal: React.FC<ShareCatalogModalProps> = ({
  catalogId,
  catalogName,
  sheets,
  isOpen,
  onClose,
  onShare,
}) => {
  const [shareType, setShareType] = useState<'email' | 'whatsapp'>('email');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [message, setMessage] = useState('');
  const [selectedSheets, setSelectedSheets] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [allSheetsSelected, setAllSheetsSelected] = useState(true);

  // Al cambiar shareType, limpiar campos del otro tipo
  useEffect(() => {
    if (shareType === 'email') {
      setRecipientPhone('');
    } else {
      setRecipientEmail('');
    }
  }, [shareType]);

  // Actualizar selectedSheets cuando allSheetsSelected cambia
  useEffect(() => {
    if (allSheetsSelected) {
      setSelectedSheets(sheets.map((s) => s.sheet_number));
    } else {
      setSelectedSheets([]);
    }
  }, [allSheetsSelected, sheets]);

  const handleSheetToggle = (sheetNumber: number) => {
    setSelectedSheets((prev) =>
      prev.includes(sheetNumber) ? prev.filter((s) => s !== sheetNumber) : [...prev, sheetNumber]
    );
  };

  const validateForm = (): boolean => {
    if (!recipientName.trim()) {
      setError('Nombre del destinatario requerido');
      return false;
    }

    if (shareType === 'email') {
      if (!recipientEmail.trim()) {
        setError('Email requerido');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipientEmail)) {
        setError('Email inválido');
        return false;
      }
    } else {
      if (!recipientPhone.trim()) {
        setError('Teléfono requerido');
        return false;
      }
    }

    if (selectedSheets.length === 0) {
      setError('Selecciona al menos una lámina');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const shareData: ShareData = {
        catalog_id: catalogId,
        share_type: shareType,
        recipient_name: recipientName,
        sheet_numbers: selectedSheets,
        message: message.trim(),
      };

      if (shareType === 'email') {
        shareData.recipient_email = recipientEmail;
      } else {
        shareData.recipient_phone = recipientPhone;
      }

      await onShare(shareData);

      setSuccess(true);
      setRecipientName('');
      setRecipientEmail('');
      setRecipientPhone('');
      setMessage('');
      setAllSheetsSelected(true);

      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError((err as Error).message || 'Error al compartir catálogo');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📤 Compartir Catálogo</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Información del catálogo */}
          <div className="catalog-info">
            <p>
              <strong>{catalogName}</strong> ({sheets.length} láminas)
            </p>
          </div>

          {/* Tipo de compartición */}
          <div className="form-group">
            <label>Enviar por:</label>
            <div className="share-type-buttons">
              <button
                type="button"
                className={`share-type-btn ${shareType === 'email' ? 'active' : ''}`}
                onClick={() => setShareType('email')}
              >
                📧 Email
              </button>
              <button
                type="button"
                className={`share-type-btn ${shareType === 'whatsapp' ? 'active' : ''}`}
                onClick={() => setShareType('whatsapp')}
              >
                💬 WhatsApp
              </button>
            </div>
          </div>

          {/* Datos del destinatario */}
          <div className="form-group">
            <label htmlFor="recipient-name">
              Nombre del Destinatario <span className="required">*</span>
            </label>
            <input
              id="recipient-name"
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="ej. Juan García"
              required
            />
          </div>

          {shareType === 'email' ? (
            <div className="form-group">
              <label htmlFor="recipient-email">
                Email <span className="required">*</span>
              </label>
              <input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="ej. juan@example.com"
                required={shareType === 'email'}
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="recipient-phone">
                Teléfono <span className="required">*</span>
              </label>
              <input
                id="recipient-phone"
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="ej. +34 612 345 678"
                required={shareType === 'whatsapp'}
              />
              <small>Incluye código de país</small>
            </div>
          )}

          {/* Selección de láminas */}
          <div className="form-group">
            <label>Láminas a Compartir:</label>

            <div className="select-all-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={allSheetsSelected}
                  onChange={(e) => setAllSheetsSelected(e.target.checked)}
                />
                <span>Todas las láminas ({sheets.length})</span>
              </label>
            </div>

            {!allSheetsSelected && (
              <div className="sheets-list">
                {sheets.map((sheet) => (
                  <label key={sheet.sheet_number} className="checkbox-label sheet-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedSheets.includes(sheet.sheet_number)}
                      onChange={() => handleSheetToggle(sheet.sheet_number)}
                    />
                    <span>
                      Lámina {sheet.sheet_number} ({sheet.article_count} artículos)
                    </span>
                  </label>
                ))}
              </div>
            )}

            <p className="sheets-count">
              📄 {selectedSheets.length} lámina{selectedSheets.length !== 1 ? 's' : ''} seleccionada{selectedSheets.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Mensaje opcional */}
          <div className="form-group">
            <label htmlFor="message">Mensaje Personalizado (opcional):</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Añade un mensaje personalizado al catálogo..."
              rows={3}
              maxLength={500}
            />
            <small>{message.length}/500 caracteres</small>
          </div>

          {/* Mensajes de error y éxito */}
          {error && <div className="error-message">❌ {error}</div>}
          {success && <div className="success-message">✅ Catálogo compartido exitosamente</div>}

          {/* Botones de acción */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '📤 Enviando...' : '📤 Compartir Catálogo'}
            </button>
          </div>

          {/* Nota de privacidad */}
          <div className="privacy-note">
            <small>🔒 Los datos de los destinatarios se guardan solo con fines de auditoría.</small>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShareCatalogModal;
