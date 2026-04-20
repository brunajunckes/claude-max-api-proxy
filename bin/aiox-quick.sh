#!/bin/bash

# AIOX Quick CLI
# Direct access to AIOX commands without npm wrapper

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"

cd "$PROJECT_ROOT"
node bin/cli.js "$@"
