/**
 * articlesSlice
 * Estado global de artículos con Redux Toolkit
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

interface ArticlesState {
  items: Article[];
  total: number;
  categories: string[];
  tags: string[];
  loading: boolean;
  error: string | null;
  filters: {
    query: string;
    category: string;
    state: string;
    tags: string[];
  };
  favorites: number[];
}

interface FetchArticlesParams {
  query?: string;
  category?: string;
  state?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

const initialState: ArticlesState = {
  items: [],
  total: 0,
  categories: [],
  tags: [],
  loading: false,
  error: null,
  filters: {
    query: '',
    category: '',
    state: 'active',
    tags: [],
  },
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
};

/**
 * Thunk para obtener artículos
 */
export const fetchArticles = createAsyncThunk<
  { articles: Article[]; total: number },
  FetchArticlesParams,
  { rejectValue: string }
>(
  'articles/fetchArticles',
  async (params, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/articles`, { params });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch articles');
    }
  }
);

/**
 * Thunk para obtener categorías
 */
export const fetchCategories = createAsyncThunk<string[], void, { rejectValue: string }>(
  'articles/fetchCategories',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/articles/categories`);
      return response.data.categories;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch categories');
    }
  }
);

/**
 * Thunk para obtener tags
 */
export const fetchTags = createAsyncThunk<string[], void, { rejectValue: string }>(
  'articles/fetchTags',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/articles/tags`);
      return response.data.tags;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch tags');
    }
  }
);

/**
 * Thunk para buscar artículos
 */
export const searchArticles = createAsyncThunk<
  { articles: Article[]; total: number },
  string,
  { rejectValue: string }
>(
  'articles/search',
  async (query, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/api/articles/search`, {
        params: { q: query },
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Search failed');
    }
  }
);

const articlesSlice = createSlice({
  name: 'articles',
  initialState,
  reducers: {
    /**
     * Actualizar filtros
     */
    setFilters: (
      state,
      action: PayloadAction<Partial<ArticlesState['filters']>>
    ) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    /**
     * Limpiar filtros
     */
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },

    /**
     * Togglear favorito
     */
    toggleFavorite: (state, action: PayloadAction<number>) => {
      const articleId = action.payload;
      const index = state.favorites.indexOf(articleId);

      if (index > -1) {
        state.favorites.splice(index, 1);
      } else {
        state.favorites.push(articleId);
      }

      localStorage.setItem('favorites', JSON.stringify(state.favorites));
    },

    /**
     * Añadir a favoritos
     */
    addFavorite: (state, action: PayloadAction<number>) => {
      if (!state.favorites.includes(action.payload)) {
        state.favorites.push(action.payload);
        localStorage.setItem('favorites', JSON.stringify(state.favorites));
      }
    },

    /**
     * Quitar de favoritos
     */
    removeFavorite: (state, action: PayloadAction<number>) => {
      state.favorites = state.favorites.filter((id) => id !== action.payload);
      localStorage.setItem('favorites', JSON.stringify(state.favorites));
    },

    /**
     * Limpiar error
     */
    clearError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    // Fetch articles
    builder
      .addCase(fetchArticles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchArticles.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.articles;
        state.total = action.payload.total;
        state.error = null;
      })
      .addCase(fetchArticles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to load articles';
      });

    // Fetch categories
    builder
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
      })
      .addCase(fetchCategories.rejected, (state) => {
        state.categories = [];
      });

    // Fetch tags
    builder
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tags = action.payload;
      })
      .addCase(fetchTags.rejected, (state) => {
        state.tags = [];
      });

    // Search articles
    builder
      .addCase(searchArticles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(searchArticles.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.articles;
        state.total = action.payload.total;
      })
      .addCase(searchArticles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Search failed';
      });
  },
});

export const {
  setFilters,
  clearFilters,
  toggleFavorite,
  addFavorite,
  removeFavorite,
  clearError,
} = articlesSlice.actions;

export default articlesSlice.reducer;
