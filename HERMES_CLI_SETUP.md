# HERMES CLI - SETUP COMPLETE

## Status: ✓ ATIVO

AIOX CLI totalmente integrado ao Hermes. 

## Comandos Disponíveis

```
npm run hermes [command]
```

### Agents (12 disponíveis)

```
npm run hermes:agents              Lista todos agentes
npm run hermes @dev                Carrega agente dev
npm run hermes @qa                 Carrega agente qa
npm run hermes @architect          Carrega agente architect
npm run hermes @devops             Carrega agente devops
npm run hermes @pm                 Carrega agente pm
npm run hermes @po                 Carrega agente po
npm run hermes @sm                 Carrega agente sm
npm run hermes @analyst            Carrega agente analyst
npm run hermes @data-engineer      Carrega agente data-engineer
npm run hermes @ux-design-expert   Carrega agente ux
npm run hermes @squad-creator      Carrega agente squad
npm run hermes @aiox-master        Carrega agente master
```

### Framework

```
npm run hermes:constitution        Exibe constitution AIOX
npm run hermes:stories             Lista stories disponíveis
npm run hermes:health              Health check sistema
npm run hermes:agents              Lista agentes
```

### AIOX Commands

```
npm run hermes aiox workers search "query"
npm run hermes aiox manifest validate
npm run hermes aiox qa run
npm run hermes aiox metrics show
npm run hermes aiox config show
npm run hermes aiox generate [type]
npm run hermes aiox mcp setup
```

## Princípios Core

Via `./.aiox-core/constitution.md`:

1. **CLI First** - Todo código funciona 100% em CLI antes UI
2. **Agent Authority** - Cada agente tem escopo exclusivo
3. **Story-Driven** - Todo desenvolvimento começa com story
4. **No Invention** - Specs seguem requisitos, sem criação
5. **Quality First** - Múltiplos gates: lint/typecheck/test/build

## Arquitetura

```
.aiox-core/
├── cli/                 → Comandos disponíveis
├── core/                → Engine AIOX
├── development/
│   └── agents/         → 12 agentes com specs
├── constitution.md     → Princípios inegociáveis
└── package.json        → Dependencies AIOX

bin/
├── hermes.js           → CLI Hermes
└── aiox.js             → Launcher agentes
```

## Stories Ativas

- story-001: Cache Hit Rate Tracking
- story-002: Distributed Tracing Setup
- story-003: Security Hardening
- story-004: Test Coverage Expansion
- story-005: Circuit Breaker Pattern
- story-006: Hot-Reload Configuration

## Health Check

```
✓ AIOX Core
✓ Node modules
✓ Package.json
✓ Stories directory
✓ Agents directory

Agents: 12
```

## Próximos Passos

1. `npm run hermes:constitution` - Entender princípios
2. `npm run hermes @dev` - Carregar agente dev
3. `npm run hermes:stories` - Ver stories em progresso
4. Selecionar story → implementar → testar → push

## Quick Start

```bash
# Ver ajuda
npm run hermes -- --help

# Carregar dev agent
npm run hermes @dev

# Testar AIOX workers
npm run hermes aiox workers list

# Validar sistema
npm run hermes:health
```

---

**CLI-First. Story-Driven. Agent-Orchestrated.**
