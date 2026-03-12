#!/bin/bash
# 云服务器部署脚本
# 使用方法：bash cloud-deploy-guide.sh

echo "🚀 开始云服务器部署..."
echo ""

# 1. 检查当前目录
echo "📂 当前工作目录："
pwd
echo ""

# 2. 查找后端代码位置
echo "🔍 查找后端代码位置..."
find / -name "server.js" -type f 2>/dev/null | head -5
echo ""

# 3. 检查常用的部署目录
echo "📋 检查常用部署目录："
for dir in /var/www /root /home/www /www; do
  if [ -d "$dir" ]; then
    echo "  - $dir (存在)"
    ls -la "$dir" | head -10
  else
    echo "  - $dir (不存在)"
  fi
done
echo ""

# 4. 创建正确的部署目录
echo "📦 准备部署目录..."
DEPLOY_DIR="/var/www/task-wechat-api"

if [ -d "$DEPLOY_DIR" ]; then
  echo "  目录已存在，先备份：$DEPLOY_DIR"
  mv "$DEPLOY_DIR" "$DEPLOY_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

mkdir -p "$DEPLOY_DIR"
echo "  部署目录：$DEPLOY_DIR"
echo ""

# 5. 检查环境变量文件
echo "🔧 检查环境变量配置..."
if [ -f "$DEPLOY_DIR/.env" ]; then
  echo "  .env 文件已存在"
  cat "$DEPLOY_DIR/.env"
else
  echo "  .env 文件不存在，需要创建"
  echo ""
  echo "请复制本地 .env 文件内容到云服务器的 $DEPLOY_DIR/.env"
fi
echo ""

# 6. 给出部署命令
echo "📝 接下来的步骤："
echo ""
echo "1. 在本地打包后端代码："
echo "   cd backend"
echo "   tar -czf backend.tar.gz ."
echo ""
echo "2. 上传到云服务器："
echo "   scp backend.tar.gz root@121.4.38.122:/var/www/"
echo ""
echo "3. SSH到云服务器："
echo "   ssh root@121.4.38.122"
echo ""
echo "4. 在云服务器上执行："
echo "   cd /var/www/"
echo "   tar -xzf backend.tar.gz"
echo "   cd backend"
echo "   npm install --production"
echo "   pm2 start server.js --name task-wechat-api"
echo ""
echo "或者直接启动："
echo "   cd /var/www/backend"
echo "   node server.js"
echo ""
echo "# PM2常用命令："
echo "pm2 list                    # 查看所有服务"
echo "pm2 stop task-wechat-api     # 停止服务"
echo "pm2 restart task-wechat-api  # 重启服务"
echo "pm2 logs task-wechat-api     # 查看日志"
echo ""

# 7. 检查PM2是否安装
echo "🔧 检查PM2："
if command -v pm2 &> /dev/null; then
  echo "  PM2已安装"
  pm2 list
else
  echo "  PM2未安装，建议安装：npm install -g pm2"
fi
echo ""

echo "✅ 部署指南生成完成！"