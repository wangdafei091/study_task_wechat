#!/bin/bash

# 自动检测MySQL版本并初始化测试数据库
# 使用方法: bash database/fix-and-init.sh

set -e

echo "🔧 MySQL数据库初始化修复脚本..."

# 检查.env.test文件
if [ ! -f .env.test ]; then
    echo "❌ 未找到.env.test文件，请先配置测试数据库"
    exit 1
fi

# 加载环境变量
export $(cat .env.test | grep -v '^#' | xargs)

echo "📋 数据库配置：$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# 检查MySQL版本
echo "🔍 检测MySQL版本..."
mysql_version=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT VERSION();" -s 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ 无法连接到数据库，请检查配置"
    exit 1
fi

echo "✅ MySQL版本: $mysql_version"

# 解析版本号
major=$(echo $mysql_version | cut -d. -f1)
minor=$(echo $mysql_version | cut -d. -f2)

# 选择合适的SQL文件
sql_file="database/test-setup-fixed.sql"
if [ "$major" -gt 5 ] || ([ "$major" -eq 5 ] && [ "$minor" -ge 7 ]); then
    echo "✅ 检测到MySQL $major.$minor，使用现代版本（JSON类型）"
    sql_file="database/test-setup-modern.sql"
else
    echo "⚠️  检测到MySQL $major.$minor，使用兼容版本（TEXT类型）"
fi

# 检查SQL文件是否存在
if [ ! -f "$sql_file" ]; then
    echo "❌ 未找到SQL文件: $sql_file"
    exit 1
fi

echo "📋 使用SQL文件: $sql_file"

# 创建测试数据库（如果不存在）
echo "🔨 创建测试数据库（如果不存在）..."
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ 数据库已就绪: $DB_NAME"
else
    echo "❌ 创建数据库失败"
    exit 1
fi

# 初始化数据库结构
echo "🔨 初始化数据库结构..."
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sql_file" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ 数据库初始化成功！"
    echo ""
    echo "🎉 现在可以运行集成测试了："
    echo "   npm test test/integration/task-api-m07-real.test.js"
else
    echo "❌ 数据库初始化失败"
    exit 1
fi
