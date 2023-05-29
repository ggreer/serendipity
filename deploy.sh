#!/usr/bin/env bash

set -euxo pipefail

echo "Building website:"
yarn build

echo "Deploying website:"
aws s3 sync build/ s3://video.greer.fm/


echo "Building docker image:"
#DOCKER_BUILDKIT=1 docker build --ssh default -t server:latest --file server.Dockerfile .
docker buildx build --platform linux/amd64,linux/arm64 --ssh default -t server:latest --file server.Dockerfile .

echo "Deploying docker image:"
aws --region us-west-2 ecr get-login-password | docker login --username AWS --password-stdin 745623752863.dkr.ecr.us-west-2.amazonaws.com/server

docker tag server:latest 745623752863.dkr.ecr.us-west-2.amazonaws.com/server:latest
docker push 745623752863.dkr.ecr.us-west-2.amazonaws.com/server:latest

aws --region us-west-2 ecs update-service --cluster server --service websocket --force-new-deployment
