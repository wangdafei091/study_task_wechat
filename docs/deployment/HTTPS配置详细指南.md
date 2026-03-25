# HTTPS配置详细指南 - 小白版

> **目的**：为学习任务小程序配置正式域名和HTTPS
> **目标**：让微信小程序可以正常访问后端API
> **难度**：⭐⭐ 中等（跟着步骤来）
> **预计时间**：1-2小时

---

## 📋 前置准备

### 步骤0：确认信息

**需要你填写的信息：**
```
域名：________________________（请填写你的域名）
服务器IP：121.4.38.122
服务器用户：root（或你的用户名）
```

### 检查清单
- [ ] 已购买域名
- [ ] 可以SSH登录到服务器
- [ ] 知道服务器的root密码或密钥

---

## 🌐 第一阶段：域名DNS解析配置

### 步骤1：登录域名管理后台

**如果你的域名在阿里云：**
1. 访问：https://dc.console.aliyun.com
2. 点击"域名"
3. 找到你的域名，点击"解析"

**如果你的域名在腾讯云：**
1. 访问：https://console.cloud.tencent.com/cns
2. 找到你的域名，点击"解析"

**其他域名服务商：**
- 搜索"你的域名服务商 + DNS解析"
- 或查看购买域名的邮件指引

---

### 步骤2：添加DNS解析记录

**操作步骤：**
1. 点击"添加记录"
2. 填写以下信息：

| 字段 | 填写内容 | 说明 |
|------|----------|------|
| **记录类型** | A | IP地址类型 |
| **主机记录** | api | 子域名 |
| **记录值** | 121.4.38.122 | 你的服务器IP |
| **TTL** | 600 | 10分钟生效 |
| **优先级** | - | A记录不需要 |

**示例：**
```
主机记录: api
记录值:   121.4.38.122
```

**这样配置后：**
- 你的完整域名是：`api.yourdomain.com`
- 例如：`api.study-task.com`

---

### 步骤3：验证DNS解析

**在本地电脑上执行：**
```bash
# 方式1：使用ping命令
ping api.yourdomain.com

# 方式2：使用nslookup命令（macOS）
nslookup api.yourdomain.com

# 方式3：在线查询
# 访问：https://tool.chinaz.com/dns/
# 输入：api.yourdomain.com
```

**预期结果：**
```
PING api.yourdomain.com (121.4.38.122): 56 data bytes
64 bytes from 121.4.38.122: icmp_seq=0 ttl=54 time=10.123 ms
```

**如果看到你的服务器IP（121.4.38.122），说明DNS配置成功！**

---

## 🖥️ 第二阶段：登录服务器并安装工具

### 步骤4：SSH登录到服务器

**在本地电脑的终端中执行：**
```bash
ssh root@121.4.38.122
```

**如果使用密钥登录：**
```bash
ssh -i /path/to/your-key.pem root@121.4.38.122
```

**首次登录会提示：**
```
Are you sure you want to continue connecting (yes/no)? yes
```
输入 `yes` 并回车

**然后输入密码**（输入时不会显示，正常现象）

**成功登录后会看到：**
```
Welcome to Ubuntu 20.04 LTS
root@your-server:~#
```

---

### 步骤5：更新系统软件包

**在服务器上执行：**
```bash
# 更新软件包列表
apt update

# 升级已安装的软件包
apt upgrade -y
```

**这个步骤可能需要几分钟，耐心等待。**

**完成后会看到：**
```
0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.
```

---

### 步骤6：安装Nginx

**在服务器上执行：**
```bash
# 安装Nginx
apt install -y nginx
```

**安装完成后启动Nginx：**
```bash
# 启动Nginx服务
systemctl start nginx

# 设置Nginx开机自启动
systemctl enable nginx
```

**验证Nginx是否运行：**
```bash
# 检查Nginx状态
systemctl status nginx
```

**预期输出：**
```
● nginx.service - A high performance web server and a reverse proxy server
   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
   Active: active (running) since Mon 2026-03-10 12:00:00 UTC; 1min ago
```

**关键信息：**
- `Active: active (running)` - 说明Nginx正在运行
- `enabled` - 说明开机自启动已设置

---

### 步骤7：验证Nginx可以访问

**在本地电脑上执行：**
```bash
# 测试HTTP访问
curl http://121.4.38.122
```

**预期输出：**
```
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
...
</html>
```

**如果看到Nginx欢迎页面，说明Nginx安装成功！**

---

### 步骤8：开放80和443端口

**在腾讯云控制台配置安全组：**

1. 登录腾讯云控制台：https://console.cloud.tencent.com/cvm
2. 找到你的轻量应用服务器
3. 点击"防火墙"或"安全组"
4. 点击"添加规则"
5. 添加以下规则：

| 协议 | 端口 | 策略 | 来源 |
|------|------|------|------|
| TCP | 80 | 允许 | 0.0.0.0/0 |
| TCP | 443 | 允许 | 0.0.0.0/0 |

