# AIOX CLI - Hermes Integration Guide

AIOX CLI foi integrado ao Hermes. Agora você pode rodar todos os comandos AIOX diretamente.

## Formas de Usar

### 1. NPM (Recomendado para projeto)
```bash
npm run cli -- [command] [args]
npm run cli -- workers search "json"
npm run cli -- manifest validate
npm run cli -- qa run
```

### 2. Script Direto (Rápido)
```bash
./bin/aiox-quick.sh [command] [args]
./bin/aiox-quick.sh workers list
./bin/aiox-quick.sh metrics show
```

### 3. Alias (Para Terminal)
```bash
alias aiox="npm run cli --"
aiox workers search "transform"
```

## Comandos Principais

### Workers (Descoberta de Skills)
```bash
npm run cli -- workers search "json transformation"
npm run cli -- workers list --category=data
npm run cli -- workers info json-csv-transformer
```

### Quality Gates (QA)
```bash
npm run cli -- qa run              # Rodar todos os gates
npm run cli -- qa status           # Ver status atual
```

### Manifest (Gerenciar manifestos)
```bash
npm run cli -- manifest validate   # Validar manifestos
npm run cli -- manifest regenerate # Regenerar from source
```

### Metrics (Rastreamento de Qualidade)
```bash
npm run cli -- metrics show        # Ver métricas
npm run cli -- metrics record --layer 1 --passed
```

### Generate (Gerar documentos)
```bash
npm run cli -- generate prd --title "Feature X"
npm run cli -- generate adr --save
npm run cli -- generate story
```

### Config (Configuração em Camadas)
```bash
npm run cli -- config show         # Ver config atual
npm run cli -- config diff --levels L1,L2
npm run cli -- config validate
```

### MCP (Model Context Protocol)
```bash
npm run cli -- mcp setup --with-defaults
npm run cli -- mcp link
npm run cli -- mcp status
```

## Stories AIOX

Stories estão em: `docs/stories/`

Cada story tem:
- ID + Epic
- Objetivos claros
- Acceptance criteria
- Files affected
- Implementation plan
- Tests
- Checklist vivo

## Estrutura .aiox-core

```
.aiox-core/
├── cli/                    # CLI commands
│   ├── commands/          # Sub-commands
│   └── utils/            # Formatadores
├── constitution.md        # Regras inegociáveis
├── core/                 # Framework core
├── development/
│   ├── agents/          # Personas (dev, qa, pm, etc)
│   └── tasks/          # Templates
└── docs/               # Documentação
```

## Próximos Passos

1. Explore com: `npm run cli -- workers search`
2. Veja stories em: `docs/stories/`
3. Rode QA: `npm run cli -- qa run`
4. Gere documentos: `npm run cli -- generate story`

Bom desenvolvimento!
