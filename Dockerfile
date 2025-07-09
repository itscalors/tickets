# Usa una imagen base oficial de Node.js
FROM node:20

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos necesarios
COPY package*.json ./
RUN npm install

# Copia el resto del código
COPY . .

# Expón el puerto si tu app lo usa (opcional, por ejemplo 3000)
EXPOSE 3000

# Comando de inicio
CMD ["node", "index.js"]
