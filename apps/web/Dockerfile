# syntax=docker/dockerfile:1
# Static web app image: build the Vite SPA, serve it with unprivileged nginx on :8080.
# Build from the repository root: docker build -f apps/web/Dockerfile .

FROM node:26-slim AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile
ARG VITE_SCIENCE_API_URL
ARG VITE_SI_GATEWAY_URL
ENV VITE_SCIENCE_API_URL=$VITE_SCIENCE_API_URL VITE_SI_GATEWAY_URL=$VITE_SI_GATEWAY_URL
RUN pnpm exec turbo run build --filter=@itza/web...

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
