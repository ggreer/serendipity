# syntax=docker/dockerfile:1.0.0-experimental

# Build me with:
# DOCKER_BUILDKIT=1 docker build --ssh default -t server:latest --file server.Dockerfile .

# Run me locally with:
# docker run -it --init -p 3000:80 server:latest

# Deploy me with:
# aws --region us-west-2 ecr get-login-password | docker login --username AWS --password-stdin 745623752863.dkr.ecr.us-west-2.amazonaws.com/server
# docker tag server:latest 745623752863.dkr.ecr.us-west-2.amazonaws.com/server:latest
# docker push 745623752863.dkr.ecr.us-west-2.amazonaws.com/server:latest


# Build deps without dev dependencies
FROM node:20-alpine
WORKDIR /run/server
ENV NODE_ENV production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile


# Build JS
FROM node:20-alpine
WORKDIR /run/server
ENV NODE_ENV production
# Copy node_modules from previous image to speed up build time
COPY --from=0 /run/server ./
COPY . ./
RUN yarn install --production=false --frozen-lockfile && \
  yarn build


# Run
FROM node:20-alpine
WORKDIR /run/server
EXPOSE 80
# Copy built production node_modules
COPY --from=0 /run/server ./
# Copy built JS
COPY --from=1 /run/server/build .

# TODO: probably want to remove debug logging once we're more comfortable with prod
ENV DEBUG="*"
ENV PORT="80"
CMD [ "node", "server/server.js" ]