**说明：**
- 端口80：HTTP访问
- 端口443：HTTPS访问
- 来源0.0.0.0/0：允许任何IP访问

---

## 🔒 第三阶段：申请SSL证书

### 步骤9：安装Certbot（Let's Encrypt工具）

**在服务器上执行：**
```bash
# 安装Certbot和Nginx插件
apt install -y certbot python3-certbot-nginx
```

**安装完成后验证：**
```bash
# 查看Certbot版本
certbot --version
```

**预期输出：**
```
certbot 0.40.0
```

---

### 步骤10：申请SSL证书

**在服务器上执行：**
```bash
# 证书申请命令（请替换为你的域名）
certbot --nginx -d api.yourdomain.com
```

**示例：**
```bash
certbot --nginx -d api.study-task.com
```

**执行过程会提示：**

```
Saving debug log to /var/log/letsencrypt/letsencrypt.log
Enter email address (used for urgent renewal and security notices)
```

**输入你的邮箱地址**（用于证书过期提醒）

```
(A)gree/(C)ancel:
```

**输入 `A` 并回车**（同意服务条款）

```
Would you be willing, once your first certificate is successfully issued, to
share your email address with the Electronic Frontier Foundation, a founding
partner of the Let's Encrypt project and the non-profit organization that
develops Certbot?
(Y)es/(N)o:
```

**输入 `N` 并回车**（不分享邮箱）

---

### 步骤11：配置Nginx SSL

**Certbot会自动询问：**
```
Please choose whether or not to redirect HTTP traffic to HTTPS, removing HTTP access.
1: No redirect - Make no further changes to the webserver configuration.
2: Redirect - Make all requests redirect to secure HTTPS access.
```

**输入 `2` 并回车**（选择HTTPS重定向）

**完成后会看到：**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/api.yourdomain.com/privkey.pem

Congratulations! You have successfully enabled https://api.yourdomain.com
```

**关键信息：**
- ✅ 证书申请成功
- ✅ 证书路径：`/etc/letsencrypt/live/api.yourdomain.com/`
- ✅ HTTPS已启用

---

### 步骤12：重启Nginx

**在服务器上执行：**
```bash
# 重启Nginx服务
systemctl restart nginx

