import { RemovalPolicy, StackProps } from 'aws-cdk-lib';
import { RepositoryProps, TagMutability } from 'aws-cdk-lib/aws-ecr';

import { Environments, environments } from './constants';

import * as _ from 'lodash';

import * as servicesMetadata from '../services.json';

export interface Service<EnvConfig> {
    name: string,
    description: string,
    repositoryName: string,
    repositoryDescription: string,
    config: {
        sandbox: EnvConfig | {},
        develop: EnvConfig | {},
        staging: EnvConfig | {},
        production: EnvConfig | {}
    }
}

export interface DemoServiceConfig {
    version: string,
    namespace: string,
    image: string,
    url: string,
    urlType: string,
    urlPath: string
}

export interface DemoService extends Service<DemoServiceConfig> {}

export interface Services {
    // demo: Service<DemoServiceConfig>
    demo: DemoService
}

const services: Services = {
    demo: {
        name: 'demo',
        description: 'Demo Service',
        repositoryName: 'aws-demo-service',
        repositoryDescription: 'Demo Service repository',
        config: _.merge({
            sandbox: {},
            develop: {},
            staging: {},
            production: {}
        }, servicesMetadata['demo'] ?? {})
    }
};

export interface Config {
    project: {
        name: string,
        description: string,
        key: string,
        domain: string
    },

    core: StackProps & {
        coreRepository: {
            name: string,
            description: string
        }
    },

    shared: StackProps & {
        ecr: RepositoryProps
    },

    workloads: StackProps & {
        services: Services
    },
    
    environments: Environments
}

const config: Config = {
    project: {
        name: 'Demo',
        description: 'Demo Gitflow Project',
        key: 'demo',
        domain: 'demo.com'
    },

    core: {
        stackName: 'CoreStack',
        description: 'Stack for the Core Resources',
        env: {
            account: environments.core.account.accountId,
            region: environments.core.region
        },
        tags: {
            Project: 'CodePipeline-GitFlow',
            Environment: 'Core'
        },

        coreRepository: {
            name: 'infrastructure',
            description: 'Core Infrastructure repository'
        }
    },

    shared: {
        stackName: 'SharedStack',
        description: 'Stack for the Shared Resources',
        env: {
            account: environments.shared.account.accountId,
            region: environments.shared.region
        },
        tags: {
            Project: 'CodePipeline-GitFlow',
            Environment: 'Shared'
        },

        ecr: {
            imageTagMutability: TagMutability.MUTABLE,
            imageScanOnPush: false,
            emptyOnDelete: true,
            removalPolicy: RemovalPolicy.DESTROY
        }
    },

    workloads: {
        services: services
    },

    environments: environments
};

export default config;
