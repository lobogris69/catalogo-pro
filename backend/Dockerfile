FROM node:18-alpine

WORKDIR /app

# Copiar package.json (y package-lock.json si existe)
COPY package*.json ./

# Instalar dependencias (npm install no requiere package-lock.json)
RUN npm install

# Copiar el resto del código fuente
COPY . .

# Compilar TypeScript y copiar los SQL al dist
RUN npm run build

# Exponer puerto
EXPOSE 3001

# Arrancar en modo producción (código ya compilado)
CMD ["npm", "start"]
