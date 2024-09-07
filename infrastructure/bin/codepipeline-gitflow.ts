#!/usr/bin/env node

import 'source-map-support/register';
import 'dotenv/config';

import { App, Tags, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import { CoreStack } from '../src/stacks';

const app = new App();

// Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

import config from '../src/config';

new CoreStack(app, 'CoreStack', {
    config
});

Tags.of(app).add('Project', 'CodePipeline-GitFlow');
