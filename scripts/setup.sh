#!/bin/bash
# Restaurant SaaS Backend Setup Script

set -e

echo "🚀 Restaurant SaaS Backend Setup"
echo "=================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be 20 or higher (found: $NODE_VERSION)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your credentials:"
    echo "   - DATABASE_URL"
    echo "   - OPENAI_API_KEY"
    echo "   - RESEND_API_KEY"
    echo "   - FROM_EMAIL"
    echo ""
    read -p "Press Enter after you've updated .env, or Ctrl+C to exit..."
else
    echo "✅ .env file exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo ""
echo "🔨 Building TypeScript..."
npm run build

# Check database connection
echo ""
echo "🔌 Testing database connection..."
if [ -z "$DATABASE_URL" ]; then
    source .env
fi

if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set. Skipping database check."
else
    if command -v psql &> /dev/null; then
        if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
            echo "✅ Database connection successful"
        else
            echo "❌ Database connection failed"
            echo "   Check your DATABASE_URL in .env"
            exit 1
        fi
    else
        echo "⚠️  psql not found, skipping database connection test"
    fi
fi

# Run migrations
echo ""
read -p "Run database migrations? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗄️  Running migrations..."
    npm run db:migrate
    echo "✅ Migrations complete"
fi

# Load seed data
echo ""
read -p "Load sample seed data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v psql &> /dev/null && [ -n "$DATABASE_URL" ]; then
        echo "🌱 Loading seed data..."
        psql "$DATABASE_URL" -f scripts/seed-data.sql
        echo "✅ Seed data loaded"
    else
        echo "⚠️  Cannot load seed data (psql or DATABASE_URL missing)"
    fi
fi

# Summary
echo ""
echo "=================================="
echo "✅ Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Verify your .env configuration"
echo "  2. Start dev server:     npm run dev"
echo "  3. Test health check:    curl http://localhost:3000/health"
echo "  4. Run ingestion job:    npm run ingestion"
echo "  5. Run newsletter job:   npm run newsletter"
echo ""
echo "📚 See README.md for full documentation"
echo ""
