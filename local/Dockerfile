# Test/development image; production publishes only dist/ through Sites.
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
WORKDIR /app
COPY --chown=node:node dist/ dist/
COPY --chown=node:node local/ local/
COPY --chown=node:node scripts/ scripts/
COPY --chown=node:node tests/ tests/
COPY --chown=node:node package.json server.mjs ./
USER node
EXPOSE 4173
CMD ["node", "local/server.mjs"]
