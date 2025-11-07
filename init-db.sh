#!/bin/bash

# Script to initialize Cloudflare D1 database with schema

echo "🗄️  Initializing Cloudflare D1 database..."

# Apply schema to local database
echo "📝 Applying schema to local D1..."
npx wrangler d1 execute calendrier-animaux-production --local --file=./schema.sql

# Apply schema to remote database
echo "📝 Applying schema to remote D1..."
npx wrangler d1 execute calendrier-animaux-production --remote --file=./schema.sql

echo "✅ Database initialized successfully!"
echo ""
echo "Next steps:"
echo "1. Test locally: npm run dev"
echo "2. Push to GitHub: git push"
echo "3. Cloudflare Pages will auto-deploy"
