FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

# Keep local secrets out of the image; runtime services receive env vars from Compose.
COPY . .
ENV DATABASE_URL=postgresql://devmesh:devmesh_local_password@postgres:5432/devmesh?schema=public
RUN npm ci
RUN npm run db:generate
RUN npm run build

FROM build AS api
ENV NODE_ENV=production
CMD ["npm", "run", "start", "--workspace", "@devmesh/api"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["npm", "run", "start", "--workspace", "@devmesh/worker"]

FROM build AS web
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace @devmesh/web
ENV NODE_ENV=production
CMD ["npm", "run", "preview", "--workspace", "@devmesh/web", "--", "--host", "0.0.0.0", "--port", "4173"]
