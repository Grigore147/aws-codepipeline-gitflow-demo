import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, IpAddresses, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationListener, ApplicationLoadBalancer, ApplicationProtocol, ListenerAction } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as Ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

import { WorkloadsStage } from '../../stages';
import { DemoService } from './services';

import {
    SANDBOX_ENVIRONMENT
} from '../../constants';
import { Config, Service } from '../../config';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';

const WorkloadsServices = {
    demo: DemoService
}

export interface WorkloadsStackProps extends StackProps {
    config: Config,
    workloadsStage: WorkloadsStage
}

export class WorkloadsStack extends Stack {
    public readonly config: Config;
    public readonly workloadsStage: WorkloadsStage;
    public vpc: Vpc;
    public loadBalancer: ApplicationLoadBalancer;
    public loadBalancerHttpListener: ApplicationListener;
    public loadBalancerSecurityGroup: SecurityGroup;
    public ecsCluster: Ecs.Cluster;

    constructor(scope: Construct, id: string, props: WorkloadsStackProps) {
        super(scope, id, {
            stackName: `${props.workloadsStage.envStage}-WorkloadsStack`,
            env: {
                account: props.workloadsStage.environment.account.accountId,
                region: props.workloadsStage.environment.region
            },
            tags: {
                Environment: props.workloadsStage.environment.name
            }
        });

        this.config = props.config;
        this.workloadsStage = props.workloadsStage;

        this.createNetwork();
        this.createLoadBalancer();
        this.createEcsCluster();
        this.createServices();
    }

    /**
     * Network baseline for Workloads Environment
     */
    protected createNetwork() {
        this.vpc = new Vpc(this, `${this.stackName}-VPC`, {
            vpcName: this.generateResourceName('vpc'),
            ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
            availabilityZones: ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'],
            enableDnsHostnames: true,
            enableDnsSupport: true,
            natGateways: 3,
            subnetConfiguration: [
                {
                    name: this.generateResourceName('public-subnet'),
                    subnetType: SubnetType.PUBLIC,
                    cidrMask: 24
                },
                {
                    name: this.generateResourceName('protected-subnet'),
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24
                }
            ]
        });
    }

    /**
     * Application Load Balancer for Workloads Services
     */
    protected createLoadBalancer() {
        this.loadBalancerSecurityGroup = new SecurityGroup(this, `${this.stackName}-ALB-SecurityGroup`, {
            vpc: this.vpc,
            allowAllOutbound: true,
            securityGroupName: this.generateResourceName('alb-security-group'),
            description: 'Security group for the Workloads Load Balancer'
        });
        this.loadBalancerSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.HTTP, 'Allow HTTP traffic from the Internet');
        this.loadBalancerSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.HTTPS, 'Allow HTTPS traffic from the Internet');

        this.loadBalancer = new ApplicationLoadBalancer(this, `${this.stackName}-ALB`, {
            loadBalancerName: this.generateResourceName('alb'),
            vpc: this.vpc,
            internetFacing: true,
            securityGroup: this.loadBalancerSecurityGroup,
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC
            }
        });

        this.loadBalancerHttpListener = this.loadBalancer.addListener('HTTPListener', {
            protocol: ApplicationProtocol.HTTP,
            port: 80
        });

        this.loadBalancerHttpListener.addAction(`${this.stackName}-ALB-DefaultAction`, {
            action: ListenerAction.fixedResponse(200, {
                contentType: 'text/plain',
                messageBody: 'OK'
            })
        });

        new CfnOutput(this, `${this.stackName}-ALB-DNS`, {
            description: this.generateResourceName('alb-dns'),
            value: this.loadBalancer.loadBalancerDnsName
        });
    }

    /**
     * ECS Cluster for Workloads Services
     */
    protected createEcsCluster() {
        this.ecsCluster = new Ecs.Cluster(this, `${this.stackName}-ECS-Cluster`, {
            clusterName: this.generateResourceName('ecs-cluster'),
            vpc: this.vpc,
            containerInsights: true
        });

        const ecsAsgSecurityGroup = new SecurityGroup(this, `${this.stackName}-ECS-ASG-SecurityGroup`, {
            securityGroupName: this.generateResourceName('ecs-asg-security-group'),
            description: 'Security group for the ECS Auto Scaling Group',
            vpc: this.vpc
        });

        ecsAsgSecurityGroup.addIngressRule(
            this.loadBalancerSecurityGroup, 
            Port.allTraffic(), 
            'Allow all traffic from the Load Balancer Security Group'
        );

        const ecsAutoScalingGroup = new AutoScalingGroup(this, `${this.stackName}-ECS-ASG`, {
            autoScalingGroupName: this.generateResourceName('ecs-asg'),
            vpc: this.vpc,
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS
            },
            securityGroup: ecsAsgSecurityGroup,
            instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
            machineImage: Ecs.EcsOptimizedImage.amazonLinux2(),
            capacityRebalance: true,
            minCapacity: 3,
            maxCapacity: 6
        });

        const ecsCapacityProvider = new Ecs.AsgCapacityProvider(this, `${this.stackName}-ECS-ASG-CapacityProvider`, {
            capacityProviderName: this.generateResourceName('ecs-asg-capacity-provider'),
            autoScalingGroup: ecsAutoScalingGroup,
            enableManagedTerminationProtection: false
        });

        this.ecsCluster.addAsgCapacityProvider(ecsCapacityProvider);
    }

    /**
     * Create Workloads Services
     */
    protected createServices() {
        for (const service of Object.values(this.config.workloads.services)) {
            if (this.workloadsStage.environment.name === SANDBOX_ENVIRONMENT) {
                if (service.config[SANDBOX_ENVIRONMENT].features) {
                    Object.entries(service.config[SANDBOX_ENVIRONMENT].features).forEach(([featureName, feature]) => {
                        this.createService(service, feature, featureName);
                    });
                }
            } else {
                const serviceEnvConfig = service.config[this.workloadsStage.environment.name];

                if (serviceEnvConfig.version) {
                    this.createService(service, serviceEnvConfig);
                }
            }
        }
    }

    protected createService(service: Service<any>, serviceEnvConfig: any, featureName?: string) {
        const serviceName  = service.name as keyof typeof WorkloadsServices;
        const resourceName = `${this.stackName}-${serviceName}-${featureName ? featureName+'-': '' }service`;

        new WorkloadsServices[serviceName](this, resourceName, {
            config: this.config,
            name: service.name,
            service: service,
            serviceEnvConfig: serviceEnvConfig,
            workloadsStack: this,
            ecrRepository: this.workloadsStage.sharedStack.ecrRepositories[service.name]
        });
    }

    public generateResourceName(resourceName: string): string {
        return `${this.workloadsStage.environment.name}-${resourceName}`;
    }

    get servicesBaseUrl(): string {
        return this.loadBalancer.loadBalancerDnsName;
    }
}
