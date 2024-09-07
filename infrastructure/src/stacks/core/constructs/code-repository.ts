import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { Repository as CodeCommitRepository } from 'aws-cdk-lib/aws-codecommit';

export interface CoreRepositoryStackProps {
    name: string,
    description: string
}

export class CodeRepository extends Construct {
    public readonly repository: CodeCommitRepository;
    public readonly name: string;
    public readonly description: string;

    constructor(scope: Construct, id: string, props: CoreRepositoryStackProps) {
        super(scope, id);

        this.name = props.name;
        this.description = props.description;

        this.repository = new CodeCommitRepository(this, id, {
            repositoryName: this.name,
            description: this.description
        });

        this.createOutputs();
    }

    protected createOutputs(): void {
        new CfnOutput(this, `${this.name}-repository-url`, {
            description: `'${this.name}' repository URL`,
            value: this.repository.repositoryCloneUrlHttp
        });
    }
}
