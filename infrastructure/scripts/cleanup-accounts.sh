#!/bin/bash

set -euo pipefail

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source ${SCRIPT_DIR}/utils.sh

AWS_ACCOUNTS_FILE=${AWS_ACCOUNTS_FILE:-"./accounts.json"}
AWS_ACCOUNTS=$(cat "${AWS_ACCOUNTS_FILE}")
AWS_CDK_CORE_ACCOUNT_PROFILE=$(echo $AWS_ACCOUNTS | jq -r .core.profile)
AWS_CDK_CORE_ACCOUNT_ID=$(echo $AWS_ACCOUNTS | jq -r .core.accountId)
AWS_CDK_ACCOUNT_ACCESS_ROLE="OrganizationAccountAccessRole"
AWS_CDK_TOOLKIT_STACK_NAME="CDKToolkit"
AWS_CDK_TOOLKIT_BUCKET_NAME_PREFIX="cdk-toolkit-assets"
WAIT_FOR_STACK_DELETION=${WAIT_FOR_STACK_DELETION:-"true"}

print_info "◈ Cleaning AWS Accounts"
print_info ""
print_info "◈ Following AWS Accounts will be cleaned from CDK bootstrap stack:"
print_info "  ◈ Core Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .core.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .core.region)"
print_info "  ◈ Shared Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .shared.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .shared.region)"
print_info "  ◈ Sandbox Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .sandbox.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .sandbox.region)"
print_info "  ◈ Develop Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .develop.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .develop.region)"
print_info "  ◈ Staging Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .staging.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .staging.region)"
print_info "  ◈ Production Account:"
print_info "    ▣ Account: $(echo $AWS_ACCOUNTS | jq -r .production.accountId)"
print_info "    ▣ Region:  $(echo $AWS_ACCOUNTS | jq -r .production.region)"
print_info ""

# Ask for confirmation
read -p "Are you sure you want to bootstrap this AWS accounts? (y/n) " -r INPUT
if [[ ! $INPUT =~ ^[Yy]$ ]]
then
    print_warning ""
    print_warning "◈ Cleaning Cancelled!"
    print_warning ""
    exit 0
fi

ACCOUNTS=(core shared sandbox develop staging production)
for ACCOUNT in "${ACCOUNTS[@]}"
do
    TARGET_PROFILE=$(echo $AWS_ACCOUNTS | jq -r ".${ACCOUNT}.profile")
    TARGET_ACCOUNT_ID=$(echo $AWS_ACCOUNTS | jq -r ".${ACCOUNT}.accountId")
    TARGET_REGION=$(echo $AWS_ACCOUNTS | jq -r ".${ACCOUNT}.region")

    print_info ""
    print_info "Assuming role for ${ACCOUNT} account ..."

    # Assume the cross-account role that core account has access to
    CREDENTIALS=$(aws sts assume-role \
        --profile "${AWS_CDK_CORE_ACCOUNT_PROFILE}" \
        --role-arn "arn:aws:iam::${TARGET_ACCOUNT_ID}:role/${AWS_CDK_ACCOUNT_ACCESS_ROLE}" \
        --role-session-name "CDK-Toolkit-Cleanup")

    export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | jq -r .Credentials.AccessKeyId)
    export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | jq -r .Credentials.SecretAccessKey)
    export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | jq -r .Credentials.SessionToken)

    print_info "Deleting CloudFormation stack ${AWS_CDK_TOOLKIT_STACK_NAME} in account ${TARGET_ACCOUNT_ID}..."

    # Delete the CloudFormation stack
    aws cloudformation delete-stack \
        --stack-name "${AWS_CDK_TOOLKIT_STACK_NAME}" \
        --region "${TARGET_REGION}"

    if [[ $? -eq 0 ]]; then 
        if [[ "${WAIT_FOR_STACK_DELETION}" == "true" ]]; then
            print_info "Waiting for stack ${AWS_CDK_TOOLKIT_STACK_NAME} to be deleted..."

            # Wait for the stack to be deleted
            aws cloudformation wait stack-delete-complete \
                --stack-name "${AWS_CDK_TOOLKIT_STACK_NAME}" \
                --region "${TARGET_REGION}"
        fi

        # Delete stack bucket
        print_info "Deleting S3 bucket ${AWS_CDK_TOOLKIT_BUCKET_NAME_PREFIX}-${TARGET_ACCOUNT_ID}-${TARGET_REGION} in account ${TARGET_ACCOUNT_ID}..."

        aws s3 rb "s3://${AWS_CDK_TOOLKIT_BUCKET_NAME_PREFIX}-${TARGET_ACCOUNT_ID}-${TARGET_REGION}" --region "${TARGET_REGION}" --force
    else
        print_error "Failed to delete CloudFormation stack ${AWS_CDK_TOOLKIT_STACK_NAME} in account ${TARGET_ACCOUNT_ID}."
        # exit 1
    fi

    print_success "CloudFormation stack ${AWS_CDK_TOOLKIT_STACK_NAME} has been successfully deleted from ${TARGET_ACCOUNT_ID} account."
done

print_info ""
print_info "◈ Cleaning Complete!"
print_info ""
