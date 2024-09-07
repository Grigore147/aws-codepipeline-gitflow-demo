FROM public.ecr.aws/sam/build-nodejs20.x:1.122

# Install Taskfile
RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d v3.38.0 \
    && mv ./bin/task /usr/local/bin/task && chmod +x /usr/local/bin/task

# Include utility scripts
COPY ./scripts/cicd-entrypoint.sh /usr/local/bin/cicd-entrypoint
COPY ./scripts/get-service-metadata.sh /usr/local/bin/get-service-metadata
COPY ./scripts /scripts

