FROM ubuntu:22.04@sha256:3b06811b2afd352be909dd088a004166d665dc76d38b13eada33522a9d915c6f

ARG TARGETARCH
ARG NODE_VERSION=22.17.1
# Deve acompanhar a versão instalada no host para que o terminal VPN tenha o
# mesmo comportamento do OpenCode local.
ARG OPENCODE_VERSION=1.18.25

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
      amd64) node_arch=x64; node_sha256=ff04bc7c3ed7699ceb708dbaaf3580d899ff8bf67f17114f979e83aa74fc5a49 ;; \
      arm64) node_arch=arm64; node_sha256=a5bb879af2fe70e7b5dc5e0bbadecba88e87f45bd8e62c0c57b5c815a4cbbaa6 ;; \
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
      amd64) opencode_arch=x64; opencode_sha256=58a3729a6f3432dd6d2917fcc4a949788891a035818646ad480e12c947f56e78 ;; \
      arm64) opencode_arch=arm64; opencode_sha256=35ef77897425e41b5183a2c21ac4fb1d4d944d82a94e3c920f57b5490af11ac5 ;; \
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
