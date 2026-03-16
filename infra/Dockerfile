FROM node:22-slim AS base

ARG BUILD_VERSION
ENV BUILD_VERSION=$BUILD_VERSION

RUN apt update \
  && apt upgrade -y \
  && apt install -y ca-certificates git gettext-base

WORKDIR /app

RUN npm add --global @moonrepo/cli@2.0.4

FROM base AS scaffold

ARG MOON_SCAFFOLD_PROJECTS="repro/api-server repro/workspace repro/admin"

COPY . .
RUN moon docker scaffold $MOON_SCAFFOLD_PROJECTS

FROM base AS prepare

COPY --from=scaffold /app/.moon/docker/workspace .
COPY --from=scaffold /app/patches ./patches
RUN moon docker setup
COPY . .

FROM prepare AS build-all
RUN moon run :build

FROM prepare AS workspace
RUN moon run repro/workspace:build
CMD ["moon", "run", "repro/workspace:serve"]

FROM prepare AS api-server
RUN moon run repro/api-server:build
CMD ["moon", "run", "repro/api-server:serve"]

FROM prepare AS admin
RUN moon run repro/admin:build
CMD ["moon", "run", "repro/admin:serve"]
