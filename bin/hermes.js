#!/usr/bin/env node

/**
 * HERMES CLI
 *
 * Full-stack CLI integrating AIOX patterns
 * CLI-First, Story-Driven, Agent-Orchestrated
 *
 * @version 1.0.0
 * @story HERMES-CLI-001
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AIOX_CORE = path.join(ROOT, '.aiox-core');

/**
 * Get CLI version from package.json
 */
function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return '1.0.0';
  }
}

/**
 * Load and execute AIOX CLI command
 */
async function executeAiox(commandName, args = []) {
  try {
    const aiox = await import(path.join(AIOX_CORE, 'cli', 'index.js'));
    const cliArgs = ['node', 'hermes', commandName, ...args];
    await aiox.run(cliArgs);
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * List available agents
 */
function listAgents() {
  const agentsDir = path.join(AIOX_CORE, 'development', 'agents');
  try {
    const files = fs.readdirSync(agentsDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Show agent content
 */
function showAgent(agentName) {
  const agentFile = path.join(AIOX_CORE, 'development', 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentFile)) {
    console.error(chalk.red(`✗ Agent '@${agentName}' not found`));
    const agents = listAgents();
    if (agents.length > 0) {
      console.log(chalk.yellow(`\nAvailable agents:`));
      agents.forEach(a => console.log(`  @${a}`));
    }
    process.exit(1);
  }

  const content = fs.readFileSync(agentFile, 'utf8');
  console.log(content);
}

/**
 * Load constitution
 */
function showConstitution() {
  const constFile = path.join(AIOX_CORE, 'constitution.md');
  if (fs.existsSync(constFile)) {
    const content = fs.readFileSync(constFile, 'utf8');
    console.log(content);
  }
}

/**
 * Create main program
 */
function createProgram() {
  const program = new Command();

  program
    .name('hermes')
    .version(getVersion())
    .description(chalk.cyan('HERMES: CLI-First AI Agent Framework'))
    .addHelpText('after', `
${chalk.bold('Commands:')}
  ${chalk.cyan('@<agent>')}         Load agent (@dev, @qa, @architect, etc)
  ${chalk.cyan('aiox <cmd>')}       Execute AIOX command (workers, manifest, qa, etc)
  ${chalk.cyan('stories')}          Show available stories
  ${chalk.cyan('constitution')}     Show AIOX constitution
  ${chalk.cyan('agents')}           List available agents
  ${chalk.cyan('health')}           System health check
  ${chalk.cyan('version')}          Show version info

${chalk.bold('Examples:')}
  hermes @dev                      Load dev agent
  hermes @qa                       Load QA agent
  hermes aiox workers search "json"
  hermes aiox qa run
  hermes stories
  hermes constitution

${chalk.bold('Learn more:')}
  Run 'hermes constitution' to understand AIOX principles
  Run 'hermes agents' to list available agents
`);

  // Subcommand: agents
  program
    .command('agents')
    .alias('ls')
    .description('List all available agents')
    .action(() => {
      const agents = listAgents();
      console.log(chalk.bold('\nAvailable Agents:\n'));
      agents.forEach(agent => {
        console.log(`  ${chalk.cyan(`@${agent}`)}`);
      });
      console.log('');
    });

  // Handle @agent syntax by intercepting unknown commands
  program
    .action((arg, options, cmd) => {
      // Check if it's an @agent command
      if (typeof arg === 'string' && arg.startsWith('@')) {
        const agentName = arg.substring(1);
        showAgent(agentName);
      }
    });

  // Subcommand: constitution
  program
    .command('constitution')
    .alias('const')
    .description('Show AIOX Constitution')
    .action(() => {
      showConstitution();
    });

  // Subcommand: stories
  program
    .command('stories')
    .description('Show available stories')
    .action(() => {
      const storiesDir = path.join(ROOT, 'docs', 'stories');
      if (fs.existsSync(storiesDir)) {
        const stories = fs.readdirSync(storiesDir)
          .filter(f => f.endsWith('.md'))
          .sort();

        console.log(chalk.bold('\nAvailable Stories:\n'));
        stories.forEach(story => {
          const content = fs.readFileSync(path.join(storiesDir, story), 'utf8');
          const lines = content.split('\n');
          const title = lines.find(l => l.startsWith('#')) || story;
          console.log(`  ${chalk.yellow(story)} - ${title.replace(/^#+\s+/, '')}`);
        });
        console.log('');
      } else {
        console.log(chalk.yellow('No stories directory found'));
      }
    });

  // Subcommand: health
  program
    .command('health')
    .description('System health check')
    .action(() => {
      console.log(chalk.bold('\n=== HERMES System Health ===\n'));

      const checks = [
        ['AIOX Core', fs.existsSync(AIOX_CORE)],
        ['Node modules', fs.existsSync(path.join(ROOT, 'node_modules'))],
        ['Package.json', fs.existsSync(path.join(ROOT, 'package.json'))],
        ['Stories', fs.existsSync(path.join(ROOT, 'docs', 'stories'))],
        ['Agents', fs.existsSync(path.join(AIOX_CORE, 'development', 'agents'))],
      ];

      checks.forEach(([name, status]) => {
        console.log(`  ${status ? chalk.green('✓') : chalk.red('✗')} ${name}`);
      });

      console.log(`\nAgents: ${listAgents().length}\n`);
    });

  // Subcommand: aiox (proxy to AIOX CLI)
  program
    .command('aiox <cmd> [args...]')
    .description('Execute AIOX command')
    .allowUnknownOption()
    .action(async (cmd, args) => {
      await executeAiox(cmd, args);
    });

  return program;
}

/**
 * Main entry point
 */
async function main() {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red(`Fatal: ${error.message}`));
  process.exit(1);
});
