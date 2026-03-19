#!/bin/bash

# M07 真实数据库集成测试快速设置脚本
# 使用方法: bash setup-integration-test.sh (在backend目录下执行)

set -e

echo "🚀 开始设置M07真实数据库集成测试环境..."

# 检查是否在backend目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在backend目录运行此脚本"
    exit 1
fi

echo "📋 步骤1：检查.env.test配置文件..."
if [ ! -f ".env.test" ]; then
    echo "⚠️  未找到.env.test文件，创建模板文件..."
    cat > .env.test << EOF
# 测试环境配置
NODE_ENV=test
PORT=3001

# 远程测试数据库配置 - 请填入您的实际信息
DB_HOST=your-remote-db-host.com
DB_PORT=3306
DB_USER=your_test_db_user
DB_PASSWORD=your_test_db_password
DB_NAME=task_wechat_test

# JWT测试配置
JWT_SECRET=test-jwt-secret-for-integration-testing-only
JWT_EXPIRES_IN=1h

# 微信小程序测试配置（可选）
WECHAT_APPID=test_app_id
WECHAT_APPSECRET=test_app_secret

# 日志配置
LOG_LEVEL=error
EOF
    echo "✅ 已创建.env.test模板文件"
    echo "⚠️  请编辑.env.test文件，填入您的远程数据库配置"
    echo ""
    echo "需要配置的参数："
    echo "  - DB_HOST: 远程数据库地址"
    echo "  - DB_USER: 测试数据库用户名"
    echo "  - DB_PASSWORD: 测试数据库密码"
    echo "  - DB_NAME: 测试数据库名称 (默认: task_wechat_test)"
    echo ""
    read -p "按Enter继续编辑.env.test文件，或按Ctrl+C退出..."
    ${EDITOR:-vi} .env.test
else
    echo "✅ .env.test文件已存在"
fi

echo ""
echo "📋 步骤2：验证数据库配置..."
source .env.test 2>/dev/null || true

if [[ "$DB_HOST" == "your-remote-db-host.com" ]]; then
    echo "❌ 错误：数据库配置未完成，请编辑.env.test文件"
    echo "   设置正确的数据库连接信息"
    exit 1
fi

echo "✅ 数据库配置：$DB_USER@$DB_HOST/$DB_NAME"

echo ""
echo "📋 步骤3：测试数据库连接..."
if command -v mysql &> /dev/null; then
    if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME;" 2>/dev/null; then
        echo "✅ 数据库连接成功"
    else
        echo "⚠️  数据库连接失败或数据库不存在"
        echo "请确保："
        echo "1. 数据库服务器可访问"
        echo "2. 测试数据库已创建: $DB_NAME"
        echo "3. 用户权限正确"
        echo ""
        read -p "是否尝试创建测试数据库？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            echo "✅ 数据库创建成功"
        else
            echo "❌ 请手动创建数据库后重新运行此脚本"
            exit 1
        fi
    fi
else
    echo "⚠️  未安装mysql命令行工具，跳过连接测试"
fi

echo ""
echo "📋 步骤4：初始化测试数据库结构..."
if [ -f "database/test-setup-modern.sql" ]; then
    if command -v mysql &> /dev/null; then
        mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < database/test-setup-modern.sql
        echo "✅ 测试数据库初始化完成"
    else
        echo "⚠️  未找到mysql命令，请手动导入 database/test-setup-modern.sql"
    fi
else
    echo "⚠️  未找到database/test-setup-modern.sql文件"
fi

echo ""
echo "📋 步骤5：安装测试依赖..."
if [ -f "package.json" ]; then
    npm install --silent
    echo "✅ 依赖安装完成"
else
    echo "⚠️  未找到package.json"
fi

echo ""
echo "📋 步骤6：运行集成测试..."
echo "🧪 开始执行M07真实数据库集成测试..."
npm test test/integration/task-api-m07-real.test.js --verbose

echo ""
echo "🎉 设置完成！"
echo ""
echo "后续使用："
echo "1. 运行所有集成测试: npm test test/integration/task-api-m07-real.test.js"
echo "2. 运行特定测试: npm test -- test/integration/task-api-m07-real.test.js -t \"测试名称\""
echo "3. 查看测试指南: cat test/README.md"
echo ""
echo "测试文件位置："
echo "- 配置文件: .env.test"
echo "- 测试代码: test/integration/task-api-m07-real.test.js"
echo "- 数据库初始化: database/test-setup-modern.sql"
echo "- 测试指南: test/README.md"
