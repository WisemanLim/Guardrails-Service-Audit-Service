FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json tsconfig.json nest-cli.json ./
RUN npm install --no-fund --no-audit
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/var
EXPOSE 8083
CMD ["node", "dist/main.js"]
