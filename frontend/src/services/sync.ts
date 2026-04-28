/**
 * Sync Service
 * Gestiona sincronización de datos offline/online
 */

import store from '../store';
import {
  setSyncStatus,
  startSync,
  finishSync,
  syncError,
  removeFromSyncQueue,
  updateSyncProgress,
} from '../store/slices/offlineSlice';
import api from './api';
import { articleService, catalogService, orderService, syncLogService } from './db';

export class SyncManager {
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;

  constructor() {
    // Escuchar eventos online/offline
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  /**
   * Conectividad restablecida
   */
  private async handleOnline() {
    console.log('✅ App is back online');
    this.isOnline = true;
    store.dispatch(setSyncStatus({ isOnline: true }));

    // Esperar un poco antes de sincronizar
    setTimeout(() => this.processSyncQueue(), 2000);
  }

  /**
   * Se perdió conectividad
   */
  private handleOffline() {
    console.log('⚠️ App is offline');
    this.isOnline = false;
    store.dispatch(setSyncStatus({ isOnline: false }));
  }

  /**
   * Procesador principal de la cola de sincronización
   */
  async processSyncQueue() {
    if (this.isSyncing || !this.isOnline) {
      return;
    }

    const state = store.getState();
    const queue = state.offline.syncQueue;

    if (queue.length === 0) {
      return;
    }

    this.isSyncing = true;
    store.dispatch(startSync());

    console.log(`🔄 Processing ${queue.length} queued items...`);

    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];

        try {
          console.log(`📤 Syncing: ${item.action}`);

          // Procesar según el tipo de acción
          await this.processSyncItem(item);

          // Eliminar de la cola
          store.dispatch(removeFromSyncQueue(item.id));

          // Actualizar progreso
          const progress = Math.round(((i + 1) / queue.length) * 100);
          store.dispatch(updateSyncProgress(progress));

          console.log(`✅ Synced: ${item.action}`);
        } catch (error) {
          console.error(`❌ Failed to sync ${item.action}:`, error);
          // Continuar con el siguiente item
        }
      }

      // Finalizar
      store.dispatch(finishSync());
      console.log('✅ All items synced!');
    } catch (error) {
      store.dispatch(syncError((error as Error).message));
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Procesa un item individual de la cola
   */
  private async processSyncItem(item: any): Promise<void> {
    switch (item.action) {
      case 'create_order':
        await this.syncCreateOrder(item.data);
        break;

      case 'update_order':
        await this.syncUpdateOrder(item.data);
        break;

      case 'add_order_item':
        await this.syncAddOrderItem(item.data);
        break;

      case 'confirm_order':
        await this.syncConfirmOrder(item.data);
        break;

      case 'sync_articles':
        await this.syncArticles(item.data);
        break;

      case 'sync_catalogs':
        await this.syncCatalogs(item.data);
        break;

      default:
        console.warn(`Unknown sync action: ${item.action}`);
    }
  }

  /**
   * Sincronizar creación de orden
   */
  private async syncCreateOrder(data: any): Promise<void> {
    const response = await api.createOrder(data);
    // Actualizar ID local si es necesario
  }

  /**
   * Sincronizar actualización de orden
   */
  private async syncUpdateOrder(data: any): Promise<void> {
    await api.updateOrderItem(data.order_id, data.item_id, data.quantity);
  }

  /**
   * Sincronizar añadir item a orden
   */
  private async syncAddOrderItem(data: any): Promise<void> {
    await api.addOrderItem(data.order_id, {
      article_id: data.article_id,
      quantity: data.quantity,
      notes: data.notes,
    });
  }

  /**
   * Sincronizar confirmación de orden
   */
  private async syncConfirmOrder(data: any): Promise<void> {
    await api.confirmOrder(data.order_id);
  }

  /**
   * Sincronizar artículos desde servidor
   */
  private async syncArticles(data: any): Promise<void> {
    const response = await api.getArticles({ limit: 1000 });
    await articleService.saveArticles(response.data.articles);
  }

  /**
   * Sincronizar catálogos desde servidor
   */
  private async syncCatalogs(data: any): Promise<void> {
    const response = await api.getCatalogs({ limit: 1000 });
    await catalogService.saveCatalogs(response.data.catalogs);
  }

  /**
   * Descargar datos iniciales
   */
  async downloadInitialData(): Promise<void> {
    if (!this.isOnline) {
      console.log('⚠️ Cannot download data while offline');
      return;
    }

    try {
      console.log('📥 Downloading initial data...');

      store.dispatch(startSync());

      // Obtener artículos
      const articlesResponse = await api.getArticles({ limit: 1000 });
      await articleService.saveArticles(articlesResponse.data.articles);

      // Obtener catálogos
      const catalogsResponse = await api.getCatalogs({ limit: 1000 });
      await catalogService.saveCatalogs(catalogsResponse.data.catalogs);

      // Obtener órdenes del usuario
      const ordersResponse = await api.getMyOrders({ limit: 1000 });
      for (const order of ordersResponse.data.orders) {
        await orderService.saveDraftOrder(order);
      }

      // Registrar sync
      const state = store.getState();
      await syncLogService.logSync({
        user_id: state.auth.user?.id,
        status: 'success',
        synced_records: articlesResponse.data.articles.length,
      });

      store.dispatch(finishSync());
      console.log('✅ Initial data downloaded');
    } catch (error) {
      console.error('❌ Error downloading initial data:', error);
      store.dispatch(syncError((error as Error).message));
    }
  }

  /**
   * Verificar estado de conectividad
   */
  isConnected(): boolean {
    return this.isOnline;
  }

  /**
   * Obtener estado actual
   */
  getStatus(): {
    isOnline: boolean;
    isSyncing: boolean;
    queueLength: number;
  } {
    const state = store.getState();
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      queueLength: state.offline.syncQueue.length,
    };
  }
}

// Singleton
export const syncManager = new SyncManager();

export default syncManager;
