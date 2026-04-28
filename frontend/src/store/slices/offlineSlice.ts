/**
 * offlineSlice
 * Estado global para sincronización offline/online
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SyncQueue {
  id: string;
  action: string;
  data: any;
  timestamp: number;
  retries: number;
}

interface OfflineState {
  isOnline: boolean;
  lastSync: string | null;
  syncQueue: SyncQueue[];
  isSyncing: boolean;
  syncError: string | null;
  syncProgress: number;
}

const initialState: OfflineState = {
  isOnline: navigator.onLine,
  lastSync: localStorage.getItem('lastSync'),
  syncQueue: JSON.parse(localStorage.getItem('syncQueue') || '[]'),
  isSyncing: false,
  syncError: null,
  syncProgress: 0,
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    /**
     * Setear estado online/offline
     */
    setSyncStatus: (state, action: PayloadAction<{ isOnline: boolean }>) => {
      state.isOnline = action.payload.isOnline;
    },

    /**
     * Añadir acción a cola de sincronización
     */
    addToSyncQueue: (
      state,
      action: PayloadAction<{ action: string; data: any }>
    ) => {
      const item: SyncQueue = {
        id: `${Date.now()}-${Math.random()}`,
        action: action.payload.action,
        data: action.payload.data,
        timestamp: Date.now(),
        retries: 0,
      };

      state.syncQueue.push(item);
      localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue));

      console.log(`📝 Added to sync queue: ${action.payload.action}`, item);
    },

    /**
     * Eliminar item de cola de sincronización
     */
    removeFromSyncQueue: (state, action: PayloadAction<string>) => {
      state.syncQueue = state.syncQueue.filter((item) => item.id !== action.payload);
      localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue));
    },

    /**
     * Incrementar reintentos
     */
    incrementRetries: (state, action: PayloadAction<string>) => {
      const item = state.syncQueue.find((i) => i.id === action.payload);
      if (item) {
        item.retries++;
      }
    },

    /**
     * Iniciar sincronización
     */
    startSync: (state) => {
      state.isSyncing = true;
      state.syncError = null;
      state.syncProgress = 0;
    },

    /**
     * Actualizar progreso de sincronización
     */
    updateSyncProgress: (state, action: PayloadAction<number>) => {
      state.syncProgress = action.payload;
    },

    /**
     * Finalizar sincronización
     */
    finishSync: (state) => {
      state.isSyncing = false;
      state.syncQueue = [];
      state.lastSync = new Date().toISOString();
      state.syncProgress = 100;

      localStorage.removeItem('syncQueue');
      localStorage.setItem('lastSync', state.lastSync);

      console.log('✅ Sync completed');
    },

    /**
     * Error en sincronización
     */
    syncError: (state, action: PayloadAction<string>) => {
      state.isSyncing = false;
      state.syncError = action.payload;
      console.error('❌ Sync error:', action.payload);
    },

    /**
     * Vaciar cola de sincronización
     */
    clearSyncQueue: (state) => {
      state.syncQueue = [];
      state.syncError = null;
      localStorage.removeItem('syncQueue');
    },
  },
});

export const {
  setSyncStatus,
  addToSyncQueue,
  removeFromSyncQueue,
  incrementRetries,
  startSync,
  updateSyncProgress,
  finishSync,
  syncError,
  clearSyncQueue,
} = offlineSlice.actions;

export default offlineSlice.reducer;
