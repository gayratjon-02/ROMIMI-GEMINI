#!/bin/bash

git reset --hard
git pull origin master


docker stop romimi-backend
docker rm romimi-backend


set -e

echo "🚀 ROMIMI Backend Docker deployment boshlandi..."

cd "$(dirname "$0")"

if [ ! -f ".env.production" ]; then
    echo "❌ .env.production fayli topilmadi!"
    echo "Iltimos .env.production faylini yarating va barcha o'zgaruvchilarni to'ldiring"
    exit 1
fi

echo "🧹 Eski container'larni to'xtatish..."
docker compose down

echo "🔨 Docker image'ni build qilish..."
docker compose build

echo "▶️  Container'larni ishga tushirish..."
docker compose up -d

echo "⏳ Backend'ni kutish..."
sleep 10

echo "📊 Container'lar holati:"
docker compose ps

echo "✅ Backend deployment yakunlandi!"
echo "🌐 Backend http://localhost:5031 da ishlamoqda"
echo ""
echo "📝 Foydali buyruqlar:"
echo "   docker compose logs -f romimi-backend  - Backend log'larini ko'rish"
echo "   docker compose logs -f redis           - Redis log'larini ko'rish"
echo "   docker compose logs -f postgres        - PostgreSQL log'larini ko'rish"
echo "   docker compose ps                      - Container'lar holatini ko'rish"
echo "   docker compose down                    - Barcha container'larni to'xtatish"