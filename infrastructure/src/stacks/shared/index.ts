import * as Path from 'path';
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import * as Iam from 'aws-cdk-lib/aws-iam';
import * as Ecr from 'aws-cdk-lib/aws-ecr';
import * as S3 from 'aws-cdk-lib/aws-s3';
import * as S3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as Events from 'aws-cdk-lib/aws-events';
import * as EventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as Lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

import { CoreStack } from '../core';
import { CodeRepository } from '../core/constructs';

import { Config } from '../../config';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';

export interface SharedStackProps extends StackProps {
    config: Config,
    coreStack: CoreStack
}

export class SharedStack extends Stack {
    public readonly config: Config;
    public readonly coreStack: CoreStack;
    public resourcesBucket: S3.Bucket;
    public serviceMetadataUpdateProjectRole: Iam.Role;
    public servicePipelineArtifactBucket: S3.Bucket;
    public triggerServicePipelineFunction: NodejsFunction;
    public codeBuildBaseImage: DockerImageAsset;
    public ecrRepositories: {
        [key: string]: Ecr.Repository
    } = {};

    constructor(scope: Construct, id: string, props: SharedStackProps) {
        super(scope, id, props);

        this.config = props.config;
        this.coreStack = props.coreStack;

        // this.createCodeBuildBaseImage();
        this.createEcrRepositoriesForServices();
        this.createResourcesBucket();;
        this.createServicePipelineArtifactBucket();
        this.createServicePipelineTemplate();
        this.createTriggerServicePipelineFunction();
        this.createRepositoriesForServices();
    }

    /**
     * CodeBuild Base Image
     * 
     * Create a Docker Image Asset for the Services CodeBuild Base Image
     * In this image, we should include all the necessary common tools and dependencies 
     * for the services build process that can be re-used (cicd-entrypoint, utils ...).
     * 
     * NOTE: This is optional and a bit out of scope for this demo project, and so it's commented out.
     *       However, it can be useful in a real-world scenario to avoid copying common tools 
     *       and dependencies across services source code.
     */
    public createCodeBuildBaseImage() {
        this.codeBuildBaseImage = new DockerImageAsset(this, 'CodeBuildBaseImage', {
            assetName: 'codebuild-base-image',
            directory: Path.join(__dirname, '../../../resources/codebuild-base-image')
        });
    }

    /**
     * Docker Image Repositories for Workload Services
     * 
     * In ECR, we have to create a repository for each service.
     * Naming convention: <namespace>/<service-name>:<tag>
     * Example: services/demo:latest
     */
    protected createEcrRepositoriesForServices() {
        const sandboxAccountId    = this.config.environments.sandbox.account.accountId;
        const developAccountId    = this.config.environments.develop.account.accountId;
        const stagingAccountId    = this.config.environments.staging.account.accountId;
        const productionAccountId = this.config.environments.production.account.accountId;

        const ecrResourcePolicy = new Iam.PolicyStatement({
            effect: Iam.Effect.ALLOW,
            actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:GetRepositoryPolicy',
                'ecr:DescribeRepositories',
                'ecr:ListImages',
                'ecr:DescribeImages',
                'ecr:BatchGetImage',
                'ecr:GetLifecyclePolicy',
                'ecr:GetLifecyclePolicyPreview',
                'ecr:ListTagsForResource',
                'ecr:DescribeImageScanFindings'
            ],
            principals: [
                new Iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
                new Iam.AccountPrincipal(sandboxAccountId),
                new Iam.AccountPrincipal(developAccountId),
                new Iam.AccountPrincipal(stagingAccountId),
                new Iam.AccountPrincipal(productionAccountId)
            ],
            conditions: {
                ArnLike: {
                    'aws:PrincipalArn': [
                        `arn:aws:iam::${sandboxAccountId}:role/*-execution-role`,
                        `arn:aws:iam::${developAccountId}:role/*-execution-role`,
                        `arn:aws:iam::${stagingAccountId}:role/*-execution-role`,
                        `arn:aws:iam::${productionAccountId}:role/*-execution-role`
                    ]
                }
            }
        });

