---
description: Confere o estado de release sem alterar nada
---

Confirme o estado de release do repositório, em modo somente leitura.

Estado do worktree e histórico:

!`git status --porcelain=v1; echo '---'; git log --oneline -5; echo '---'; git tag --points-at HEAD; echo "exit=$?"`

Responda com:

1. worktree sujo/limpo e quais arquivos estão modificados;
2. HEAD e tags apontando para ele;
3. se existe `CHANGELOG.md` coerente com o histórico recente;
4. o que ainda impede uma release (gate local, CI, versão).

Não crie tag, não publique release, não faça push.
