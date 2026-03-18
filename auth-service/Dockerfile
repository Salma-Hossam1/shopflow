# --- Stage 1: deps ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci is stricter than npm install — it uses package-lock.json exactly.
# Always use ci in CI/CD pipelines and Dockerfiles.
RUN npm ci --only=production

# --- Stage 2: runtime ---
FROM node:20-alpine
WORKDIR /app

# Copy only production deps from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Run as non-root user — important for K8s Pod Security Standards
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

CMD ["node", "src/index.js"]