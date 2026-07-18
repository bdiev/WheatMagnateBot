# syntax=docker/dockerfile:1.7
FROM node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node bot.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node database ./database
COPY --chown=node:node discord ./discord
COPY --chown=node:node minecraft ./minecraft
COPY --chown=node:node features ./features
COPY --chown=node:node runtime ./runtime
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node data ./data

RUN mkdir -p /app/runtime-data /app/data/auth-cache \
    && chown -R node:node /app/runtime-data /app/data \
    && rm -f /app/whitelist.txt \
    && ln -s /app/runtime-data/whitelist.txt /app/whitelist.txt \
    && ln -s /app/runtime-data/status_message_id.txt /app/status_message_id.txt \
    && ln -s /app/runtime-data/admin_panel_message_id.txt /app/admin_panel_message_id.txt \
    && ln -s /app/runtime-data/whisper_channels.json /app/whisper_channels.json \
    && ln -s /app/runtime-data/obsidian_farm_config.json /app/obsidian_farm_config.json \
    && ln -s /app/runtime-data/obsidian_farm_debug.log /app/obsidian_farm_debug.log \
    && ln -s /app/runtime-data/bot_public_chat_status.json /app/data/bot_public_chat_status.json \
    && ln -s /app/runtime-data/player_head_emojis.json /app/data/player_head_emojis.json \
    && ln -s /app/runtime-data/obsidian_stats_messages.json /app/data/obsidian_stats_messages.json

USER node
EXPOSE 3090

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node scripts/healthcheck.js "http://127.0.0.1:${BOT_HEALTH_PORT:-3090}/health"

CMD ["node", "scripts/bot-entrypoint.js"]
