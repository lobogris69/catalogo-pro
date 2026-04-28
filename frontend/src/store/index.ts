/**
 * Redux Store Configuration
 * Configuración principal con todos los slices
 */

import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import authReducer from './slices/authSlice';
import articlesReducer from './slices/articlesSlice';
import ordersReducer from './slices/ordersSlice';
import offlineReducer from './slices/offlineSlice';

// Crear store
export const store = configureStore({
  reducer: {
    auth: authReducer,
    articles: articlesReducer,
    orders: ordersReducer,
    offline: offlineReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignorar timestamps que no son serializables
        ignoredActions: ['offline/addToSyncQueue'],
        ignoredPaths: ['offline.syncQueue'],
      },
    }),
});

// Tipos para TypeScript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

// Hooks con tipos
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector as <T>(
  selector: (state: RootState) => T
) => T;

export default store;
