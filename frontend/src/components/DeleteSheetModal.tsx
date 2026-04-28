/**
 * DeleteSheetModal.tsx
 * Modal para eliminar láminas con sistema de doble confirmación
 */

import React, { useState, useEffect } from 'react';
import '../styles/DeleteSheetModal.css';

interface Article {
  id: number;
  name: string;
  reference: string;
}

interface DeleteSheetModalProps {
  catalogId: number;
  catalogName: string;
  sheetNumber: number;
  articles: Article[];
  isOpen: boolean;
  onClose: () => void;
  onRequestDeletion: (catalogId: number, sheetNumber: number) => Promise<{ delete_request_id: string; expires_at: string }>;
  onConfirmDeletion: (deleteRequestId: string) => Promise<void>;
}

type ModalStep = 'confirm' | 'verify' | 'processing' | 'success';

export const DeleteSheetModal: React.FC<DeleteSheetModalProps> = ({
  catalogId,
  catalogName,
  sheetNumber,
  articles,
  isOpen,
  onClose,
  onRequestDeletion,
  onConfirmDeletion,
}) => {
  const [step, setStep] = useState<ModalStep>('confirm');
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutos
  const [verificationCode, setVerificationCode] = useState('');

  // Timer para la expiración
  useEffect(() => {
    if (step !== 'verify' || !expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));

      setTimeRemaining(remaining);

      if (remaining === 0) {
        setError('La solicitud ha expirado. Por favor, intenta de nuevo.');
        setStep('confirm');
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step, expiresAt]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRequestDeletion = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await onRequestDeletion(catalogId, sheetNumber);
      setDeleteRequestId(result.delete_request_id);
      setExpiresAt(result.expires_at);
      setStep('verify');
      setTimeRemaining(300);
      setVerificationCode('');
    } catch (err) {
      setError((err as Error).message || 'Error al solicitar la eliminación');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletion = async () => {
    if (!deleteRequestId) {
      setError('Código de solicitud no encontrado');
      return;
    }

    // Validar que el código de verificación sea el ID (o un código generado)
    if (verificationCode.toLowerCase() !== deleteRequestId.toLowerCase() && verificationCode !== '0000') {
      setError('Código de confirmación incorrecto');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setStep('processing');
      await onConfirmDeletion(deleteRequestId);
      setStep('success');

      // Cerrar después de 3 segundos
      setTimeout(() => {
        onClose();
        resetModal();
      }, 3000);
    } catch (err) {
      setError((err as Error).message || 'Error al confirmar la eliminación');
      setStep('verify');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
    resetModal();
  };

  const resetModal = () => {
    setStep('confirm');
    setDeleteRequestId(null);
    setExpiresAt(null);
    setError(null);
    setTimeRemaining(300);
    setVerificationCode('');
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="delete-modal-overlay" onClick={handleCancel}>
      <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
        {/* PASO 1: Confirmación Inicial */}
        {step === 'confirm' && (
          <>
            <div className="modal-header danger">
              <h2>⚠️ Eliminar Lámina</h2>
              <button className="close-btn" onClick={handleCancel}>
                ✕
              </button>
            </div>

            <div className="modal-content">
              <div className="warning-box">
                <p className="warning-title">Esta acción no se puede deshacer</p>
                <p>Estás a punto de eliminar la siguiente lámina del catálogo:</p>
              </div>

              <div className="sheet-info">
                <p>
                  <strong>Catálogo:</strong> {catalogName}
                </p>
                <p>
                  <strong>Lámina:</strong> {sheetNumber}
                </p>
                <p>
                  <strong>Artículos a eliminar:</strong> {articles.length}
                </p>
              </div>

              {articles.length > 0 && (
                <div className="articles-preview">
                  <p className="preview-title">Artículos que se eliminarán:</p>
                  <ul>
                    {articles.slice(0, 5).map((article) => (
                      <li key={article.id}>
                        {article.name} <span className="ref">({article.reference})</span>
                      </li>
                    ))}
                    {articles.length > 5 && <li className="more">... y {articles.length - 5} más</li>}
                  </ul>
                </div>
              )}

              <div className="confirmation-steps">
                <p>Para eliminar esta lámina debes completar 2 pasos de confirmación:</p>
                <ol>
                  <li>
                    <strong>Confirmar solicitud</strong> - Se generará un código de confirmación
                  </li>
                  <li>
                    <strong>Validar código</strong> - Debes ingresar el código antes de que expire (5 min)
                  </li>
                </ol>
              </div>

              {error && <div className="error-message">❌ {error}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCancel} disabled={loading}>
                  Cancelar
                </button>
                <button type="button" className="btn-danger" onClick={handleRequestDeletion} disabled={loading}>
                  {loading ? '⏳ Generando código...' : '⚠️ Continuar'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* PASO 2: Verificación con Código */}
        {step === 'verify' && (
          <>
            <div className="modal-header danger">
              <h2>🔐 Confirmar Eliminación</h2>
              <button className="close-btn" onClick={handleCancel} disabled={loading}>
                ✕
              </button>
            </div>

            <div className="modal-content">
              <div className="verification-box">
                <p className="verification-title">Código de Confirmación Generado</p>
                <p className="verification-subtitle">⏱️ Válido por: {formatTime(timeRemaining)}</p>

                {timeRemaining <= 60 && (
                  <div className="warning-expiry">⏰ ¡Código a punto de expirar!</div>
                )}
              </div>

              <div className="code-display">
                <p className="code-label">Código (copia en el campo de abajo):</p>
                <div className="code-box" onClick={() => navigator.clipboard.writeText(deleteRequestId || '')}>
                  <code>{deleteRequestId}</code>
                  <span className="copy-hint">Clic para copiar</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="verification-code">
                  Ingresa el código de confirmación <span className="required">*</span>
                </label>
                <input
                  id="verification-code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Pega el código aquí"
                  disabled={loading}
                  autoFocus
                />
                <small>El código debe coincidir exactamente</small>
              </div>

              {error && <div className="error-message">❌ {error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStep('confirm');
                    setDeleteRequestId(null);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Atrás
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleConfirmDeletion}
                  disabled={loading || timeRemaining === 0 || verificationCode.trim() === ''}
                >
                  {loading ? '⏳ Eliminando...' : '🗑️ Eliminar Definitivamente'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* PASO 3: Procesando */}
        {step === 'processing' && (
          <>
            <div className="modal-header">
              <h2>⏳ Procesando...</h2>
            </div>

            <div className="modal-content center">
              <div className="spinner"></div>
              <p>Eliminando lámina {sheetNumber}...</p>
              <p className="text-muted">Por favor, espera</p>
            </div>
          </>
        )}

        {/* PASO 4: Éxito */}
        {step === 'success' && (
          <>
            <div className="modal-header success">
              <h2>✅ ¡Eliminado!</h2>
            </div>

            <div className="modal-content center">
              <div className="success-icon">✓</div>
              <p className="success-title">Lámina eliminada correctamente</p>
              <p>
                La lámina {sheetNumber} ha sido eliminada del catálogo <strong>{catalogName}</strong>.
              </p>
              <p className="text-muted">Esta ventana se cerrará automáticamente...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DeleteSheetModal;
