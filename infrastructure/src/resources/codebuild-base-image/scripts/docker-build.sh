#!/bin/bash

# ################################################################################################ #
#                                          Docker Build                                            #
# ################################################################################################ #

set -euo pipefail

# Get current working directory
CURRENT_DIR=$(pwd)

# Get directory of this script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DOCKER_FILE_PATH=${SCRIPT_DIR}/../Dockerfile
DOCKER_BUILD_CONTEXT=${SCRIPT_DIR}/../../

# Required Environment Variables
[[ -z $GIT_BRANCH ]] && { echo "▣ GIT_BRANCH is required"; exit 1; }
[[ -z $CI_SERVICE_NAME ]] && { echo "▣ CI_SERVICE_NAME is required"; exit 1; }
[[ -z $CI_SERVICE_IMAGE_REPOSITORY_URL ]] && { echo "▣ CI_SERVICE_IMAGE_REPOSITORY_URL is required"; exit 1; }
[[ -z $CI_SERVICE_IMAGE ]] && { echo "▣ CI_SERVICE_IMAGE is required"; exit 1; }

CI_SERVICE_ENVIRONMENT=${CI_SERVICE_ENVIRONMENT:-""}
CI_SERVICE_VERSION=${CI_SERVICE_VERSION:-""}

# Pushing Docker image to registry is allowed by -p or --push flag, default is false
PUSH_IMAGES=false

if [[ "$#" -gt 0 && ( "$1" == "-p" || "$1" == "--push" ) ]]; then
    PUSH_IMAGES=true
fi

# Building Docker Image
if [[ $PUSH_IMAGES = true ]]; then
    echo "▣ Building Docker Image and Pushing to Docker Registry"
else
    echo "▣ Building Docker Image"
fi

# Build version for current commit
docker build \
    --file $DOCKER_FILE_PATH \
    --tag $CI_SERVICE_IMAGE \
    --build-arg SERVICE_NAME=$CI_SERVICE_NAME \
    --build-arg SERVICE_ENVIRONMENT=$CI_SERVICE_ENVIRONMENT \
    --build-arg SERVICE_VERSION=$CI_SERVICE_VERSION \
    $DOCKER_BUILD_CONTEXT

echo "▣ BUILD IMAGE: $CI_SERVICE_IMAGE"

# Version built for latest commit on develop branch is tagged as latest as well
if [[ $GIT_BRANCH = "develop" ]]; then
    docker tag $CI_SERVICE_IMAGE $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:latest

    echo "▣ Tagged Docker Image as latest"
    echo "▣ LATEST IMAGE: $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:latest"
fi

# Version built on main branch is tagged as stable
if [[ $GIT_BRANCH = "main" ]]; then
    docker tag $CI_SERVICE_IMAGE $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:stable

    echo "▣ Tagged Docker Image as stable"
    echo "▣ STABLE IMAGE: $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:stable"
fi

# Push Docker Images to Registry if flag push is set
if [[ $PUSH_IMAGES = true ]]; then
    docker push $CI_SERVICE_IMAGE

    if [[ $GIT_BRANCH = "develop" ]]; then
        docker push $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:latest
    fi

    if [[ $GIT_BRANCH = "main" ]]; then
        docker push $CI_SERVICE_IMAGE_REPOSITORY_URL/$CI_SERVICE_NAME:stable
    fi
fi

echo "▣ Docker Build Completed!"
