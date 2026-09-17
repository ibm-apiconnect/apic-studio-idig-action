FROM registry.redhat.io/ubi9/ubi:latest

ARG RUNNER_VERSION=2.322.0

# Install dependencies at build time (runs as root inside the build container)
RUN dnf install -y --allowerasing curl jq zip git tar && dnf clean all

# OCP assigns an arbitrary UID at runtime - use group 0 (root group) ownership
# with group-writable permissions so any UID can write to the runner directory
RUN mkdir -p /home/runner

WORKDIR /home/runner

# Download and extract the GitHub Actions runner
RUN curl -o runner.tar.gz -L \
    https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz && \
    tar xzf runner.tar.gz && \
    rm runner.tar.gz && \
    ./bin/installdependencies.sh && \
    chown -R 0:0 /home/runner && \
    chmod -R g+rwX /home/runner

USER 1000

ENTRYPOINT ["/bin/bash", "-c", \
  "./config.sh --url $RUNNER_URL --token $RUNNER_TOKEN --unattended --replace && ./run.sh"]
