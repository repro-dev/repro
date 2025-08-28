FROM node:22-slim
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN corepack prepare pnpm@8.3.1 --activate

RUN pnpm add --global @moonrepo/cli

COPY ./patches/ ./patches/

# Install PNPM packages only if dependency versions have changed
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# Add source files and install dependencies from store
COPY . .
RUN pnpm install --offline

RUN pnpm add -g @moonrepo/cli

# Run build step for all library packages with a build target
RUN moon run :build --query 'tag=type.package'

EXPOSE 8080
