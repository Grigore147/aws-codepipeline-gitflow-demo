#!/usr/bin/env bash

# ################################################################################################ #
#                                     CI/CD Entrypoint Test                                        #
#                               Tests for CI/CD Entrypoint script                                  #
# ################################################################################################ #

set -euo pipefail

# Get current working directory
CURRENT_DIR=$(pwd)

# Get directory of this script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Include utils
source ${SCRIPT_DIR}/utils.sh

BREAK_ON_FAIL=${BREAK_ON_FAIL:-false}
TESTS_FAILED=false

assert() {
    if [[ ${!1} = $2 ]]; then
        print_success "$1 = $2"
    else
        print_error "Invalid $1 value detected."
        print_error "  Expected value: $2"
        print_error "  GIT BRANCH: ${GIT_BRANCH}"
        print_error "  GIT COMMIT: ${GIT_COMMIT}"
        
        TESTS_FAILED=true

        if [[ $BREAK_ON_FAIL = true ]]; then
            exit 1;
        fi;
    fi;
}

# TEST DATA
CI_PROJECT_NAME=gitflow
CI_PROJECT_KEY=demo
CI_PROJECT_DOMAIN=example.com
CI_SERVICE_NAME=api
CI_SERVICE_IMAGE_REPOSITORY_URL=docker.io/services

GIT_COMMIT=abc123abc123abc123abc123

############################################################################################################

GIT_BRANCH=feature/DEMO-123

print_info ""
print_info "Testing feature/DEMO-123 branch"
print_info ""

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "sandbox"
assert "CI_SERVICE_NAMESPACE" "demo-feature-123"
assert "CI_SERVICE_VERSION" "abc123ab"
assert "CI_SERVICE_URL" "feature-123.api.sandbox.example.com"
assert "CI_SERVICE_URL_PATH" "feature-123.api.sandbox"
assert "CI_SERVICE_IMAGE_TAG" "api:abc123ab"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:abc123ab"

############################################################################################################

GIT_BRANCH=feature/feature-123

print_info ""
print_info "Testing feature/feature-123 branch"
print_info ""

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "sandbox"
assert "CI_SERVICE_NAMESPACE" "demo-feature-123"
assert "CI_SERVICE_VERSION" "abc123ab"
assert "CI_SERVICE_URL" "feature-123.api.sandbox.example.com"
assert "CI_SERVICE_URL_PATH" "feature-123.api.sandbox"
assert "CI_SERVICE_IMAGE_TAG" "api:abc123ab"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:abc123ab"

############################################################################################################

GIT_BRANCH=develop

print_info ""
print_info "Testing develop branch"
print_info ""

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "develop"
assert "CI_SERVICE_NAMESPACE" "demo-develop"
assert "CI_SERVICE_VERSION" "abc123ab"
assert "CI_SERVICE_URL" "api.develop.example.com"
assert "CI_SERVICE_URL_PATH" "api.develop"
assert "CI_SERVICE_IMAGE_TAG" "api:abc123ab"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:abc123ab"

############################################################################################################

GIT_BRANCH=release/v1.0.0

print_info ""
print_info "Testing release/v1.0.0 branch"
print_info ""

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "staging"
assert "CI_SERVICE_NAMESPACE" "demo-staging"
assert "CI_SERVICE_VERSION" "v1.0.0"
assert "CI_SERVICE_URL" "api.staging.example.com"
assert "CI_SERVICE_URL_PATH" "api.staging"
assert "CI_SERVICE_IMAGE_TAG" "api:v1.0.0"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:v1.0.0"

############################################################################################################

GIT_BRANCH=hotfix/v1.0.1

print_info ""
print_info "Testing hotfix/v1.0.1 branch"
print_info ""

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "staging"
assert "CI_SERVICE_NAMESPACE" "demo-staging"
assert "CI_SERVICE_VERSION" "v1.0.1"
assert "CI_SERVICE_URL" "api.staging.example.com"
assert "CI_SERVICE_URL_PATH" "api.staging"
assert "CI_SERVICE_IMAGE_TAG" "api:v1.0.1"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:v1.0.1"

############################################################################################################

GIT_BRANCH=main

print_info ""
print_info "Testing main branch"
print_info ""

CI_SERVICE_MAIN_URL='$CI_SERVICE_NAME.$CI_SERVICE_ENVIRONMENT.$CI_PROJECT_DOMAIN'

source ${SCRIPT_DIR}/cicd-entrypoint.sh

assert "CI_SERVICE_ENVIRONMENT" "production"
assert "CI_SERVICE_NAMESPACE" "demo-production"
assert "CI_SERVICE_VERSION" "abc123ab"
assert "CI_SERVICE_URL" "api.production.example.com"
assert "CI_SERVICE_URL_PATH" "api.production"
assert "CI_SERVICE_IMAGE_TAG" "api:abc123ab"
assert "CI_SERVICE_IMAGE" "${CI_SERVICE_IMAGE_REPOSITORY_URL}/api:abc123ab"

############################################################################################################

if [[ $TESTS_FAILED = true ]]; then
    print_error ""
    print_error "SOME TESTS HAVE FAILED!"
    print_error ""

    exit 1;
fi;

print_success ""
print_success "ALL TESTS HAVE PASSED!"
print_success ""
