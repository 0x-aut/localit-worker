FROM mcr.microsoft.com/playwright:v1.58.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]