FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV SITE_PORT=3080

USER node
EXPOSE 3080

CMD ["node", "server.js"]
