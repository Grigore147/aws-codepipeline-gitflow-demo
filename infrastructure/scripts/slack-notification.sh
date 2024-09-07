#!/bin/bash

set -euo pipefail

SLACK_WEBHOOK_URL="<SLACK_WEBHOOK_URL>"

SERVICE_NAME="demo"
SERVICE_VERSION="v1.0.0"
SERVICE_ENVIRONMENT="Production"
SERVICE_URL="http://example.com/production/demo"

MESSAGE=$(cat <<EOF
{
	"blocks": [
		{
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": "Service update deployed",
				"emoji": true
			}
		},
		{
			"type": "section",
			"fields": [
				{
					"type": "mrkdwn",
					"text": "*Service:*\n${SERVICE_NAME}"
				},
				{
					"type": "mrkdwn",
					"text": "*Version:*\n${SERVICE_VERSION}"
				}
			]
		},
		{
			"type": "section",
			"fields": [
				{
					"type": "mrkdwn",
					"text": "*Environment:*\n${SERVICE_ENVIRONMENT}"
				},
				{
					"type": "mrkdwn",
					"text": "*URL:*\n${SERVICE_URL}"
				}
			]
		},
		{
			"type": "divider"
		},
		{
			"type": "actions",
			"elements": [
				{
					"type": "button",
					"text": {
						"type": "plain_text",
						"text": "Open",
						"emoji": true
					},
					"url": "${SERVICE_URL}",
				}
			]
		}
	]
}
EOF
)

curl -X POST -H 'Content-Type: application/json' --data "${MESSAGE}" ${SLACK_WEBHOOK_URL}
