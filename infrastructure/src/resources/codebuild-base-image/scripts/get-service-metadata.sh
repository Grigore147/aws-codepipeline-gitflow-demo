#!/usr/bin/env bash

# ################################################################################################ #
#                                   Service Environment Metadata                                   #
#                   Outputs metadata for the current service environment as JSON                   #
# ################################################################################################ #

set -euo pipefail

# Get current working directory
CURRENT_DIR=$(pwd)

# Get directory of this script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source ${SCRIPT_DIR}/cicd-entrypoint.sh &>/dev/null

if [[ -z "${CI_SERVICE_ENVIRONMENT}" ]]; then
    echo "Failed to get service environment metadata."
    exit 1
fi

# Print metadata as JSON
# This JSON object can be used in the CI/CD pipeline for further processing or deployment.
# Used to update service metadata for current updated environment in the Core Infrastructure.
# Example structure: 
# "production": {
#     "version": "v1.0.0",
#     "namespace": "demo-production",
#     "image": "docker.io/username/demo:v1.0.0",
#     "url": "example.com/production/demo",
#     "urlPath": "production/demo"
# }

METADATA=$(cat <<EOF
{
    "version": "${CI_SERVICE_VERSION}",
    "namespace": "${CI_SERVICE_NAMESPACE}",
    "image": "${CI_SERVICE_IMAGE}",
    "url": "${CI_SERVICE_URL}",
    "urlType": "${CI_SERVICE_URL_TYPE}",
    "urlPath": "${CI_SERVICE_URL_PATH}"
}
EOF
)

if [[ "${CI_SERVICE_ENVIRONMENT}" == "sandbox" ]]; then
cat <<EOF | jq -Mr .
{
    "sandbox": {
        "features": {
            "feature-${CI_SERVICE_FEATURE_KEY}": ${METADATA}
        }
    }
}
EOF
else
cat <<EOF | jq -Mr .
{
    "${CI_SERVICE_ENVIRONMENT}": ${METADATA}
}
EOF
fi
