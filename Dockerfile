# Multi-stage build for React/Node.js application

FROM node:24.4.1-alpine as frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --only=production


COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Node.js backend
FROM node:24.4.1-alpine as backend-builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./

RUN npm ci --only=production
COPY src/ ./src/
RUN npm run build:backend


FROM node:24.4.1-alpine as production
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force


COPY --from=backend-builder /app/dist ./dist

COPY --from=frontend-builder /app/frontend/build ./dist/frontend/build


RUN addgroup -g 1001 -S nodejs && \
    adduser -S app -u 1001 -G nodejs


RUN chown -R app:nodejs /app
USER app

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http'); http.get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); });"

# Start the application
CMD ["node", "dist/backend/index.js"]
