import { Stage, StageProps } from "aws-cdk-lib";
import { StackSteps } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";

import { CoreStack, SharedStack } from "../stacks";
import { Config } from "../config";

export interface SharedStageProps extends StageProps {
    config: Config,
    coreStack: CoreStack
}

export class SharedStage extends Stage {
    public readonly config: Config;
    public readonly stackSteps: StackSteps[] = [];
    public readonly sharedStack: SharedStack;
    public readonly coreStack: CoreStack;

    constructor(scope: Construct, id: string, props: SharedStageProps) {
        super(scope, id, {
            stageName: 'Shared-Workloads',
            env: props.config.shared.env
        });

        this.config = props.config;
        this.coreStack = props.coreStack;
        
        this.sharedStack = new SharedStack(this, 'SharedStack', {
            stackName: 'SharedStack',
            description: 'Shared resources for all workloads services',
            config: this.config,
            env: props.config.shared.env,
            coreStack: this.coreStack
        });
    }
}
