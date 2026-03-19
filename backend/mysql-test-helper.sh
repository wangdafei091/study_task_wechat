#!/bin/bash

# MySQL远程测试数据库连接助手
# 解决MySQL 9.x客户端与旧版本服务器认证插件不兼容问题

DB_HOST="121.4.38.122"
DB_USER="root"
DB_PASS="4bdbff929dfd5518"
DB_NAME="task_wechat_test"

# 兼容MySQL 9.x客户端的连接参数
AUTH_PARAMS="--default-auth=mysql_native_password --enable-cleartext-plugin"

# 检查命令参数
if [ "$1" == "describe" ]; then
    # 查看表结构
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" $AUTH_PARAMS "$DB_NAME" -e "DESCRIBE tasks;"
elif [ "$1" == "tables" ]; then
    # 查看所有表
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" $AUTH_PARAMS "$DB_NAME" -e "SHOW TABLES;"
elif [ "$1" == "count" ]; then
    # 统计数据
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" $AUTH_PARAMS "$DB_NAME" -e "
        SELECT 'users' as table_name, COUNT(*) as count FROM users
        UNION ALL
        SELECT 'families', COUNT(*) FROM families
        UNION ALL
        SELECT 'tasks', COUNT(*) FROM tasks;"
elif [ "$1" == "shell" ]; then
    # 进入MySQL shell
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" $AUTH_PARAMS "$DB_NAME"
elif [ "$1" == "test" ]; then
    # 运行集成测试
    echo "🧪 运行M07真实数据库集成测试..."
    npm test test/integration/task-api-m07-real.test.js
else
    echo "🔧 MySQL测试数据库连接助手"
    echo ""
    echo "使用方法："
    echo "  bash mysql-test-helper.sh describe  # 查看tasks表结构"
    echo "  bash mysql-test-helper.sh tables     # 查看所有表"
    echo "  bash mysql-test-helper.sh count      # 统计数据"
    echo "  bash mysql-test-helper.sh shell      # 进入MySQL shell"
    echo "  bash mysql-test-helper.sh test       # 运行集成测试"
    echo ""
    echo "直接SQL执行示例："
    echo "  mysql -h$DB_HOST -u$DB_USER -p'$DB_PASS' --default-auth=mysql_native_password $DB_NAME -e \"YOUR_SQL\""
fi
