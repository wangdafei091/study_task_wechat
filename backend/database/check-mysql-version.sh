#!/bin/bash

# 检查MySQL版本并修复兼容性问题

echo "🔍 检查MySQL版本..."

# 从.env.test读取数据库配置
if [ -f .env.test ]; then
    export $(cat .env.test | grep -v '^#' | xargs)
else
    echo "❌ 未找到.env.test文件"
    exit 1
fi

# 检查MySQL版本
echo "正在连接到 $DB_HOST:$DB_PORT ..."
mysql_version=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT VERSION();" -s 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ MySQL版本: $mysql_version"

    # 检查是否支持JSON类型
    major=$(echo $mysql_version | cut -d. -f1)
    minor=$(echo $mysql_version | cut -d. -f2)

    if [ "$major" -gt 5 ] || ([ "$major" -eq 5 ] && [ "$minor" -ge 7 ]); then
        echo "✅ 支持JSON数据类型"
    else
        echo "⚠️  MySQL版本过低，不支持JSON类型，将使用TEXT替代"
    fi
else
    echo "❌ 无法连接到数据库，请检查配置"
    exit 1
fi