        for (let service of Object.values(this.config.workloads.services)) {
            // Create ECR repository for the service
            this.ecrRepositories[service.name] = new Ecr.Repository(this, `${service.name}-Service-ECR-Repository`, {
                repositoryName: `services/${service.name}`,
                ...this.config.shared.ecr
            });

            // Grant ECS Service Execution Role read-only access to ECR repository
            this.ecrRepositories[service.name].addToResourcePolicy(ecrResourcePolicy);

            new CfnOutput(this, `${service.name}-ecr-repository-uri`, {
                description: `${service.name}-service-ecr-repository-uri`,
                value: this.ecrRepositories[service.name].repositoryUri
            });
        }
    }

    /**
     * Code repositories for Workloads Services
     */
    protected createRepositoriesForServices() {
        for (let service of Object.values(this.config.workloads.services)) {
            const serviceCodeRepository = new CodeRepository(this, `${service.repositoryName}-Repository`, {
                name: service.repositoryName,
                description: service.repositoryDescription
            });

            this.createServicePipelineTrigger(service, serviceCodeRepository);
        }
    }

    /**
     * Create a Lambda function used to create or delete a Service Pipeline for a specific code repository branch
     * that may be created or delete dynamically based on Gitflow branching model.
     */
    protected createTriggerServicePipelineFunction() {
        this.triggerServicePipelineFunction = new NodejsFunction(this, `TriggerServicePipelineFunction`, {
            functionName: 'trigger-service-pipeline',
            description: 'Lambda function to trigger the creation or deletion of a Service Pipeline',
            runtime: Lambda.Runtime.NODEJS_20_X,
            entry: Path.join(__dirname, 'functions', 'trigger-service-pipeline.ts'),
            handler: 'handler',
            environment: {
                CORE_ACCOUNT_ID: this.coreStack.account,
                CORE_ACCOUNT_REGION: this.coreStack.region,
                PIPELINE_TEMPLATE_URL: this.servicePipelineTemplateUrl,
                PIPELINE_TEMPLATE_BUCKET: this.resourcesBucket.bucketName,
                PIPELINE_TEMPLATE_KEY: this.servicePipelineTemplateObjectKey,
                CI_SERVICE_IMAGE_REPOSITORY_URL: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/services`,
                CI_PROJECT_NAME: this.config.project.name,
                CI_PROJECT_KEY: this.config.project.key,
                CI_PROJECT_DOMAIN: this.config.project.domain,
                CORE_METADATA_UPDATE_PROJECT_NAME: this.coreStack.pipeline.serviceMetadataUpdateProject.projectName,
                CORE_METADATA_UPDATE_PROJECT_ROLE_ARN: this.coreStack.pipeline.serviceMetadataUpdateProjectRole.roleArn,
                CODEBUILD_METADATA_UPDATE_PROJECT_ROLE_ARN: this.serviceMetadataUpdateProjectRole.roleArn
            }
        });

        // Grant Lambda function read access to the Service Pipeline template
        this.resourcesBucket.grantRead(this.triggerServicePipelineFunction, this.servicePipelineTemplateObjectKey);

        // Grant necessary permissions to the Lambda function
        // NOTE: Should have more fine-grained permissions based on the least privilege principle
        const pipelineManagementPolicy = new Iam.Policy(this, 'PipelineManagementPolicy', {
            policyName: 'trigger-service-pipeline-function-role-policy',
            statements: [
                new Iam.PolicyStatement({
                    sid: 'AllowCoreUpdateProjectRoleAssume',
                    effect: Iam.Effect.ALLOW,
                    actions: [
                        'sts:AssumeRole'
                    ],
                    resources: [
                        `arn:aws:iam::${this.coreStack.account}:role/service-metadata-update-project-role`
                    ]
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'cloudformation:CreateStack',
                        'cloudformation:DeleteStack',
                        'cloudformation:DescribeStacks'
                    ],
                    resources: ['*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'iam:CreateRole',
                        'iam:AttachRolePolicy',
                        'iam:DetachRolePolicy',
                        'iam:PutRolePolicy',
                        'iam:DeleteRolePolicy',
                        'iam:DeleteRole',
                        'iam:PassRole',
                        'iam:GetRole',
                        'iam:GetRolePolicy'
                    ],
                    resources: ['arn:aws:iam::*:role/*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'codepipeline:CreatePipeline',
                        'codepipeline:DeletePipeline',
                        'codepipeline:UpdatePipeline',
                        'codepipeline:GetPipeline',
                        'codepipeline:ListPipelines',
                        'codepipeline:StartPipelineExecution',
                        'codepipeline:StopPipelineExecution',
                        'codepipeline:GetPipelineExecution',
                        'codepipeline:GetPipelineState'
                    ],
                    resources: ['*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'codebuild:CreateProject',
                        'codebuild:DeleteProject',
                        'codebuild:UpdateProject',
                        'codebuild:BatchGetProjects',
                        'codebuild:StartBuild',
                        'codebuild:StopBuild',
                        'codebuild:BatchGetBuilds',
                        'codebuild:BatchDeleteBuilds'
                    ],
                    resources: ['*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        's3:CreateBucket',
                        's3:DeleteBucket',
                        's3:PutObject',
                        's3:GetObject',
                        's3:ListBucket',
                        's3:PutBucketPolicy',
                        's3:GetBucketPolicy'
                    ],
                    resources: ['arn:aws:s3:::*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'ecr:GetDownloadUrlForLayer',
                        'ecr:BatchGetImage',
                        'ecr:BatchCheckLayerAvailability',
                        'ecr:PutImage',
                        'ecr:InitiateLayerUpload',
                        'ecr:UploadLayerPart',
                        'ecr:CompleteLayerUpload'
                    ],
                    resources: ['arn:aws:ecr:*:*:repository/*']
                }),
                new Iam.PolicyStatement({
                    actions: [
                        'codecommit:GitPull',
                        'codecommit:GetBranch',
                        'codecommit:GetCommit',
                        'codecommit:UploadArchive',
                        'codecommit:GetUploadArchiveStatus',
                        'codecommit:ListRepositories'
                    ],
                    resources: ['arn:aws:codecommit:*:*:*']
                })
            ]
        });

        pipelineManagementPolicy.attachToRole(this.triggerServicePipelineFunction.role!);
    }

    /**
     * EventBridge Rule to trigger the Lambda function on branch creation or deletion
     */
    protected createServicePipelineTrigger(service: any, serviceCodeRepository: CodeRepository) {
        const eventsRule = new Events.Rule(this, 'BranchEvent', {
            ruleName: `${service.name}-service-branch-event-rule`,
            eventPattern: {
                source: ['aws.codecommit'],
                detail: {
                    event: ['referenceCreated', 'referenceDeleted'],
                    repositoryName: [serviceCodeRepository.repository.repositoryName],
                    referenceType: ['branch']
                }
            }
        });

        eventsRule.addTarget(new EventsTargets.LambdaFunction(this.triggerServicePipelineFunction, {
            event: Events.RuleTargetInput.fromObject({
                originalEvent: Events.EventField.fromPath('$'),
                serviceName: service.name
            })
        }));
    }

    /**
     * Create Shared Resources Bucket
     */
    protected createResourcesBucket() {
        this.resourcesBucket = new S3.Bucket(this, 'Infrastructure-Resources-Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        new CfnOutput(this, 'infrastructure-resources-bucket', {
            description: 'Infrastructure Resources Bucket',
            value: this.resourcesBucket.bucketName
        });
    }

    /**
     * Create Service Pipeline Artifact Bucket
     */
    protected createServicePipelineArtifactBucket() {
        this.servicePipelineArtifactBucket = new S3.Bucket(this, 'ServicePipelineArtifactBucket', {
            bucketName: 'service-pipeline-artifact-bucket',
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        new CfnOutput(this, 'service-pipeline-artifact-bucket', {
            description: 'Service Pipeline Artifact Bucket',
            value: this.servicePipelineArtifactBucket.bucketName
        });

        new CfnOutput(this, 'service-pipeline-artifact-bucket-arn', {
            description: 'Service Pipeline Artifact Bucket ARN',
            value: this.servicePipelineArtifactBucket.bucketArn
        });
    }

    get servicePipelineArtifactBucketArn(): string {
        return this.servicePipelineArtifactBucket.bucketArn;
    }

    /**
     * Create Service Pipeline Template
     */
    protected createServicePipelineTemplate() {
        // Role for the Service Metadata Update Project that will assume role in the Core account to update the service metadata
        this.serviceMetadataUpdateProjectRole = new Iam.Role(this, 'ServiceMetadataUpdateProjectRole', {
            roleName: 'service-metadata-update-project-role',
            assumedBy: new Iam.ServicePrincipal('codebuild.amazonaws.com'),
            inlinePolicies: {
                'ServiceMetadataUpdateProjectRolePolicy': new Iam.PolicyDocument({
                    statements: [
                        new Iam.PolicyStatement({
                            sid: 'AllowCoreUpdateProjectRoleAssume',
                            effect: Iam.Effect.ALLOW,
                            actions: [
                                'sts:AssumeRole'
                            ],
                            resources: [
                                `arn:aws:iam::${this.coreStack.account}:role/service-metadata-update-project-role`
                            ]
                        }),
                        new Iam.PolicyStatement({
                            sid: 'CloudWatchLogsAccess',
                            effect: Iam.Effect.ALLOW,
                            actions: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents'
                            ],
                            resources: [
                                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/codebuild/${this.config.project.key}-smup-*`
                            ]
                        }),
                        new Iam.PolicyStatement({
                            sid: 'ServicePipelineArtifactBucketAccess',
                            effect: Iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:GetObjectVersion',
                                's3:GetBucketVersioning',
                                's3:GetBucketLocation',
                                's3:ListBucket',
                                's3:PutObject',
                                's3:PutObjectAcl',
                                's3:DeleteObject',
                                's3:DeleteObjectVersion',
                                's3:AbortMultipartUpload'
                            ],
                            resources: [
                                this.servicePipelineArtifactBucket.bucketArn,
                                `${this.servicePipelineArtifactBucket.bucketArn}/*`
                            ]
                        })
                    ]
                })
            }
        });

        // Store the CloudFormation template in the shared resources S3 bucket
        new S3Deployment.BucketDeployment(this, 'DeployTemplate', {
            sources: [S3Deployment.Source.asset(Path.join(__dirname, './templates'))],
            destinationBucket: this.resourcesBucket,
            destinationKeyPrefix: 'infrastructure/templates/',
            retainOnDelete: false,
            prune: false
        });
    }

    get servicePipelineTemplateUrl(): string {
        return `https://${this.resourcesBucket.bucketRegionalDomainName}/${this.servicePipelineTemplateObjectKey}`;
    }

    get servicePipelineTemplateObjectKey(): string {
        return 'infrastructure/templates/service-pipeline-template.yaml';
    }
}
