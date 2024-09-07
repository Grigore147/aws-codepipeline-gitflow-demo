type AccountId = string;
type Region = string;

export interface Account {
    name: string;
    accountId: AccountId;
    region: Region;
    profile: string;
}

export interface Accounts {
    [key: string]: Account;
}

export enum EnvironmentType {
    Core      = 'Core',
    Shared    = 'Shared',
    Workloads = 'Workloads'
}

export enum EnvironmentStage {
    Core       = 'Core',
    Shared     = 'Shared',
    Sandbox    = 'Sandbox',
    Develop    = 'Develop',
    Staging    = 'Staging',
    Production = 'Production'
}

export interface Environment {
    name: string;
    account: Account;
    region: Region;
    type: EnvironmentType;
    stage: EnvironmentStage;
}

export interface Environments {
    [key: string]: Environment;
}

// NOTE:
// The accounts.json file with metadata can be generated using the following command:
// `task accounts:setup`
import * as accountsMetadata from '../accounts.json';

export const accounts: Accounts = {
    core:       accountsMetadata.core,
    shared:     accountsMetadata.shared,
    sandbox:    accountsMetadata.sandbox,
    develop:    accountsMetadata.develop,
    staging:    accountsMetadata.staging,
    production: accountsMetadata.production
};

export const CORE_ENVIRONMENT       = 'core';
export const SHARED_ENVIRONMENT     = 'shared';
export const SANDBOX_ENVIRONMENT    = 'sandbox';
export const DEVELOP_ENVIRONMENT    = 'develop';
export const STAGING_ENVIRONMENT    = 'staging';
export const PRODUCTION_ENVIRONMENT = 'production';

export const environments: Environments = {
    core: {
        name: CORE_ENVIRONMENT,
        account: accounts.core,
        region: accounts.core.region,
        type: EnvironmentType.Core,
        stage: EnvironmentStage.Core
    },
    shared: {
        name: SHARED_ENVIRONMENT,
        account: accounts.shared,
        region: accounts.shared.region,
        type: EnvironmentType.Shared,
        stage: EnvironmentStage.Shared
    },
    sandbox: {
        name: SANDBOX_ENVIRONMENT,
        account: accounts.sandbox,
        region: accounts.sandbox.region,
        type: EnvironmentType.Workloads,
        stage: EnvironmentStage.Sandbox
    },
    develop: {
        name: DEVELOP_ENVIRONMENT,
        account: accounts.develop,
        region: accounts.develop.region,
        type: EnvironmentType.Workloads,
        stage: EnvironmentStage.Develop
    },
    staging: {
        name: STAGING_ENVIRONMENT,
        account: accounts.staging,
        region: accounts.staging.region,
        type: EnvironmentType.Workloads,
        stage: EnvironmentStage.Staging
    },
    production: {
        name: PRODUCTION_ENVIRONMENT,
        account: accounts.production,
        region: accounts.production.region,
        type: EnvironmentType.Workloads,
        stage: EnvironmentStage.Production
    }
};
