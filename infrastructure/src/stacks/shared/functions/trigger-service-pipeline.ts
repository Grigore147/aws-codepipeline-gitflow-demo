import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { CloudFormationClient, CreateStackCommand, DeleteStackCommand } from '@aws-sdk/client-cloudformation';
import { CodeBuildClient, StartBuildCommand, StartBuildCommandInput } from '@aws-sdk/client-codebuild';
import { Handler } from 'aws-lambda';

const CloudFormation = new CloudFormationClient();

const {
    CORE_ACCOUNT_ID,
    CORE_ACCOUNT_REGION,
    PIPELINE_TEMPLATE_URL,
    PIPELINE_TEMPLATE_BUCKET,
    PIPELINE_TEMPLATE_KEY,
    CI_SERVICE_IMAGE_REPOSITORY_URL,
    CI_PROJECT_NAME,
    CI_PROJECT_KEY,
    CI_PROJECT_DOMAIN,
    CORE_METADATA_UPDATE_PROJECT_NAME,
    CORE_METADATA_UPDATE_PROJECT_ROLE_ARN,
    CODEBUILD_METADATA_UPDATE_PROJECT_ROLE_ARN
} = process.env;

const BRANCH_CREATED = 'referenceCreated';
const BRANCH_DELETED = 'referenceDeleted';

export const handler: Handler = async (event) => {
    console.log('Event: ', JSON.stringify(event, null, 2));

    const SERVICE_NAME = event.serviceName as string;

    // Original event containing details
    event = event.originalEvent;

    const EVENT_TYPE = event.detail.event as string;
    
    const REPOSITORY_NAME = event.detail.repositoryName as string;
    const BRANCH_NAME = event.detail.referenceName as string;
    const BRANCH_NAME_PRETTIFIED = BRANCH_NAME.replace(/\/|\./g, '-').toLowerCase();

    const PIPELINE_STACK_NAME = `${SERVICE_NAME}-pipeline-${BRANCH_NAME_PRETTIFIED}`;

    // Check if the branch name is a valid Gitflow branch
    // Not perfect regex, may need to be more strict when in production
    const GITFLOW_BRANCH_REGEX = /^(feature|develop|release|main)/;
    if (!GITFLOW_BRANCH_REGEX.test(BRANCH_NAME)) {
        console.log(`Branch ${BRANCH_NAME} is not a valid Gitflow branch.`);
        return;
    }

    try {
        if (EVENT_TYPE === BRANCH_CREATED) {
            const createStackCommand = new CreateStackCommand({
                StackName: PIPELINE_STACK_NAME,
                TemplateURL: PIPELINE_TEMPLATE_URL,
                Parameters: [
                    { ParameterKey: 'CoreAccountId', ParameterValue: CORE_ACCOUNT_ID },
                    { ParameterKey: 'CoreAccountRegion', ParameterValue: CORE_ACCOUNT_REGION },
                    { ParameterKey: 'CIServiceName', ParameterValue: SERVICE_NAME },
                    { ParameterKey: 'CIServiceImageRepositoryURL', ParameterValue: CI_SERVICE_IMAGE_REPOSITORY_URL },
                    { ParameterKey: 'RepositoryName', ParameterValue: REPOSITORY_NAME },
                    { ParameterKey: 'BranchName', ParameterValue: BRANCH_NAME },
                    { ParameterKey: 'BranchNamePrettified', ParameterValue: BRANCH_NAME_PRETTIFIED },
                    { ParameterKey: 'CoreMetadataUpdateProjectName', ParameterValue: CORE_METADATA_UPDATE_PROJECT_NAME },
                    { ParameterKey: 'CoreMetadataUpdateProjectRoleArn', ParameterValue: CORE_METADATA_UPDATE_PROJECT_ROLE_ARN },
                    { ParameterKey: 'CodeBuildMetadataUpdateProjectRoleArn', ParameterValue: CODEBUILD_METADATA_UPDATE_PROJECT_ROLE_ARN }
                ],
                OnFailure: 'ROLLBACK',
                Capabilities: ['CAPABILITY_NAMED_IAM']
            });

            await CloudFormation.send(createStackCommand);

            console.log(`Stack ${PIPELINE_STACK_NAME} creation initiated.`);
        }

        if (EVENT_TYPE === BRANCH_DELETED) {
            const deleteStackCommand = new DeleteStackCommand({
                StackName: PIPELINE_STACK_NAME
            });

            // Delete the Service Pipeline Stack for deleted branch
            await CloudFormation.send(deleteStackCommand);

            // If the branch is not a release branch, delete the service version from the Infrastructure Service Metadata
            // This is to ensure that we keep the latest release version deployed on staging environment until next release
            if (!BRANCH_NAME_PRETTIFIED.startsWith('release-')) {
                const CodeBuild = new CodeBuildClient({
                    region: CORE_ACCOUNT_REGION,
                    credentials: fromTemporaryCredentials({
                        params: {
                            RoleArn: CORE_METADATA_UPDATE_PROJECT_ROLE_ARN,
                            RoleSessionName: 'cross-account-codebuild-session'  
                        }
                    })
                });
    
                // Delete Service version for this branch from the Infrastructure Service Metadata
                const serviceMetadata = Buffer.from(JSON.stringify(
                    getServiceEnvironmentFromBranchName(BRANCH_NAME_PRETTIFIED, CI_PROJECT_KEY!)
                , null, 2)).toString('base64');
    
                const startBuildCommandInput: StartBuildCommandInput = {
                    projectName: CORE_METADATA_UPDATE_PROJECT_NAME,
                    environmentVariablesOverride: [
                        { name: 'SERVICE_NAME', value: SERVICE_NAME },
                        { name: 'SERVICE_METADATA', value: serviceMetadata },
                        { name: 'SERVICE_METADATA_ACTION', value: 'DELETE' }
                    ]
                };
    
                await CodeBuild.send(new StartBuildCommand(startBuildCommandInput));
            }

            console.log(`Stack ${PIPELINE_STACK_NAME} deletion initiated.`);
        }
    } catch (error) {
        console.error(`Failed to process event: ${(error as Error).message}`);
        throw error;
    }
};

// Yeah... naming is hard sometimes 😅
function getServiceEnvironmentFromBranchName(branchName: string, projectKey: string): string {
    if (branchName === 'main') {
        return 'production';
    } else if (branchName.startsWith('release')) {
        return 'staging';
    } else if (branchName === 'develop') {
        return 'develop';
    } else if (branchName.startsWith('feature')) {
        if (branchName.startsWith('feature-feature')) {
            branchName = branchName.replace('feature-', '');
        } else if (branchName.startsWith(`feature-${projectKey}`)) {
            branchName = `feature`+ branchName.replace(`feature-${projectKey}`, '');
        }

        return `sandbox.features.${branchName}`;
    }

    return branchName;
}