# 检查Nginx状态
systemctl status nginx
```

**确认状态为 `active (running)`**

---

## ⚙️ 第四阶段：配置Nginx反向代理

### 步骤13：查看自动生成的配置

**在服务器上执行：**
```bash
# 查看Nginx配置
cat /etc/nginx/sites-available/api.yourdomain.com
```

**你会看到类似这样的配置：**
```nginx
server {
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;

    server_name api.yourdomain.com;

    location / {
        try_files $uri $uri/ =404;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
```

---

### 步骤14：修改Nginx配置为反向代理

**在服务器上执行：**
```bash
# 编辑Nginx配置文件
nano /etc/nginx/sites-available/api.yourdomain.com
```

**将配置修改为：**
```nginx
server {
    server_name api.yourdomain.com;

    # 代理到Node.js后端
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    # HTTP到HTTPS重定向
    if ($scheme != "https") {
        return 301 https://$host$request_uri;
    }
}
```

**保存文件：**
- 按 `Ctrl + X`
- 输入 `Y`
- 按 `Enter`

---

### 步骤15：测试Nginx配置

**在服务器上执行：**
```bash
# 测试Nginx配置是否正确
nginx -t
```

**预期输出：**
```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**如果显示错误，检查配置文件的语法**

---

### 步骤16：重载Nginx配置

**在服务器上执行：**
```bash
# 重载Nginx配置
systemctl reload nginx

# 验证Nginx状态
systemctl status nginx
```

---

## 🧪 第五阶段：验证HTTPS配置

### 步骤17：测试HTTPS访问

**在本地电脑上执行：**
```bash
# 测试HTTPS访问
curl -I https://api.yourdomain.com/health
```

**预期输出：**
```
HTTP/2 200
content-type: application/json; charset=utf-8
date: Tue, 10 Mar 2026 12:00:00 GMT
strict-transport-security: max-age=31536000; includeSubDomains
```

**关键信息：**
- `HTTP/2 200` - HTTPS连接成功
- `strict-transport-security` - 安全头正常

**在浏览器中测试：**
1. 打开浏览器
2. 访问：`https://api.yourdomain.com/health`
3. 应该看到：
   ```json
   {
     "status": "ok",
     "timestamp": 1773141454167,
     "uptime": 24664.889128293,
     "environment": "production"
   }
   ```
4. 浏览器地址栏应该显示🔒锁图标

---

### 步骤18：测试微信API

**在本地电脑上执行：**
```bash
# 测试微信登录API
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code"}'
```

**如果看到响应（无论成功还是失败），说明HTTPS配置成功！**

---

## 📱 第六阶段：修改小程序配置

### 步骤19：修改API_BASE_URL

**在微信开发者工具 Console 中显式写入环境配置：**

```javascript
wx.setStorageSync('ENABLE_API', 'true');
wx.setStorageSync('API_BASE_URL', 'https://api.yourdomain.com');
```

**示例：**
```javascript
wx.setStorageSync('ENABLE_API', 'true');
wx.setStorageSync('API_BASE_URL', 'https://api.study-task.com');
```

**说明：**
- 当前版本不再通过 `app.js` 自动写入默认后端地址
- 如果没有显式写入 `ENABLE_API=true` 和 `API_BASE_URL`，应用会保持本地模式
- 写入后需要清缓存并重新编译，确保启动阶段读取到最新配置

---

### 步骤20：清理缓存并重新编译

**在微信开发者工具中：**
1. 点击"清缓存" → "清除全部缓存"
2. 点击"编译"按钮
3. 等待编译完成

---

## ⚙️ 第七阶段：配置微信公众平台域名

### 步骤21：登录微信公众平台

1. 访问：https://mp.weixin.qq.com
2. 扫码登录
3. 进入小程序管理后台

---

### 步骤22：配置服务器域名

1. 点击左侧菜单：**开发** → **开发设置**
2. 找到：**服务器域名**
3. 点击：**修改**
4. 在 **request合法域名** 中添加：
   ```
   https://api.yourdomain.com
   ```
5. 点击：**保存并提交**

**注意：**
- 必须使用 `https://`
- 必须配置域名，不能是IP地址
- 配置后可能需要几分钟生效

---

### 步骤23：上传并发布小程序

1. **上传代码**
   - 在开发者工具中
   - 点击"上传"
   - 填写版本号：`1.0.1`
   - 填写项目备注：`配置HTTPS域名`
   - 点击"上传"

2. **提交审核**
   - 登录微信公众平台
   - 进入：版本管理
   - 找到刚上传的版本
   - 点击"提交审核"
   - 填写审核信息

3. **发布版本**
   - 审核通过后
   - 点击"发布"
   - 小程序正式上线

---

## ✅ 第八阶段：真机测试验证

### 步骤24：在微信中打开小程序

1. 打开微信
2. 搜索你的小程序名称
3. 点击打开

### 测试清单

- [ ] 小程序能正常打开
- [ ] 登录成功
- [ ] 能创建任务
- [ ] 能刷新任务列表
- [ ] 没有网络错误提示

**如果所有测试通过，恭喜你！HTTPS配置成功！** 🎉

---

## 🔧 常见问题排查

### 问题1：DNS解析不生效

**现象**：`ping api.yourdomain.com` 无法解析到你的IP

**解决方案：**
1. 检查DNS记录是否正确配置
2. 等待DNS传播（最多48小时）
3. 检查域名解析记录是否已保存

---

### 问题2：SSL证书申请失败

**现象**：`certbot` 报错

**常见错误和解决方案：**

**错误1：域名未解析到服务器**
```
The requested api.yourdomain.com does not resolve to this server
```
**解决方案**：等待DNS解析生效，或检查DNS配置

**错误2：端口80未开放**
```
Unable to connect to IPv4 or IPv6
```
**解决方案**：检查防火墙/安全组是否开放80端口

---

### 问题3：Nginx配置错误

**现象**：`nginx -t` 报错

**解决方案：**
1. 检查配置文件语法
2. 查看错误日志：`tail -f /var/log/nginx/error.log`
3. 确保配置文件中没有语法错误

---

### 问题4：小程序仍然无法访问

**现象**：配置HTTPS后小程序还是提示网络错误

**解决方案：**
1. 确认域名已添加到微信公众平台的"request合法域名"
2. 清除小程序缓存：微信 → 发现 → 小程序 → 删除
3. 重新打开小程序

---

## 📞 需要帮助？

如果在配置过程中遇到问题，请告诉我：

1. **在哪个步骤遇到问题？**
   ```
   例如：步骤15 - 测试Nginx配置
   ```

2. **具体的错误信息是什么？**
   ```
   （请复制完整的错误信息）
   ```

3. **你当前的服务器环境？**
   ```
   操作系统：Ubuntu 20.04 / CentOS 7 / 其他
   Nginx版本：nginx/1.18.0
   ```

**我会根据你的具体情况提供详细的解决方案！** 🚀

---

## 📝 配置完成后的检查清单

- [ ] DNS解析正常
- [ ] Nginx安装并运行
- [ ] SSL证书申请成功
- [ ] Nginx反向代理配置正确
- [ ] HTTPS访问正常（浏览器测试）
- [ ] 后端API访问正常（curl测试）
- [ ] 小程序 `ENABLE_API` 与 `API_BASE_URL` 已显式写入
- [ ] 微信公众平台域名已配置
- [ ] 小程序代码已上传发布
- [ ] 真机测试通过

**全部勾选后，你的HTTPS配置就完美完成了！** ⭐

---

**祝配置顺利！如有任何问题，随时告诉我！** 💪
