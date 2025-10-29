FROM node:22-slim AS base

ARG BUILD_VERSION
ENV BUILD_VERSION=$BUILD_VERSION

WORKDIR /app

RUN npm add --global @moonrepo/cli

FROM base as scaffold

COPY . .
RUN moon docker scaffold \
  repro/api-server \
  repro/workspace \
  repro/admin

FROM base AS prepare

COPY --from=scaffold /app/.moon/docker/workspace .
COPY --from=scaffold /app/patches ./patches
RUN moon docker setup

COPY --from=scaffold  /app/.moon/docker/sources .

FROM prepare AS build
COPY . .
RUN moon run :build
