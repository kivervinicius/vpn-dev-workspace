FROM ubuntu:22.04@sha256:829f6df217bcbae2b371026e81711d1a787c61b2967ad09d015063663ebafbf7

ARG TARGETARCH
ARG NODE_VERSION=22.23.2
# Deve acompanhar a versão instalada no host para que o terminal VPN tenha o
# mesmo comportamento do OpenCode local.
ARG OPENCODE_VERSION=1.18.31

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/developer \
    SHELL=/usr/bin/zsh

# Ferramentas de desenvolvimento e dependências para downloads verificados.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    default-jdk \
    git \
    openssh-client \
    build-essential \
    jq \
    xz-utils \
    zsh \
    && rm -rf /var/lib/apt/lists/*

# Node.js oficial, com checksum fixado para cada arquitetura suportada.
RUN case "${TARGETARCH}" in \
      amd64) node_arch=x64; node_sha256=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307 ;; \
      arm64) node_arch=arm64; node_sha256=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8 ;; \
      *) echo "Arquitetura não suportada: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      --output /tmp/node.tar.xz \
    && echo "${node_sha256}  /tmp/node.tar.xz" | sha256sum --check --status \
    && tar -xJf /tmp/node.tar.xz --strip-components=1 -C /usr/local \
    && rm /tmp/node.tar.xz

# OpenCode é instalado a partir do binário de release com checksum fixado.
RUN case "${TARGETARCH}" in \
      amd64) opencode_arch=x64; opencode_sha256=e9312be75ed803b7415fc2aeabda1f4fe938912a39673762dc0c38c0e11ebde4 ;; \
      arm64) opencode_arch=arm64; opencode_sha256=d4e332f46b227448582c0d9fc75f6f826dfe95c9f751bc2011fc4d937a042be6 ;; \
      *) echo "Arquitetura não suportada: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
      "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-${opencode_arch}.tar.gz" \
      --output /tmp/opencode.tar.gz \
    && echo "${opencode_sha256}  /tmp/opencode.tar.gz" | sha256sum --check --status \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin \
    && rm /tmp/opencode.tar.gz

# O UID/GID corresponde ao usuário do host (padrão 1000) e evita escrita como
# root nos diretórios explicitamente montados. Ajuste via build-args quando a
# home do host usa um UID/GID diferente.
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupadd --gid "${HOST_GID}" developer \
    && useradd --uid "${HOST_UID}" --gid "${HOST_GID}" --create-home --shell /usr/bin/zsh developer

USER developer
WORKDIR /projetos
