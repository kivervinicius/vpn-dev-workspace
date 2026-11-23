---
description: Roda o gate local e resume o resultado
---

Execute o gate local do projeto e resuma o resultado por arquivo/área.

Saída de `make verify-fast`:

!`make verify-fast 2>&1; echo "exit=$?"`

Interpretação:

- `exit=0` → gate verde; liste o que foi executado em uma linha.
- `exit!=0` → identifique a primeira falha real, cite o arquivo e a linha, e
  proponha o menor conserto possível. Não rode builds Docker se o gate falhou
  antes deles.
- `verify-fast` não substitui `make verify`; deixe claro quando o gate completo
  ainda é necessário.

Não faça commit nem push.
