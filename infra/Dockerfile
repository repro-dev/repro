FROM node:22-slim
WORKDIR /app

# Install moon binary
RUN npm install -g @moonrepo/cli

# Copy workspace skeleton
COPY ./.moon/docker/workspace .
COPY ./patches ./patches

# Install toolchain and dependencies
RUN moon docker setup

# Copy source files
COPY ./.moon/docker/sources .

# Run build step for all library packages with a build target
RUN moon run :build --query 'tag=type.package'

# Prune workspace
RUN moon docker prune

EXPOSE 8080
