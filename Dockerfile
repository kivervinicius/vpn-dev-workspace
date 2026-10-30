# Ubuntu LTS (digest do índice multi-arch; bump deliberado — versões interim
# como 25.10 ficam EOL em ~9 meses e o Dependabot é ignorado para ubuntu).
FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG TARGETARCH
ARG NODE_VERSION=22.23.2
# Deve acompanhar a versão instalada no host para que o terminal VPN tenha o
# mesmo comportamento do OpenCode local.
ARG OPENCODE_VERSION=1.18.31

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/developer \
    SHELL=/usr/bin/zsh

# Ferramentas de desenvolvimento e dependências para downloads verificados.
# JRE headless (sem JDK completo) mantém `java --version` funcional com menor superfície.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    default-jre-headless \
    git \
    openssh-client \
    socat \
    build-essential \
    jq \
    xz-utils \
    zsh \
    && if ! command -v flock >/dev/null 2>&1; then apt-get install -y --no-install-recommends util-linux; fi \
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
# Supply-chain: o default usa fork anomalyco/opencode (sha abaixo). Para usar o
# upstream sst/opencode, ajuste OPENCODE_GITHUB_REPO e os sha256 correspondentes.
ARG OPENCODE_GITHUB_REPO=anomalyco/opencode
RUN case "${TARGETARCH}" in \
      amd64) opencode_arch=x64; opencode_sha256=e9312be75ed803b7415fc2aeabda1f4fe938912a39673762dc0c38c0e11ebde4 ;; \
      arm64) opencode_arch=arm64; opencode_sha256=d4e332f46b227448582c0d9fc75f6f826dfe95c9f751bc2011fc4d937a042be6 ;; \
      *) echo "Arquitetura não suportada: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
      "https://github.com/${OPENCODE_GITHUB_REPO}/releases/download/v${OPENCODE_VERSION}/opencode-linux-${opencode_arch}.tar.gz" \
      --output /tmp/opencode.tar.gz \
    && echo "${opencode_sha256}  /tmp/opencode.tar.gz" | sha256sum --check --status \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin \
    && rm /tmp/opencode.tar.gz

# O UID/GID corresponde ao usuário do host (padrão 1000) e evita escrita como
# root nos diretórios explicitamente montados. Ajuste via build-args quando a
# home do host usa um UID/GID diferente. As imagens oficiais Ubuntu >= 23.04
# já trazem o usuário `ubuntu` (UID/GID 1000): quando ele ocupa o par do host,
# renomeia o par existente em vez de colidir (groupadd/useradd falhariam).
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN set -eux; \
    if existing_group="$(getent group "${HOST_GID}" | cut -d: -f1)" && [ -n "${existing_group}" ]; then \
      [ "${existing_group}" = developer ] || groupmod -n developer "${existing_group}"; \
    else \
      groupadd --gid "${HOST_GID}" developer; \
    fi; \
    if existing_user="$(getent passwd "${HOST_UID}" | cut -d: -f1)" && [ -n "${existing_user}" ]; then \
      [ "${existing_user}" = developer ] || usermod -l developer "${existing_user}"; \
      usermod -g "${HOST_GID}" -d /home/developer -s /usr/bin/zsh developer; \
      mkdir -p /home/developer; \
      chown "${HOST_UID}:${HOST_GID}" /home/developer; \
    else \
      useradd --uid "${HOST_UID}" --gid "${HOST_GID}" --create-home --shell /usr/bin/zsh developer; \
    fi; \
    getent passwd "${HOST_UID}" | cut -d: -f1 | grep -qx developer; \
    getent group "${HOST_GID}" | cut -d: -f1 | grep -qx developer
RUN install -d -m 0700 -o "${HOST_UID}" -g "${HOST_GID}" /var/lib/vpn-control

USER developer
WORKDIR /projetos
