FROM node:20-slim
WORKDIR /app
# node:20-slim ships npm 10.x, which has the "Exit handler never called!" bug
# that leaves native deps (better-sqlite3) half-installed. Upgrade to npm 11.
RUN npm install -g npm@11
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY seed ./seed
ENV PORT=3000 DATA_DIR=/app/data SEED_DIR=/app/seed
EXPOSE 3000
CMD ["node", "src/index.js"]
