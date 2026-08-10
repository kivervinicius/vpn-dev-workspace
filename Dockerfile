FROM ubuntu:22.04@sha256:3b06811b2afd352be909dd088a004166d665dc76d38b13eada33522a9d915c6f

ARG TARGETARCH
ARG NODE_VERSION=22.17.1
# Deve acompanhar a versão instalada no host para que o terminal VPN tenha o
# mesmo comportamento do OpenCode local.
ARG OPENCODE_VERSION=1.18.16

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/developer \
    SHELL=/usr/bin/zsh

# Ferramentas de desenvolvimento e dependências para downloads verificados.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    default-jdk \
    git \
    build-essential \
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
      amd64) opencode_arch=x64; opencode_sha256=286e07355df06738c1905955be15b7fbc10a7b12d931de9394a6f7597246750b ;; \
      arm64) opencode_arch=arm64; opencode_sha256=4fdce5f9bc877d977304d71c0c90ad6e83efa381fe0edf0a61e6142a625e1c41 ;; \
      *) echo "Arquitetura não suportada: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
      "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-${opencode_arch}.tar.gz" \
      --output /tmp/opencode.tar.gz \
    && echo "${opencode_sha256}  /tmp/opencode.tar.gz" | sha256sum --check --status \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin \
    && rm /tmp/opencode.tar.gz

# O UID/GID corresponde ao usuário padrão do host Linux e evita escrita como root
# nos diretórios explicitamente montados.
RUN groupadd --gid 1000 developer \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/bin/zsh developer

USER developer
WORKDIR /projetos
