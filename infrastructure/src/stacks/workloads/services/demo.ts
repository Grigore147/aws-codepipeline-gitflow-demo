import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as Ec2 from 'aws-cdk-lib/aws-ec2';
import * as Ecs from 'aws-cdk-lib/aws-ecs';
import * as Ecr from 'aws-cdk-lib/aws-ecr';
import * as Logs from 'aws-cdk-lib/aws-logs';
import { ApplicationProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from "constructs";

import { Config, DemoService as DemoServiceConfig } from "../../../config";
import { WorkloadsStack } from '../../../stacks';
import { Environment } from '../../../constants';

export interface DemoServiceProps {
    name: string,
    config: Config,
    service: DemoServiceConfig,
    serviceEnvConfig: any,
    workloadsStack: WorkloadsStack,
    ecrRepository: Ecr.Repository
}

export class DemoService extends Construct {
    public readonly name: string;
    public readonly config: Config;
    public readonly service: DemoServiceConfig;
    public readonly serviceEnvConfig: any;
    public readonly workloadsStack: WorkloadsStack;
    public readonly ecrRepository: Ecr.Repository;
    public readonly environment: Environment;

    constructor(scope: Construct, id: string, props: DemoServiceProps) {
        super(scope, id);

        this.config = props.config;
        this.name = props.name;
        this.service = props.service;
        this.serviceEnvConfig = props.serviceEnvConfig;
        this.workloadsStack = props.workloadsStack;
        this.ecrRepository = props.ecrRepository;
        this.environment = this.workloadsStack.workloadsStage.environment;

        const executionRole = new Role(this, `${this.namespace}-Execution-Role`, {
            roleName: `${this.namespace}-execution-role`,
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        const taskRole = new Role(this, `${this.namespace}-Task-Role`, {
            roleName: `${this.namespace}-task-role`,
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        const executionRolePolicy = new Policy(this, `${this.namespace}-ECS-Execution-Role-Policy`, {
            policyName: `${this.namespace}-execution-role`,
            statements: [
                new PolicyStatement({
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
                    resources: [this.ecrRepository.repositoryArn]
                }),
                new PolicyStatement({
                    actions: [
                        'logs:CreateLogGroup'
                    ],
                    resources: [`arn:aws:logs:${this.workloadsStack.region}:${this.workloadsStack.account}:log-group:/ecs/${this.namespace}`]
                }),
                new PolicyStatement({
                    actions: [
                        'logs:CreateLogStream',
                        'logs:PutLogEvents'
                    ],
                    resources: [`arn:aws:logs:${this.workloadsStack.region}:${this.workloadsStack.account}:log-group:/ecs/${this.namespace}:*`]
                }),
                new PolicyStatement({
                    actions: [
                        'ecr:GetAuthorizationToken'

                    ],
                    resources: ['*']
                })
            ]
        });

        executionRolePolicy.attachToRole(executionRole);

        const ecsTaskDefinition = new Ecs.Ec2TaskDefinition(this, `${this.namespace}-Task-Definition`, {
            family: `${this.namespace}-task-definition`,
            executionRole: executionRole,
            taskRole: taskRole
        });

        const ecsTaskLogGroup = new Logs.LogGroup(this, `${this.namespace}-Task-Log-Group`, {
            logGroupName: `/ecs/${this.namespace}`,
            removalPolicy: RemovalPolicy.DESTROY,
            retention: Logs.RetentionDays.ONE_WEEK
        });

        ecsTaskDefinition.addContainer(`${this.namespace}-Container`, {
            containerName: `app`,
            image: Ecs.ContainerImage.fromEcrRepository(this.ecrRepository, this.serviceVersion),
            memoryLimitMiB: 256,
            cpu: 256,
            environment: {
                SERVICE_NAME: this.name,
                SERVICE_ENVIRONMENT: this.environment.name,
                SERVICE_VERSION: this.serviceVersion,
                SERVICE_URL: this.serviceUrl
            },
            portMappings: [
                { name: 'http', containerPort: 8000 }
            ],
            healthCheck: {
                command: [
                    'CMD-SHELL',
                    'curl -f http://localhost:8000/ || exit 1'
                ],
                startPeriod: Duration.seconds(60),
                timeout: Duration.seconds(10),
                interval: Duration.seconds(30),
                retries: 3
            },
            logging: Ecs.LogDrivers.awsLogs({
                logGroup: ecsTaskLogGroup,
                streamPrefix: `${this.namespace}-app`
            })
        });

        const ecsService = new Ecs.Ec2Service(this, `${this.namespace}-ECS-Service`, {
            serviceName: this.namespace,
            cluster: this.workloadsStack.ecsCluster,
            taskDefinition: ecsTaskDefinition,
            desiredCount: 3,
            minHealthyPercent: 100,
            maxHealthyPercent: 200,
            placementStrategies: [
                Ecs.PlacementStrategy.spreadAcross(Ecs.BuiltInAttributes.AVAILABILITY_ZONE)
            ],
            propagateTags: Ecs.PropagatedTagSource.SERVICE
        });

        this.workloadsStack.loadBalancerHttpListener.addTargets(`${this.namespace}-ECS-TG`, {
            targetGroupName: `${this.namespace}-ecs-tg`,
            targets: [ecsService],
            // targets: [ecsService.loadBalancerTarget({
            //     containerName: `app`,
            //     containerPort: 8000
            // })],
            protocol: ApplicationProtocol.HTTP,
            port: 80,
            healthCheck: {
                path: '/',
                healthyHttpCodes: '200',
                interval: Duration.seconds(30),
                timeout: Duration.seconds(5),
                healthyThresholdCount: 3,
                unhealthyThresholdCount: 3
            },
            priority: 1,
            conditions: [
                ListenerCondition.pathPatterns([
                    `/${this.serviceEnvConfig.urlPath}`,
                    `/${this.serviceEnvConfig.urlPath}/*`
                ])
            ]
        });

        Tags.of(this).add('Service', this.name);
    }

    get namespace(): string {
        return this.serviceEnvConfig.namespace;
    }

    get serviceVersion(): string {
        return this.serviceEnvConfig.version;
    }

    get serviceUrl(): string {
        return this.serviceEnvConfig.urlType === 'path'
            ? `http://${this.workloadsStack.servicesBaseUrl}/${this.serviceEnvConfig.urlPath}`
            : `http://${this.serviceEnvConfig.urlPath}.${this.workloadsStack.servicesBaseUrl}`;
    }
}
