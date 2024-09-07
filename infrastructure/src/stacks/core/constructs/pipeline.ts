import * as Path from 'path';

import { RemovalPolicy, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as Iam from 'aws-cdk-lib/aws-iam';
import * as Kms from 'aws-cdk-lib/aws-kms';
import * as Pipelines from "aws-cdk-lib/pipelines";
import * as CodeBuild from "aws-cdk-lib/aws-codebuild";
import * as S3 from "aws-cdk-lib/aws-s3";

import { CodeRepository } from './';
import { Config } from '../../../config';

export interface CorePipelineProps {
    config: Config;
    coreRepository: CodeRepository;
}

export class CorePipeline extends Construct {
    public config: Config;
    public pipeline: Pipelines.CodePipeline;
    public serviceMetadataUpdateProject: CodeBuild.Project;
    public serviceMetadataUpdateProjectRole: Iam.Role;
    public coreRepository: CodeRepository;

    constructor(scope: Construct, name: string, props: CorePipelineProps) {
        super(scope, name);

        this.config = props.config;
        this.coreRepository = props.coreRepository;

        this.createCorePipeline();
        this.createServiceMetadataUpdateProject();
    }

    protected createCorePipeline() {
        const kmsKey = new Kms.Key(this, 'PipelineKmsKey', {
            alias: 'core-codepipeline-kms-key',
            description: 'KMS key for Core CodePipeline artifacts Bucket',
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const pipelineArtifactBucket = new S3.Bucket(this, 'CoreCodePipelineArtifactBucket', {
            bucketName: 'core-codepipeline-artifact-bucket',
            encryption: S3.BucketEncryption.KMS,
            encryptionKey: kmsKey,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        this.pipeline = new Pipelines.CodePipeline(this, 'CoreCodePipeline', {
            pipelineName: 'core-codepipeline',
            crossAccountKeys: true,
            enableKeyRotation: true,
            dockerEnabledForSynth: false,
            dockerEnabledForSelfMutation: false,
            artifactBucket: pipelineArtifactBucket,
            codeBuildDefaults: {
                partialBuildSpec: CodeBuild.BuildSpec.fromObject({
                    version: 0.2,
                    phases: {
                        install: {
                            'runtime-versions': {
                                nodejs: '20'
                            }
                        }
                    }
                })
            },
            synth: new Pipelines.CodeBuildStep('SynthStep', {
                projectName: 'core-codepipeline-synth-project',
                input: Pipelines.CodePipelineSource.codeCommit(this.coreRepository.repository, 'main'),
                buildEnvironment: {
                    buildImage: CodeBuild.LinuxBuildImage.STANDARD_7_0,
                    privileged: true
                },
                installCommands: [
                    'npm install -g aws-cdk@2',
                    'npm install -g esbuild'
                ],
                commands: [
                    'cd ./infrastructure',
                    'npm ci',
                    'npm run build',
                    'npx aws-cdk synth -o ./cdk.out'
                ],
                primaryOutputDirectory: './infrastructure/cdk.out'
            })
        });
    }

    /**
     * Create a CodeBuild project to update the service metadata in the core infrastructure repository
     * 
     * @NOTE: This is a opinionated approach to update the service metadata 
     *        in the core infrastructure repository for this limited use-case.
     *        Limits and trade-offs have to be considered for a more generic approach.
     */
    protected createServiceMetadataUpdateProject() {
        const sharedAccountId = this.config.environments.shared.account.accountId;

        this.serviceMetadataUpdateProject = new CodeBuild.Project(this, 'ServiceMetadataUpdateProject', {
            projectName: 'service-metadata-update-project',
            environment: {
                buildImage: CodeBuild.LinuxBuildImage.STANDARD_7_0,
                privileged: true
            },
            environmentVariables: {
                CORE_REPOSITORY_URL: {
                    value: this.coreRepository.repository.repositoryCloneUrlGrc
                },
                CORE_REPOSITORY_BRANCH: {
                    value: 'main'
                }
            },
            buildSpec: CodeBuild.BuildSpec.fromObject({
                version: 0.2,
                phases: {
                    install: {
                        'runtime-versions': {
                            nodejs: '20'
                        },
                        commands: [
                            'echo "Installing dependencies"',
                            'pip install git-remote-codecommit'
                        ]
                    },
                    pre_build: {
                        commands: [
                            'echo "Cloning the infrastructure repository"',
                            'git clone ${CORE_REPOSITORY_URL} --branch ${CORE_REPOSITORY_BRANCH} ./infrastructure',
                            'cd ./infrastructure/infrastructure',
                            'npm ci'
                        ]
                    },
                    build: {
                        commands: [
                            'echo "Updating services.json with the new service metadata"',

                            './scripts/update-service-metadata',

                            'git config --global user.email "aws-codebuild@example.com"',
                            'git config --global user.name "AWS CodeBuild"',

                            'git add services.json',

                            'git commit -m "Updated services metadata for ${SERVICE_NAME} service"',

                            'echo "Pushing changes to the repository"',
                            'git push origin ${CORE_REPOSITORY_BRANCH}'
                        ]
                    }
                }
            })
        });

        this.serviceMetadataUpdateProject.addToRolePolicy(new Iam.PolicyStatement({
            actions: [
                'codecommit:GitPull',
                'codecommit:GitPush',
                'codecommit:GetBranch',
                'codecommit:GetCommit',
                'codecommit:UploadArchive',
                'codecommit:GetUploadArchiveStatus',
                'codecommit:ListRepositories'
            ],
            resources: [
                this.coreRepository.repository.repositoryArn
            ]
        }));

        this.serviceMetadataUpdateProjectRole = new Iam.Role(this, 'ServiceMetadataUpdateProjectRole', {
            roleName: 'service-metadata-update-project-role',
            assumedBy: new Iam.AccountPrincipal(sharedAccountId)
            // assumedBy: new Iam.ServicePrincipal('codebuild.amazonaws.com')
            // assumedBy: new Iam.ArnPrincipal(`arn:aws:iam::${sharedAccountId}:role/service-metadata-update-project-role`)
        });

        const serviceMetadataUpdateProjectPolicy = new Iam.Policy(this, 'ServiceMetadataUpdateProjectPolicy', {
            policyName: 'service-metadata-update-project-policy',
            statements: [
                new Iam.PolicyStatement({
                    effect: Iam.Effect.ALLOW,
                    actions: [
                        'codebuild:StartBuild'
                    ],
                    resources: [
                        this.serviceMetadataUpdateProject.projectArn
                    ],
                    conditions: {
                        // ArnLike: {
                        //     'aws:PrincipalArn': [
                        //         arn:aws:sts::${codeAccountId}:assumed-role/service-metadata-update-project-role/*
                        //         `arn:aws:iam::${sharedAccountId}:role/service-metadata-update-project-role`
                        //     ]
                        // }
                        // Check for condition that the role is assumed by the CodeBuild in the Shared Account
                        // ArnLike: {
                        //     'aws:SourceArn': [
                        //         `arn:aws:codebuild:${this.config.environments.shared.region}:${sharedAccountId}:project/service-metadata-update-project`
                        //     ]
                        // }
                    }
                })
            ]
        });

        serviceMetadataUpdateProjectPolicy.attachToRole(this.serviceMetadataUpdateProjectRole);
    }

    get serviceMetadataUpdateProjectRoleArn(): string {
        return this.serviceMetadataUpdateProjectRole.roleArn;
    }

    addStage(stage: Stage, options?: Pipelines.AddStageOpts): Pipelines.StageDeployment {
        return this.pipeline.addStage(stage, options);
    }
}
