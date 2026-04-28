/**
 * ordersSlice
 * Estado global de órdenes y carrito con Redux Toolkit
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface OrderItem {
  id?: number;
  article_id: number;
  quantity: number;
  composition_json?: any;
  notes?: string;
  name?: string;
  reference?: string;
  pvpr?: number;
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

interface OrdersState {
  orders: Order[];
  currentOrder: Order | null;
  cartItems: OrderItem[];
  clientName: string;
  catalogId: number | null;
  total: number;
  loading: boolean;
  confirmingOrder: boolean;
  error: string | null;
  successMessage: string | null;
}

interface CreateOrderInput {
  catalog_id: number;
  client_name: string;
  notes?: string;
}

const initialState: OrdersState = {
  orders: [],
  currentOrder: null,
  cartItems: JSON.parse(localStorage.getItem('cartItems') || '[]'),
  clientName: localStorage.getItem('clientName') || '',
  catalogId: localStorage.getItem('catalogId') ? parseInt(localStorage.getItem('catalogId') || '0', 10) : null,
  total: 0,
  loading: false,
  confirmingOrder: false,
  error: null,
  successMessage: null,
};

/**
 * Thunk para crear orden
 */
export const createOrder = createAsyncThunk<Order, CreateOrderInput, { rejectValue: string }>(
  'orders/create',
  async (input, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/api/orders`, input);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to create order');
    }
  }
);

/**
 * Thunk para obtener órdenes del usuario
 */
export const fetchUserOrders = createAsyncThunk<Order[], { status?: string; limit?: number; offset?: number }, { rejectValue: string }>(
  'orders/fetchUserOrders',
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/orders/my-orders`, { params });
      return response.data.orders;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch orders');
    }
  }
);

/**
 * Thunk para obtener orden por ID
 */
export const fetchOrderById = createAsyncThunk<Order, number, { rejectValue: string }>(
  'orders/fetchById',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch order');
    }
  }
);

/**
 * Thunk para añadir item a orden
 */
export const addOrderItem = createAsyncThunk<
  OrderItem,
  { orderId: number; article_id: number; quantity: number; notes?: string },
  { rejectValue: string }
>(
  'orders/addItem',
  async (input, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/api/orders/${input.orderId}/items`, {
        article_id: input.article_id,
        quantity: input.quantity,
        notes: input.notes,
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to add item');
    }
  }
);

/**
 * Thunk para confirmar orden
 */
export const confirmOrder = createAsyncThunk<Order, number, { rejectValue: string }>(
  'orders/confirm',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/api/orders/${orderId}/confirm`);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to confirm order');
    }
  }
);

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    /**
     * Añadir item al carrito local
     */
    addToCart: (state, action: PayloadAction<OrderItem>) => {
      const existingItem = state.cartItems.find((item) => item.article_id === action.payload.article_id);

      if (existingItem) {
        existingItem.quantity += action.payload.quantity;
      } else {
        state.cartItems.push({
          ...action.payload,
          id: undefined,
        });
      }

      localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
      calculateTotal(state);
    },

    /**
     * Actualizar cantidad en carrito
     */
    updateCartItem: (state, action: PayloadAction<{ article_id: number; quantity: number }>) => {
      const item = state.cartItems.find((i) => i.article_id === action.payload.article_id);

      if (item) {
        if (action.payload.quantity <= 0) {
          state.cartItems = state.cartItems.filter((i) => i.article_id !== action.payload.article_id);
        } else {
          item.quantity = action.payload.quantity;
        }
      }

      localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
      calculateTotal(state);
    },

    /**
     * Eliminar item del carrito
     */
    removeFromCart: (state, action: PayloadAction<number>) => {
      state.cartItems = state.cartItems.filter((item) => item.article_id !== action.payload);
      localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
      calculateTotal(state);
    },

    /**
     * Vaciar carrito
     */
    clearCart: (state) => {
      state.cartItems = [];
      state.clientName = '';
      state.catalogId = null;
      state.total = 0;
      localStorage.removeItem('cartItems');
      localStorage.removeItem('clientName');
      localStorage.removeItem('catalogId');
    },

    /**
     * Setear nombre de cliente
     */
    setClientName: (state, action: PayloadAction<string>) => {
      state.clientName = action.payload;
      localStorage.setItem('clientName', action.payload);
    },

    /**
     * Setear catálogo
     */
    setCatalogId: (state, action: PayloadAction<number>) => {
      state.catalogId = action.payload;
      localStorage.setItem('catalogId', action.payload.toString());
    },

    /**
     * Limpiar error
     */
    clearError: (state) => {
      state.error = null;
    },

    /**
     * Limpiar mensaje de éxito
     */
    clearSuccessMessage: (state) => {
      state.successMessage = null;
    },
  },

  extraReducers: (builder) => {
    // Create order
    builder
      .addCase(createOrder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOrder = action.payload;
        state.successMessage = 'Order created successfully';
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to create order';
      });

    // Fetch user orders
    builder
      .addCase(fetchUserOrders.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserOrders.fulfilled, (state, action) => {
        state.loading = false;
        state.orders = action.payload;
      })
      .addCase(fetchUserOrders.rejected, (state) => {
        state.loading = false;
      });

    // Fetch order by ID
    builder
      .addCase(fetchOrderById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOrder = action.payload;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch order';
      });

    // Confirm order
    builder
      .addCase(confirmOrder.pending, (state) => {
        state.confirmingOrder = true;
        state.error = null;
      })
      .addCase(confirmOrder.fulfilled, (state, action) => {
        state.confirmingOrder = false;
        state.currentOrder = action.payload;
        state.successMessage = 'Order confirmed successfully';
      })
      .addCase(confirmOrder.rejected, (state, action) => {
        state.confirmingOrder = false;
        state.error = action.payload || 'Failed to confirm order';
      });
  },
});

/**
 * Calcula el total del carrito
 */
function calculateTotal(state: OrdersState) {
  state.total = state.cartItems.reduce((sum, item) => sum + (item.pvpr || 0) * item.quantity, 0);
}

export const {
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  setClientName,
  setCatalogId,
  clearError,
  clearSuccessMessage,
} = ordersSlice.actions;

export default ordersSlice.reducer;
