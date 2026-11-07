FROM docker:29-cli@sha256:b0d99f37f463c88cae2082083f705210296186c06632d22f6952ed43506ae520 AS docker
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git jq sudo unzip zip make build-essential lsb-release \
    python3 python3-venv libicu74 libssl3t64 zlib1g libkrb5-3 liblttng-ust1t64 \
    && curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
    && apt-get install -y /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/chrome.deb
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
ARG RUNNER_VERSION=2.338.2
ARG RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40
RUN useradd --create-home --uid 1001 --shell /bin/bash runner \
    && printf 'runner ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/runner \
    && mkdir -p /opt/runner /opt/hostedtoolcache \
    && curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" -o /tmp/runner.tar.gz \
    && echo "${RUNNER_SHA256}  /tmp/runner.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/runner.tar.gz -C /opt/runner \
    && rm /tmp/runner.tar.gz \
    && ln -s /opt/runner/externals/node24/bin/node /usr/local/bin/node \
    && chown -R runner:runner /opt/runner /opt/hostedtoolcache
COPY --chmod=755 entrypoint.sh /usr/local/bin/ci-runner
ENV RUNNER_TOOL_CACHE=/opt/hostedtoolcache AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache
ENV DOCKER_HOST=unix:///run/ci-docker/docker.sock
WORKDIR /opt/runner
USER runner
ENTRYPOINT ["/usr/local/bin/ci-runner"]
