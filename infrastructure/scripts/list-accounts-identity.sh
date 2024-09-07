#!/bin/bash

set -euo pipefail

CURRENT_DIR=$(pwd)
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source ${SCRIPT_DIR}/utils.sh

AWS_ACCOUNTS_FILE=${AWS_ACCOUNTS_FILE:-"./accounts.json"}
AWS_ACCOUNTS=$(cat "${AWS_ACCOUNTS_FILE}")

print_info "◈ AWS Accounts"

ACCOUNTS=(core shared sandbox develop staging production)
for ACCOUNT in "${ACCOUNTS[@]}"
do
    TARGET_PROFILE=$(echo ${AWS_ACCOUNTS} | jq -r ".${ACCOUNT}.profile")

    print_info "◈ Account for '$TARGET_PROFILE' profile [${ACCOUNT}]:"
    print_info "    Account: $(echo ${AWS_ACCOUNTS} | jq -r ".${ACCOUNT}.accountId")"
    print_info "    Region:  $(echo ${AWS_ACCOUNTS} | jq -r ".${ACCOUNT}.region")"

    aws sts get-caller-identity --profile ${TARGET_PROFILE} | jq

    print_info ""
done
