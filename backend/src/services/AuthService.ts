/**
 * AuthService
 * Maneja login, registro y verificación de JWT
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool, QueryResult } from 'pg';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData extends LoginCredentials {
  name: string;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface JWTPayload {
  id: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export class AuthService {
  private db: Pool;
  private jwtSecret: string;
  private jwtExpiry: string;

  constructor(db: Pool) {
    this.db = db;
    this.jwtSecret = process.env.JWT_SECRET || 'your_secret_change_me';
    this.jwtExpiry = process.env.JWT_EXPIRY || '7d';
  }

  /**
   * Login con email y contraseña
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { email, password } = credentials;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    try {
      // Buscar usuario
      const result: QueryResult = await this.db.query(
        'SELECT id, email, password_hash, role, name FROM users WHERE email = $1 AND is_active = TRUE',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Verificar contraseña
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        throw new Error('Invalid email or password');
      }

      // Generar JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        this.jwtSecret,
        { expiresIn: this.jwtExpiry }
      );

      // Registrar en audit_log
      await this.db.query(
        'INSERT INTO audit_log (action, table_name, record_id, timestamp) VALUES ($1, $2, $3, NOW())',
        ['login', 'users', user.id]
      );

      // Retornar respuesta
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Registrar nuevo usuario
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const { email, password, name } = data;

    // Validar entrada
    if (!email || !password || !name) {
      throw new Error('Email, password and name are required');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    try {
      // Verificar si email ya existe
      const existingUser = await this.db.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Hash de contraseña
      const passwordHash = await bcrypt.hash(password, 10);

      // Insertar usuario
      const result = await this.db.query(
        'INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, email, name, role',
        [email.toLowerCase(), passwordHash, name, 'sales']
      );

      const newUser = result.rows[0];

      // Generar JWT
      const token = jwt.sign(
        {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
        this.jwtSecret,
        { expiresIn: this.jwtExpiry }
      );

      // Registrar en audit_log
      await this.db.query(
        'INSERT INTO audit_log (action, table_name, record_id, timestamp) VALUES ($1, $2, $3, NOW())',
        ['register', 'users', newUser.id]
      );

      return {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verificar JWT y retornar payload
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refrescar token
   */
  refreshToken(oldToken: string): string {
    try {
      const payload = this.verifyToken(oldToken);

      const newToken = jwt.sign(
        {
          id: payload.id,
          email: payload.email,
          role: payload.role,
        },
        this.jwtSecret,
        { expiresIn: this.jwtExpiry }
      );

      return newToken;
    } catch (error) {
      throw new Error('Cannot refresh token');
    }
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(id: number): Promise<User | null> {
    try {
      const result = await this.db.query(
        'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = TRUE',
        [id]
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
   * Cambiar contraseña
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    if (!oldPassword || !newPassword) {
      throw new Error('Old and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    try {
      // Obtener hash actual
      const result = await this.db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      // Verificar contraseña actual
      const validPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);

      if (!validPassword) {
        throw new Error('Current password is incorrect');
      }

      // Hash de nueva contraseña
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Actualizar
      await this.db.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      // Registrar en audit_log
      await this.db.query(
        'INSERT INTO audit_log (user_id, action, table_name, record_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
        [userId, 'change_password', 'users', userId]
      );
    } catch (error) {
      throw error;
    }
  }
}
