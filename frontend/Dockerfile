FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV REACT_APP_API_URL=http://localhost:3001
ENV REACT_APP_ENV=development

# Comando por defecto
CMD ["npm", "start"]
