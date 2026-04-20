#!/usr/bin/env node

/**
 * AIOX Agent Launcher for Hermes
 *
 * Carrega agentes AIOX disponíveis no projeto
 * Uso: npm run aiox [agent] [options]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '../.aiox-core/development/agents');

function listAgents() {
  const files = fs.readdirSync(AGENTS_DIR);
  const agents = files
    .filter(f => f.endsWith('.md') && f !== 'generate-greeting.js')
    .map(f => f.replace('.md', ''));

  return agents;
}

function showHelp() {
  const agents = listAgents();
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           AIOX Agent Launcher - Hermes Project                ║
╚════════════════════════════════════════════════════════════════╝

Agentes disponíveis:
  ${agents.map(a => `• @${a}`).join('\n  ')}

Uso:
  npm run aiox [agent]              Carregar agente específico
  npm run aiox list                 Listar agentes
  npm run aiox help                 Mostrar esta ajuda

Exemplos:
  npm run aiox dev                  Carregar agente dev
  npm run aiox architect            Carregar agente architect
  npm run aiox qa                   Carregar agente qa

Estrutura AIOX integrada em: ./.aiox-core/
Constituição: ./.aiox-core/constitution.md
`);
}

function showAgentContent(agentName) {
  const agentPath = path.join(AGENTS_DIR, `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    console.error(`Erro: Agente '@${agentName}' não encontrado`);
    console.log(`\nAgentes disponíveis: ${listAgents().join(', ')}`);
    process.exit(1);
  }

  const content = fs.readFileSync(agentPath, 'utf8');
  console.log(content);
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  showHelp();
} else if (command === 'list' || command === 'ls') {
  console.log('\nAgentes AIOX disponíveis:\n');
  listAgents().forEach(agent => {
    console.log(`  @${agent}`);
  });
  console.log('');
} else {
  // Assume it's an agent name
  showAgentContent(command);
}
