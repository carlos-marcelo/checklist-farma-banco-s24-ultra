# Estágio de Build
FROM node:18-alpine AS builder

# Declara os argumentos de build que serão passados pelo docker-compose
ARG VITE_SUPABASE_URL=http://localhost:3000
ARG VITE_SUPABASE_ANON_KEY=local-key-to-bypass-auth

# Exporta os args como variáveis de ambiente para o Vite ler durante o build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos de configuração de dependências
COPY package.json package-lock.json* ./

# Instala as dependências de forma mais limpa/rápida para produção
# Se você tiver problema de erro com legacy-peer-deps, você pode trocar 'npm ci' por 'npm install --legacy-peer-deps'
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copia o restante dos arquivos do projeto (pode demorar no primeiro build)
COPY . .

# Faz o build da aplicação para produção (cria a pasta 'dist')
RUN npm run build

# Estágio de Produção com Nginx
FROM nginx:alpine

# Remove as configurações padrão do Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia a configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos gerados no estágio de build para a pasta do Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe a porta 80 do contêiner (mapeamento interno do Nginx)
EXPOSE 80

# Inicia o servidor Nginx
CMD ["nginx", "-g", "daemon off;"]
