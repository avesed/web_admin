# web_admin

`web_admin` 是一个轻量级的的模块化管理提供可视化界面的网站项目

## 功能亮点
- 后台界面可创建/管理多个页面，支持标题区块、文本区块、横向/纵向卡片等模块。
- 简单的口令登录，可配置会话超时时间及自定义 Flask `SECRET_KEY`
- 数据使用sqlite保存在 `data/pages.db`

## Docker

使用镜像：
```bash
docker pull ghcr.io/avesed/webadmin:latest
docker run -d --name web_admin \
  -p 5000:5000 \
  -e ADMIN_PASSWORD="super-secure" \
  -v $(pwd)/data:/app/data \
  ghcr.io/avesed/webadmin:latest
```

## 本地开发
1. 复制示例环境变量并设置强口令：\
   `cp .env.example .env`
2. 创建虚拟环境并安装依赖：
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. 启动服务：
   ```bash
   python admin_server.py
   ```
4. 打开 `http://localhost:5000/admin`，使用 `ADMIN_PASSWORD` 登录并开始编辑；前台展示位于 `http://localhost:5000/`。
