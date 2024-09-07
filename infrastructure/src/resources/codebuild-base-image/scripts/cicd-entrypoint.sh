#!/usr/bin/env bash

# ################################################################################################ #
#                                       CI/CD Entrypoint                                           #
#          Determine the deployment environment based on the GitFlow branching model               #
# ################################################################################################ #

# #############################################################################
# This script is used to determine the deployment environment based on the GitFlow branching model.
#
# NOTE:
# - Usually it is intended this script to be included in the CI/CD pipeline docker image that runs the build step.
# - After this script is sourced, the environment variables are set 
#   and can be used in the pipeline by other commands or scripts.
# - Alternativelly we could return an JSON object with the environment variables.
# 
# This cicd-entrypoint.sh script should be copied in the container image at the /cicd-entrypoint path.
# Usage example: >_ source /cicd-entrypoint
#
# The following environment variables are exported:
# - GIT_BRANCH
# - GIT_COMMIT
# - CI_PROJECT_NAME
# - CI_PROJECT_KEY
# - CI_PROJECT_DOMAIN
# - CI_SERVICE_NAME
# - CI_SERVICE_ENVIRONMENT
# - CI_SERVICE_NAMESPACE
# - CI_SERVICE_VERSION
# - CI_SERVICE_IMAGE_REPOSITORY_URL
# - CI_SERVICE_IMAGE_TAG
# - CI_SERVICE_IMAGE
# - CI_SERVICE_URL
# - CI_SERVICE_URL_PATH
#
# #############################################################################

# TEST DATA
# export GIT_BRANCH=feature/demo-123
# export GIT_COMMIT=abc123abc123abc123abc123
# export CI_PROJECT_NAME=gitflow
# export CI_PROJECT_KEY=demo
# export CI_PROJECT_DOMAIN=example.com
# export CI_SERVICE_NAME=demo
# export CI_SERVICE_IMAGE_REPOSITORY_URL=docker.io/services

set -euo pipefail

# Get current working directory
CURRENT_DIR=$(pwd)

# Get directory of this script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Include utils
source ${SCRIPT_DIR}/utils.sh

# Check if envsubst is available
if ! [ -x "$(command -v envsubst)" ]; then
    print_error "'envsubst' is not installed! Please install 'envsubst' to continue."
    exit 1;
fi

# Even though this vars will be defined before running this script,
# a local re-export is required for envsubst to properly see them and substitute variables.
export GIT_BRANCH=${GIT_BRANCH:-"$(git rev-parse --abbrev-ref HEAD)"}
export GIT_COMMIT=${GIT_COMMIT:-"$(git rev-parse HEAD)"}
export CI_PROJECT_NAME=${CI_PROJECT_NAME:-""}
export CI_PROJECT_KEY=${CI_PROJECT_KEY:-""}
export CI_PROJECT_DOMAIN=${CI_PROJECT_DOMAIN:-""}
export CI_SERVICE_NAME=${CI_SERVICE_NAME:-""}
export CI_SERVICE_IMAGE_REPOSITORY_URL=${CI_SERVICE_IMAGE_REPOSITORY_URL:-""}
export CI_SERVICE_VERSION=${CI_SERVICE_VERSION:-""}
export CI_SERVICE_URL_TYPE=${CI_SERVICE_URL_TYPE:-"SUBDOMAIN"}

[[ -z ${GIT_BRANCH:-} ]] && { print_error "GIT_BRANCH is required"; exit 1; }
[[ -z ${GIT_COMMIT:-} ]] && { print_error "GIT_COMMIT is required"; exit 1; }
[[ -z ${CI_PROJECT_NAME:-} ]] && { print_error "CI_PROJECT_NAME is required"; exit 1; }
[[ -z ${CI_PROJECT_KEY:-} ]] && { print_error "CI_PROJECT_KEY is required"; exit 1; }
[[ -z ${CI_PROJECT_DOMAIN:-} ]] && { print_error "CI_PROJECT_DOMAIN is required"; exit 1; }
[[ -z ${CI_SERVICE_NAME:-} ]] && { print_error "CI_SERVICE_NAME is required"; exit 1; }
[[ -z ${CI_SERVICE_IMAGE_REPOSITORY_URL:-} ]] && { print_error "CI_SERVICE_IMAGE_REPOSITORY_URL is required"; exit 1; }

