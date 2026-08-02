FROM ubuntu:22.04

# Evita perguntas e pausas durante a instalação do apt.
ENV DEBIAN_FRONTEND=noninteractive

# Instala ferramentas essenciais e o Java.
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    default-jdk \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Instala o NVM (Node Version Manager) e a versão LTS do Node.js.
ENV NVM_DIR=/root/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install --lts \
    && nvm alias default 'lts/*' \
    && nvm use default \
    && NODE_BIN="$(dirname "$(command -v node)")" \
    && ln -sf "$NODE_BIN/node" /usr/local/bin/node \
    && ln -sf "$NODE_BIN/npm" /usr/local/bin/npm \
    && ln -sf "$NODE_BIN/npx" /usr/local/bin/npx

# Garante que o NVM seja carregado em qualquer terminal Bash aberto.
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> /etc/bash.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /etc/bash.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> /etc/bash.bashrc

# Instala o OpenCode.
RUN curl -fsSL https://opencode.ai/install | bash \
    && ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode

# O comando de execução será definido no docker-compose.yml.
