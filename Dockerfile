FROM mcr.microsoft.com/playwright:v1.58.0-noble

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install exact deps from lockfile
RUN npm ci

# Copy source
COPY . .

# Build TypeScript and show output
RUN npm run build && echo "=== Build complete ===" && ls -la dist/

# Confirm node version and key binaries exist
RUN node --version && npx playwright --version && git --version

EXPOSE 3001

CMD ["npm", "run", "start:prod"]