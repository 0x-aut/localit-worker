FROM node:20-bullseye-slim

# Official node-canvas deps (source: github.com/Automattic/node-canvas)
# git is needed at runtime for cloning repos
RUN apt-get update && apt-get install -y \
  git \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

# Installs chromium + all its system deps automatically
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]