export GIT_BRANCH=$(echo $GIT_BRANCH | sed 's:/:-:g' | awk '{ print tolower($0) }')
export CI_COMMIT_SHORT_SHA=${GIT_COMMIT:0:8}

# Service URL default templates
if [[ $CI_SERVICE_URL_TYPE = 'path' ]]; then
    export CI_SERVICE_PROJECT_FEATURE_URL=${CI_SERVICE_PROJECT_FEATURE_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}/feature-${CI_SERVICE_FEATURE_KEY}'}
    export CI_SERVICE_FEATURE_URL=${CI_SERVICE_FEATURE_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}/feature-${CI_SERVICE_FEATURE_KEY}'}
    export CI_SERVICE_DEVELOP_URL=${CI_SERVICE_DEVELOP_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}'}
    export CI_SERVICE_RELEASE_URL=${CI_SERVICE_RELEASE_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}'}
    export CI_SERVICE_HOTFIX_URL=${CI_SERVICE_HOTFIX_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}'}
    export CI_SERVICE_MAIN_URL=${CI_SERVICE_MAIN_URL:-'${CI_PROJECT_DOMAIN}/${CI_SERVICE_ENVIRONMENT}/${CI_SERVICE_NAME}'}
else
    export CI_SERVICE_PROJECT_FEATURE_URL=${CI_SERVICE_PROJECT_FEATURE_URL:-'feature-${CI_SERVICE_FEATURE_KEY}.${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
    export CI_SERVICE_FEATURE_URL=${CI_SERVICE_FEATURE_URL:-'feature-${CI_SERVICE_FEATURE_KEY}.${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
    export CI_SERVICE_DEVELOP_URL=${CI_SERVICE_DEVELOP_URL:-'${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
    export CI_SERVICE_RELEASE_URL=${CI_SERVICE_RELEASE_URL:-'${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
    export CI_SERVICE_HOTFIX_URL=${CI_SERVICE_HOTFIX_URL:-'${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
    export CI_SERVICE_MAIN_URL=${CI_SERVICE_MAIN_URL:-'${CI_SERVICE_NAME}.${CI_SERVICE_ENVIRONMENT}.${CI_PROJECT_DOMAIN}'}
fi

# Feature branch with a project issue key
if [[ ${GIT_BRANCH} =~ ^feature-${CI_PROJECT_KEY}-([0-9]+).*$ ]]; then
    print_success "Feature branch for a JIRA issue detected."

    export CI_SERVICE_FEATURE_KEY="${BASH_REMATCH[1]}"
    export CI_SERVICE_ENVIRONMENT="sandbox"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-feature-${CI_SERVICE_FEATURE_KEY}"
    export CI_SERVICE_VERSION="${CI_COMMIT_SHORT_SHA}"

    # export CI_SERVICE_URL=$(eval echo "$CI_SERVICE_PROJECT_FEATURE_URL")
    export CI_SERVICE_URL=$(echo $CI_SERVICE_PROJECT_FEATURE_URL | envsubst)
# Feature branch without a project issue key
elif [[ ${GIT_BRANCH} =~ ^feature-feature-(.+)$ ]]; then
    print_success "Feature branch detected."

    export CI_SERVICE_FEATURE_KEY="${BASH_REMATCH[1]}"
    export CI_SERVICE_ENVIRONMENT="sandbox"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-feature-${CI_SERVICE_FEATURE_KEY}"
    export CI_SERVICE_VERSION="${CI_COMMIT_SHORT_SHA}"
    
    export CI_SERVICE_URL=$(echo $CI_SERVICE_FEATURE_URL | envsubst)
fi

# Develop branch
if [[ ${GIT_BRANCH} = "develop" ]]; then
    print_success "Develop branch detected."

    export CI_SERVICE_ENVIRONMENT="develop"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-develop"
    export CI_SERVICE_VERSION="${CI_COMMIT_SHORT_SHA}"
    
    export CI_SERVICE_URL=$(echo $CI_SERVICE_DEVELOP_URL | envsubst)
fi

# Release branch
if [[ ${GIT_BRANCH} =~ ^release-(.+)$ ]]; then
    print_success "Release branch detected."

    export CI_SERVICE_ENVIRONMENT="staging"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-staging"
    export CI_SERVICE_VERSION="${BASH_REMATCH[1]}"
    
    export CI_SERVICE_URL=$(echo $CI_SERVICE_RELEASE_URL | envsubst)
fi

# Hotfix branch
if [[ ${GIT_BRANCH} =~ ^hotfix-(.+)$ ]]; then
    print_success "Hotfix branch detected."

    export CI_SERVICE_ENVIRONMENT="staging"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-staging"
    export CI_SERVICE_VERSION="${BASH_REMATCH[1]}"
    
    export CI_SERVICE_URL=$(echo $CI_SERVICE_HOTFIX_URL | envsubst)
fi

# Main branch
if [[ ${GIT_BRANCH} = "main" ]]; then
    print_success "Main branch detected."

    export CI_SERVICE_ENVIRONMENT="production"
    export CI_SERVICE_NAMESPACE="${CI_PROJECT_KEY}-production"
    export CI_SERVICE_VERSION="${CI_COMMIT_SHORT_SHA}"
    
    export CI_SERVICE_URL=$(echo $CI_SERVICE_MAIN_URL | envsubst)
fi

if [[ -z ${CI_SERVICE_ENVIRONMENT:-} ]]; then
    print_warning "No valid GitFlow environment detected!"
    
    exit 1;
fi

export CI_SERVICE_URL_PATH=$(echo $CI_SERVICE_URL | sed -E "s/\.?$CI_PROJECT_DOMAIN\/?//")

export CI_SERVICE_IMAGE_TAG="${CI_SERVICE_NAME}:${CI_SERVICE_VERSION}"
export CI_SERVICE_IMAGE="${CI_SERVICE_IMAGE_REPOSITORY_URL}/${CI_SERVICE_IMAGE_TAG}"

print_info ""
print_info "Service Environment:"
print_info ""
print_info "GIT BRANCH:           ${GIT_BRANCH}"
print_info "GIT COMNMIT:          ${GIT_COMMIT}"
print_info ""
print_info "PROJECT NAME:         ${CI_PROJECT_NAME}"
print_info "PROJECT KEY:          ${CI_PROJECT_KEY}"
print_info "PROJECT DOMAIN:       ${CI_PROJECT_DOMAIN}"
print_info ""
print_info "SERVICE NAME:         ${CI_SERVICE_NAME}"
print_info "SERVICE ENVIRONMENT:  ${CI_SERVICE_ENVIRONMENT}"
print_info "SERVICE NAMESPACE:    ${CI_SERVICE_NAMESPACE}"
print_info "SERVICE VERSION:      ${CI_SERVICE_VERSION}"
print_info "SERVICE URL:          ${CI_SERVICE_URL}"
print_info "SERVICE URL PATH:     ${CI_SERVICE_URL_PATH}"
print_info ""
print_info "IMAGE REPOSITORY URL: ${CI_SERVICE_IMAGE_REPOSITORY_URL}"
print_info "SERVICE IMAGE TAG:    ${CI_SERVICE_IMAGE_TAG}"
print_info "SERVICE IMAGE:        ${CI_SERVICE_IMAGE}"
print_info ""
