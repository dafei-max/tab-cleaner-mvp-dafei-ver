# Railway 端口配置指南

## 当前配置

`railway.json` 已正确配置为使用 Railway 自动分配的端口：

```json
{
  "deploy": {
    "startCommand": "uv run uvicorn main:app --host 0.0.0.0 --port $PORT"
  }
}
```

Railway 会自动设置 `$PORT` 环境变量，应用会监听该端口。

---

## 修改端口的方法

### 方法1：在 Railway 界面修改（推荐）

1. **登录 Railway Dashboard**
   - 访问 https://railway.app
   - 选择项目 `tab-cleaner-mvp-app`

2. **进入 Networking 设置**
   - 点击服务 `tab-cleaner-mvp-app`
   - 进入 **Networking** 标签页

3. **修改 Public Networking 端口**
   - 在 **Public Networking** 部分
   - 找到 **Port** 设置（当前显示为 `8000`）
   - 点击 **Edit** 按钮
   - 修改为您需要的端口（例如：`3000`, `5000`, `8080` 等）
   - 保存更改

4. **Railway 会自动重新部署**
   - 修改端口后，Railway 会自动触发重新部署
   - 新的端口配置会生效

---

### 方法2：通过环境变量设置（可选）

如果需要在代码中指定默认端口（仅用于本地开发），可以在 Railway 界面添加环境变量：

1. **进入 Variables 设置**
   - 在服务设置中找到 **Variables** 标签页
   - 点击 **+ New Variable**

2. **添加 PORT 环境变量**
   - **Name**: `PORT`
   - **Value**: 您想要的端口号（例如：`3000`）
   - 保存

3. **注意**：
   - Railway 会自动设置 `PORT` 环境变量
   - 通常不需要手动设置
   - 只有在特殊情况下才需要手动设置

---

## 验证端口配置

### 1. 检查部署日志

部署后，查看日志应该看到：
```
INFO:     Uvicorn running on http://0.0.0.0:XXXX (Press CTRL+C to quit)
```

其中 `XXXX` 是 Railway 分配的端口。

### 2. 检查 Public Domain

在 **Networking** → **Public Networking** 部分，查看：
- **Public Domain**: `tab-cleaner-mvp-app-production.up.railway.app`
- **Port**: 显示当前使用的端口

### 3. 测试访问

访问您的应用：
```
https://tab-cleaner-mvp-app-production.up.railway.app
```

Railway 会自动处理端口映射，您只需要访问域名即可。

---

## 常见问题

### Q: 为什么修改端口后还是显示 8000？

**A**: Railway 的端口配置可能需要等待重新部署。请：
1. 确认已保存更改
2. 等待重新部署完成（查看 Deploy Logs）
3. 刷新 Railway 界面

### Q: 可以同时使用多个端口吗？

**A**: Railway 的 Public Networking 通常只支持一个 HTTP 端口。如果需要多个端口，可以考虑：
- 使用 TCP Proxy（在 Networking 设置中）
- 或者使用不同的服务实例

### Q: 修改端口会影响现有连接吗？

**A**: 会。修改端口后：
- 旧的连接会断开
- 需要重新连接到新的端口
- 如果使用域名访问，通常不受影响（Railway 会自动处理）

---

## 当前状态

根据您的截图，当前配置：
- **Public Domain**: `tab-cleaner-mvp-app-production.up.railway.app`
- **Port**: `8000`
- **Metal Edge**: 已启用

如果需要修改端口，请在 Railway 界面的 **Networking** → **Public Networking** 部分进行修改。

---

**最后更新**: 2025-12-03

