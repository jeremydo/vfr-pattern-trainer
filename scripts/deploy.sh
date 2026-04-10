#!/usr/bin/env bash
# Deploy vfr-trainer to RPi at jeremydo.dyndns.org/vfrtrainer/
# Usage: ./scripts/deploy.sh
set -e
rsync -av --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='scripts' \
  --exclude='.DS_Store' \
  /Users/jeremy/vfr-trainer-claude/ \
  louder@10.0.138.33:/var/www/vfrtrainer/
echo "Deployed to https://jeremydo.dyndns.org/vfrtrainer/"
