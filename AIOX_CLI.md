# AIOX CLI Integration - Hermes

O AIOX CLI foi integrado ao Hermes. Todos os comandos AIOX agora disponíveis via `npm run cli`.

## Uso Rápido

```bash
# CLI AIOX genérico
npm run cli -- [command] [options]

# Exemplos
npm run cli -- --help                    # Help completo
npm run cli -- qa run                    # Rodar quality gates
npm run cli -- workers search "pattern"  # Procurar workers
npm run cli -- metrics show              # Mostrar métricas
npm run cli -- config show               # Ver configuração
npm run cli -- generate story            # Gerar nova story
```

## Comandos Principais

### Quality Assurance
```bash
npm run cli -- qa run          # Rodar quality gates (3 layers)
npm run cli -- qa status       # Ver status QA
npm run cli:qa:run             # Shortcut do npm
```

### Workers & Discovery
```bash
npm run cli -- workers list                    # Listar workers
npm run cli -- workers search "pattern"        # Procurar workers
npm run cli -- workers info <id>               # Ver detalhes worker
```

### Manifests
```bash
npm run cli -- manifest validate     # Validar manifests
npm run cli -- manifest regenerate   # Regenerar manifests
```

### Metrics
```bash
npm run cli -- metrics show           # Ver métricas colhidas
npm run cli -- metrics record --layer 1 --passed   # Registrar resultado
npm run cli -- metrics seed --days 30 # Seed histórico
```

### Configuration
```bash
npm run cli -- config show           # Ver configuração atual
npm run cli -- config show --debug   # Ver com detalhes
npm run cli -- config diff           # Comparar níveis
npm run cli -- config validate       # Validar schema
```

### Document Generation
```bash
npm run cli -- generate list         # Listar templates
npm run cli -- generate story        # Gerar story template
npm run cli -- generate adr          # Gerar ADR (Architecture Decision Record)
npm run cli -- generate prd          # Gerar PRD (Product Requirements)
npm run cli -- generate pmdr         # Gerar PMDR (PM Decision Record)
```

### MCP (Model Context Protocol)
```bash
npm run cli -- mcp setup --with-defaults   # Setup MCP
npm run cli -- mcp link                    # Link MCP
npm run cli -- mcp status                  # Ver status MCP
```

### Migrations
```bash
npm run cli -- migrate --dry-run           # Preview migração
npm run cli -- migrate --from=2.0 --to=2.1 # Executar migração
```

### Pro Features
```bash
npm run cli -- pro status                   # Ver status Pro
npm run cli -- pro activate --key KEY       # Ativar Pro
npm run cli -- pro features                 # Ver features Pro
```

## NPM Scripts Rápidos

Adicionados ao package.json para atalhos comuns:

```bash
npm run cli                    # CLI genérico
npm run cli:workers:search     # Procurar workers direto
npm run cli:qa:run             # Rodar QA direto
npm run cli:metrics:show       # Ver métricas direto
npm run cli:config:show        # Ver config direto
npm run cli:manifest           # Manifest help
npm run cli:generate           # Generate help
npm run cli:mcp                # MCP help
npm run cli:migrate            # Migrate help
npm run cli:pro                # Pro help
```

## Estrutura AIOX Integrada

```
.aiox-core/
├── cli/                    # CLI engine (Commander.js)
├── core/                   # Core AIOX modules
├── development/            # Agents, tasks, templates
├── quality/                # Quality gates, metrics
├── constitution.md         # Princípios inegociáveis
└── core-config.yaml        # Configuração padrão
```

## Constitution - Princípios Inegociáveis

Ver `.aiox-core/constitution.md` para:
- CLI First (máxima prioridade)
- Agent Authority (autoridades exclusivas)
- Story-Driven (tudo começa com stories)
- No Invention (sem requisitos fora de specs)
- Quality Gates (3 layers obrigatórios)

## Próximos Passos

1. Populate manifests (agents, workers, tasks)
2. Configure stories em `docs/stories/`
3. Definir agents em `.aiox-core/development/agents/`
4. Rodar `npm run cli -- qa run` para validar
