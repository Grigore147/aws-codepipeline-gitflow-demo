#!/bin/bash

set -euo pipefail

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source ${SCRIPT_DIR}/utils.sh

AWS_ACCOUNTS_FILE=${AWS_ACCOUNTS_FILE:-"./accounts.json"}
if [[ ! -f "${AWS_ACCOUNTS_FILE}" ]]; then
    echo "{}" > ${AWS_ACCOUNTS_FILE}
fi

AWS_ACCOUNTS=$(cat "${AWS_ACCOUNTS_FILE}")

ACCOUNTS=(core shared sandbox develop staging production)
for ACCOUNT in "${ACCOUNTS[@]}"
do
    print_info "◈ Setup '$ACCOUNT' account:"

    CURRENT_AWS_PROFILE=$(echo $AWS_ACCOUNTS | jq -r --arg ACCOUNT "$ACCOUNT" '.[$ACCOUNT].profile // "-"')
    CURRENT_AWS_ACCOUNT_ID=$(echo $AWS_ACCOUNTS | jq -r --arg ACCOUNT "$ACCOUNT" '.[$ACCOUNT].accountId // "-"')
    CURRENT_AWS_REGION=$(echo $AWS_ACCOUNTS | jq -r --arg ACCOUNT "$ACCOUNT" '.[$ACCOUNT].region // "us-east-1"')

    read -p "AWS PROFILE [${CURRENT_AWS_PROFILE:-"-"}]: " -r AWS_PROFILE
    read -p "AWS ACCOUNT ID [${CURRENT_AWS_ACCOUNT_ID:-"-"}]: " -r AWS_ACCOUNT_ID
    read -p "AWS REGION [${CURRENT_AWS_REGION:-"-"}]: " -r AWS_REGION

    # Get AWS account ID from the local configured profile
    # AWS_ACCOUNT_ID=$(aws configure get sso_account_id --profile ${AWS_PROFILE})

    AWS_PROFILE=${AWS_PROFILE:-"${CURRENT_AWS_PROFILE}"}
    AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-"${CURRENT_AWS_ACCOUNT_ID}"}
    AWS_REGION=${AWS_REGION:-"${CURRENT_AWS_REGION}"}

    jq-update ${AWS_ACCOUNTS_FILE} "${ACCOUNT}.profile" ${AWS_PROFILE}
    jq-update ${AWS_ACCOUNTS_FILE} "${ACCOUNT}.accountId" ${AWS_ACCOUNT_ID}
    jq-update ${AWS_ACCOUNTS_FILE} "${ACCOUNT}.region" ${AWS_REGION}
done

print_info ""
print_info "◈ Setup Complete!"
print_info ""

print_info "◈ Accounts Metadata (${AWS_ACCOUNTS_FILE}):"
jq . ${AWS_ACCOUNTS_FILE}
print_info ""
