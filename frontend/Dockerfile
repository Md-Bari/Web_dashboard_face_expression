FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

