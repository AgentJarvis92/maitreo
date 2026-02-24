#!/bin/bash
# ReviewReply Cron Wrapper
# Run this script via crontab every 15 minutes

cd "$(dirname "$0")/.." || exit 1

# Load environment
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV="production"

# Run the cron job
npx tsx cron-review-checker.ts >> logs/cron-review-checker.log 2>&1
