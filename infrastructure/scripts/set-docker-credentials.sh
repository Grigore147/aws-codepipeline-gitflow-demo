#!/bin/bash

set -euo pipefail

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source ${SCRIPT_DIR}/utils.sh

AWS_ACCOUNTS_FILE=${AWS_ACCOUNTS_FILE:-"./accounts.json"}
AWS_ACCOUNTS=$(cat "${AWS_ACCOUNTS_FILE}")
AWS_CDK_CORE_ACCOUNT_PROFILE=$(echo $AWS_ACCOUNTS | jq -r .core.profile)
AWS_CDK_CORE_ACCOUNT_ID=$(echo $AWS_ACCOUNTS | jq -r .core.accountId)
SHARED_ACCOUNT_ID=$(echo ${AWS_ACCOUNTS} | jq -r .shared.accountId)
AWS_CDK_ACCOUNT_ACCESS_ROLE="OrganizationAccountAccessRole"

print_info "◈ Please provide Docker Hub credentials:"

read -p "USERNAME: " -r DOCKER_HUB_USERNAME
read -p "PASSWORD: " -r DOCKER_HUB_PASSWORD

if [[ -z "${DOCKER_HUB_USERNAME}" ]]; then
    print_error "Username not provided! Aborting..."
    exit 0;
fi
if [[ -z "${DOCKER_HUB_PASSWORD}" ]]; then
    print_error "Password not provided! Aborting..."
    exit 0;
fi

SECRET_ARN=""
SECRET_NAME="/demo/shared/docker-hub/credentials"
SECRET_VALUE=$(cat <<EOF
{
  "username": "${DOCKER_HUB_USERNAME}",
  "password": "${DOCKER_HUB_PASSWORD}"
}
EOF
)

print_info "◈ Secret '${SECRET_NAME}' will be created in the 'shared' account with credentials."
print_info ""

read -p "Are you sure you want to continue? (y/n) " -r INPUT
if [[ ! $INPUT =~ ^[Yy]$ ]]
then
    print_warning ""
    print_warning "◈ Creating Docker Hub credentials cancelled!"
    print_warning ""
    exit 0
fi

print_info ""
print_info "Assuming role for ${SHARED_ACCOUNT_ID} account ..."

CREDENTIALS=$(aws sts assume-role \
    --profile "${AWS_CDK_CORE_ACCOUNT_PROFILE}" \
    --role-arn "arn:aws:iam::${SHARED_ACCOUNT_ID}:role/${AWS_CDK_ACCOUNT_ACCESS_ROLE}" \
    --role-session-name "CDK-Toolkit-Session")

export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | jq -r .Credentials.AccessKeyId)
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | jq -r .Credentials.SecretAccessKey)
export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | jq -r .Credentials.SessionToken)

print_info "◈ Creating secret '${SECRET_NAME}' with Docker Hub credentials in '${SHARED_ACCOUNT_ID}' account..."

if (aws secretsmanager describe-secret \
    --secret-id "${SECRET_NAME}" \
    --no-cli-pager > /dev/null 2>&1;) then

    RESPONSE=$(aws secretsmanager put-secret-value \
        --secret-id "${SECRET_NAME}" \
        --secret-string "${SECRET_VALUE}" \
        --no-cli-pager \
        --output json)

    if [[ $? -ne 0 ]]; then
        print_error "Failed to create secret '${SECRET_NAME}'."
        exit 1
    fi

    SECRET_ARN=$(echo $RESPONSE | jq -r .ARN)
else
    RESPONSE=$(aws secretsmanager create-secret \
        --name "${SECRET_NAME}" \
        --description "Docker Hub credentials" \
        --secret-string "${SECRET_VALUE}" \
        --tags Key=Application,Value="CodePipeline-GitFlow" \
        --tags Key=Environment,Value="Shared" \
        --no-cli-pager \
        --output json)

    if [[ $? -ne 0 ]]; then
        print_error "Failed to update secret '${SECRET_NAME}'."
        exit 1
    fi

    SECRET_ARN=$(echo $RESPONSE | jq -r .ARN)
fi

RESOURCE_POLICY=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "${SECRET_ARN}",
            "Principal": {
                "AWS": [
                    "$(echo ${AWS_ACCOUNTS} | jq -r .core.accountId)",
                    "$(echo ${AWS_ACCOUNTS} | jq -r .shared.accountId)",
                    "$(echo ${AWS_ACCOUNTS} | jq -r .sandbox.accountId)",
                    "$(echo ${AWS_ACCOUNTS} | jq -r .develop.accountId)",
                    "$(echo ${AWS_ACCOUNTS} | jq -r .staging.accountId)",
                    "$(echo ${AWS_ACCOUNTS} | jq -r .production.accountId)"
                ]
            }
        }
    ]
}
EOF
)

aws secretsmanager put-resource-policy \
    --secret-id "${SECRET_NAME}" \
    --resource-policy "${RESOURCE_POLICY}" \
    --block-public-policy \
    --no-cli-pager

if [[ $? -ne 0 ]]; then
    print_error "Failed to create resource policy for '${SECRET_NAME}' secret."
    # exit 1
fi

print_success "Secret '${SECRET_NAME}' created successfully!"

# Force delete the secret
# aws secretsmanager delete-secret \
#     --secret-id "${SECRET_NAME}" \
#     --force-delete-without-recovery

# Delete the resource policy
# aws secretsmanager delete-resource-policy \
#     --secret-id "${SECRET_ARN}" \
#     --no-cli-pager > /dev/null 2>&1
