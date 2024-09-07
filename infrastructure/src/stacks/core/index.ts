import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { EnvironmentType } from '../../constants';
import { Config } from '../../config';

import { CorePipeline, CodeRepository } from './constructs';
import { SharedStage, WorkloadsStage } from '../../stages';

export interface CoreStackProps extends StackProps {
    config: Config
}

export class CoreStack extends Stack {
    public readonly config: Config;
    public readonly pipeline: CorePipeline;
    public readonly coreRepository: CodeRepository;

    constructor(scope: Construct, id: string, props: CoreStackProps) {
        super(scope, id, props.config.core);

        this.config = props.config;

        // Repository for Core Infrastructure
        this.coreRepository = new CodeRepository(this, 'CoreRepository', this.config.core.coreRepository);

        // Pipeline for Core Infrastructure
        this.pipeline = new CorePipeline(this, 'CorePipeline', {
            config: this.config,
            coreRepository: this.coreRepository
        });

        // Shared Stacks
        const sharedStage = new SharedStage(this, 'SharedStage', {
            config: this.config,
            coreStack: this
        });
        this.pipeline.addStage(sharedStage, { stackSteps: sharedStage.stackSteps });

        // Workloads Environments
        const workloadsEnvironments = Object.values(this.config.environments).filter(env => env.type === EnvironmentType.Workloads);

        workloadsEnvironments.forEach(env => {
            const workloadsStage = new WorkloadsStage(this, `${env.stage}-Workloads`, {
                config: this.config,
                envName: env.name,
                envStage: env.stage,
                environment: env,
                sharedStack: sharedStage.sharedStack
            });

            this.pipeline.addStage(workloadsStage, { stackSteps: workloadsStage.stackSteps });
        });
    }
}
