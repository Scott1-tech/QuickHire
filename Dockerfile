# Deterministic build for Railway (avoids Nixpacks auto-detection issues with the
# web/ subproject). The React SPA is prebuilt and committed to public/app, so the
# image only needs the Express server's runtime dependencies.
FROM node:20-slim

WORKDIR /app

# Install only the server's production dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the app (server.js, public/ including the prebuilt SPA).
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
