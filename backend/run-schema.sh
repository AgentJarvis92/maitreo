#!/bin/bash
# Direct SQL execution via Supabase (uses psql connection)

set -e

# Load environment
source .env

# Database connection from Bitwarden notes
DB_PASSWORD="0f3Je80jn6MIHXfq"
DB_HOST="db.cykzsgignbifzjavzcbo.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

# Connection string
export PGPASSWORD="$DB_PASSWORD"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not installed. Installing via brew..."
    brew install postgresql
fi

echo "🔧 Executing Maitreo schema on Supabase..."
echo ""

# Run schema
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/schema.sql

echo ""
echo "✅ Schema execution complete!"
echo ""
echo "🔍 Verifying tables..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt"
