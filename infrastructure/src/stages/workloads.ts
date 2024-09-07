import { Stage, StageProps, Tags } from "aws-cdk-lib";
import { ManualApprovalStep, StackSteps } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";

import { SharedStack, WorkloadsStack } from "../stacks";

import {
    PRODUCTION_ENVIRONMENT,
    Environment,
    EnvironmentStage
} from "../constants"
import { Config } from "../config";

export interface WorkloadsStageProps extends StageProps {
    config: Config,
    envName: string,
    envStage: EnvironmentStage,
    environment: Environment,
    sharedStack: SharedStack
}

export class WorkloadsStage extends Stage {
    public readonly config: Config;
    public readonly envName: string;
    public readonly envStage: EnvironmentStage;
    public readonly environment: Environment;
    public readonly sharedStack: SharedStack;
    public readonly workloadsStack: WorkloadsStack;
    public readonly stackSteps: StackSteps[] = [];

    constructor(scope: Construct, id: string, props: WorkloadsStageProps) {
        super(scope, id, {
            stageName: `${props.envStage}-Workloads`,
            env: {
                account: props.environment.account.accountId,
                region: props.environment.region
            }
        });

        this.config = props.config;
        this.envName = props.envName;
        this.envStage = props.envStage;
        this.environment = props.environment;
        this.sharedStack = props.sharedStack;

        this.workloadsStack = new WorkloadsStack(this, `${this.envStage}-WorkloadsStack`, {
            config: this.config,
            workloadsStage: this
        });

        if (this.environment.name === PRODUCTION_ENVIRONMENT) {
            this.stackSteps.push({
                stack: this.workloadsStack,
                changeSet: [
                    new ManualApprovalStep('DeploymentApproval', {
                        comment: 'Please review the changes',
                    })
                ]
            });
        }

        Tags.of(this).add('EnvironmentType', 'Workloads');
        Tags.of(this).add('EnvironmentStage', this.envStage);
    }
}
