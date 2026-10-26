# FIRE ARENA

一个可以直接在浏览器里玩的 **3D 第一人称 1v1 枪战小游戏**，风格类似简化版穿越火线：昵称登录、快速匹配、房间码约战、服务端权威判定、战绩排行榜。

- 纯 Web：Three.js + Canvas + WebSocket，无需安装客户端、无外部美术素材
- 服务端权威：移动、重力、碰撞、射线命中、血量、弹药、比分都在服务器计算
- 桌面键鼠：WASD + 鼠标视角 + Pointer Lock 锁定鼠标
- 单进程：Express 静态服务 + REST API + WebSocket 实时对局

---

## 0. 先说明：这个项目没有“编译”步骤

本项目前端是浏览器原生 ES Module + CSS + Three.js，**没有 webpack / vite / TypeScript 构建流程**，也没有需要编译的产物。

请区分三件事：

| 说法 | 实际含义 | 命令 |
| --- | --- | --- |
| “编译 / 构建” | 本项目**不需要**，没有 `npm run build` | 无 |
| 安装依赖 | 把 Express、ws、Three.js 下载到 `node_modules` | `npm ci` |
| 启动 | 用一个 Node 进程同时提供网页和 WebSocket | `npm start` |
| 部署 | 安装依赖 + 启动 Node +（公网建议）反向代理/HTTPS | 见下文 |

Three.js 的浏览器文件是服务器直接从 `node_modules/three/build/` 读取并提供的，所以：

- **部署时必须保留 `node_modules`，或者在服务器上执行 `npm ci`**
- 不要把 `node_modules` 删掉后再启动
- Docker 的 `docker build` 只是打包运行环境，不是编译前端代码

---

## 1. 环境要求

- **Node.js 20 或更高版本**（开发和测试使用 Node.js 24.22.1）
- npm（随 Node.js 安装）
- 桌面版 Chrome / Edge（推荐）；手机不支持
- 操作系统：Windows / Linux / macOS 均可
- 公网部署建议：一台 Linux 服务器 + 域名（可选）+ Nginx/Caddy

检查环境：

```bash
node -v
npm -v
```

如果提示 `node` 不是命令：

- Windows：安装 [Node.js LTS](https://nodejs.org/) 或执行 `winget install OpenJS.NodeJS.LTS`
- Linux：见“Linux 生产部署”一节的 NodeSource 安装命令

---

## 2. 本地启动（Windows，最快方式）

### 2.1 安装依赖

在项目根目录打开 CMD 或 PowerShell：

```bash
npm ci
```

如果没有 `package-lock.json`，用：

```bash
npm install
```

### 2.2 启动

```bash
npm start
```

或直接双击：

```text
start.bat
```

启动成功后终端会打印：

```text
FIRE ARENA  /  3D web FPS
Local: http://localhost:3000
LAN:   http://192.168.x.x:3000
```

浏览器打开 **<http://localhost:3000>**。

### 2.3 开发模式（改代码自动重启）

```bash
npm run dev
```

`npm run dev` 使用 `node --watch`，只监听服务端文件变化；前端 `public/` 下的文件改完刷新浏览器即可，不需要重启。

### 2.4 停止服务

- 运行 `npm start` 的窗口按 `Ctrl+C`
- 或双击 `stop.bat`（会结束占用 3000 端口的进程）

> 当前机器上已经启动过一个后台实例。如果你要自己用 `start.bat` 重启，先双击 `stop.bat`，否则会提示 3000 端口被占用。

---

## 3. 局域网联机（同一 Wi-Fi / 路由器）

1. 主机双击 `start.bat` 启动服务
2. Windows 防火墙弹窗时选择“允许访问”
3. 把终端打印的 `LAN` 地址发给朋友，例如：

```text
http://192.168.1.17:3000
```

4. 双方都用桌面浏览器打开，输入不同昵称
5. 一边点“快速匹配”，或一方“创建房间”后把 4 位房间码发给对方

如果朋友打不开，在**管理员** CMD 中放行端口：

```bat
netsh advfirewall firewall add rule name="FIRE ARENA 3000" dir=in action=allow protocol=TCP localport=3000
```

删除规则：

```bat
netsh advfirewall firewall delete rule name="FIRE ARENA 3000"
```

> 局域网直连使用的是 HTTP。若浏览器限制某些能力，或你要在公网使用，请按第 6 节配置 HTTPS。

---

## 4. 环境变量与端口

服务端支持以下环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 和 WebSocket 共用的监听端口 |
| `HOST` | `0.0.0.0` | 监听地址；放在反向代理后面时建议改为 `127.0.0.1` |
| `NODE_ENV` | 未设置 | 生产环境可设为 `production`，仅用于标识 |

### Windows CMD

```bat
set "PORT=3000"
set "HOST=0.0.0.0"
npm start
```

### Windows PowerShell

```powershell
$env:PORT=3000
$env:HOST="0.0.0.0"
npm start
```

### Linux / macOS / Docker

```bash
PORT=3000 HOST=0.0.0.0 npm start
```

健康检查：

```bash
curl http://localhost:3000/api/health
# {"ok":true,"uptime":12,"rooms":0}
```

---

## 5. 生产部署（Windows + PM2）

适合没有 Linux 服务器、用一台 Windows 机器长期开服的情况。

### 5.1 安装 PM2

```bash
npm install -g pm2
```

### 5.2 启动、查看、停止

```bash
cd E:\code\fire

pm2 start server/index.js --name fire-arena
pm2 logs fire-arena
pm2 status
pm2 restart fire-arena
pm2 stop fire-arena
pm2 delete fire-arena
```

开机自启：

```bash
pm2 save
```

Windows 下 PM2 的开机自启不如 Linux 稳定，推荐用“任务计划程序”：

1. 打开“任务计划程序” → 创建基本任务
2. 触发器选“计算机启动时”或“登录时”
3. 操作选“启动程序”
4. 程序填 `C:\Users\<你的用户名>\AppData\Local\Programs\nodejs\node.exe`
5. 参数填 `server/index.js`
6. 起始于填 `E:\code\fire`

也可以使用 NSSM 把 Node 注册成 Windows 服务。

> **重要：不要使用 PM2 cluster 多实例（`-i` 参数）**。房间、匹配队列、登录会话都在单个 Node 进程内存里，多实例会导致玩家匹配不到同一局。

---

## 6. Linux 服务器部署（推荐公网使用）

以下示例以 Ubuntu 22.04/24.04、部署目录 `/opt/fire-arena`、域名 `game.example.com` 为例。

### 6.1 安装 Node.js

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 6.2 上传代码并安装依赖

方式一：Git

```bash
sudo mkdir -p /opt/fire-arena
sudo chown "$USER":"$USER" /opt/fire-arena
git clone <你的仓库地址> /opt/fire-arena
cd /opt/fire-arena
npm ci --omit=dev
```

方式二：从本机 rsync（在 Windows 可用 WSL / Git Bash，或先打包上传）

```bash
rsync -av --exclude node_modules --exclude data ./ user@your-server:/opt/fire-arena/
ssh user@your-server
cd /opt/fire-arena
npm ci --omit=dev
```

### 6.3 先用前台命令验证

```bash
cd /opt/fire-arena
HOST=127.0.0.1 PORT=3000 node server/index.js
```

另开一个终端：

```bash
curl http://127.0.0.1:3000/api/health
```

看到 `{"ok":true,...}` 说明服务正常。按 `Ctrl+C` 停止，继续配置 systemd。

### 6.4 创建专用用户并授权

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin firearena
sudo chown -R firearena:firearena /opt/fire-arena
sudo mkdir -p /opt/fire-arena/data
sudo chown -R firearena:firearena /opt/fire-arena/data
```

`data/` 必须可写，否则战绩无法保存。

### 6.5 systemd 托管

复制示例文件：

```bash
sudo cp deploy/fire-arena.service /etc/systemd/system/fire-arena.service
```

如果目录或用户名不同，编辑：

```bash
sudo nano /etc/systemd/system/fire-arena.service
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fire-arena
sudo systemctl status fire-arena
sudo journalctl -u fire-arena -f
```

重启 / 停止：

```bash
sudo systemctl restart fire-arena
sudo systemctl stop fire-arena
```

### 6.6 防火墙

只开放 80/443，**不要把 3000 直接暴露到公网**：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

服务本身监听 `127.0.0.1:3000`，由 Nginx/Caddy 转发。

---

## 7. 反向代理 + HTTPS（公网必须）

WebSocket 和网页共用端口；反向代理必须正确转发 `Upgrade` / `Connection`。

### 7.1 Nginx

复制示例：

```bash
sudo cp deploy/nginx.fire-arena.conf /etc/nginx/conf.d/fire-arena.conf
sudo nano /etc/nginx/conf.d/fire-arena.conf   # 修改 server_name
sudo nginx -t
sudo systemctl reload nginx
```

申请免费证书（会自动改写 Nginx 配置）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com
```

证书自动续期：

```bash
sudo systemctl status certbot.timer
```

### 7.2 Caddy（更简单，自动 HTTPS）

安装 Caddy 后，编辑 `/etc/caddy/Caddyfile`：

```caddyfile
game.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy 会自动申请和续期 HTTPS 证书，并默认支持 WebSocket。

### 7.3 验证

浏览器打开 `https://game.example.com`，完成一次双人对局。页面是 HTTPS 时，前端会自动使用 `wss://` 连接，不需要改代码。

---

## 8. Docker 部署（可选）

项目已附带 `Dockerfile`、`compose.yaml`、`.dockerignore`。

### 8.1 使用 Docker Compose（推荐）

```bash
docker compose up -d --build
docker compose logs -f
```

打开 `http://localhost:3000`。

停止：

```bash
docker compose down
```

数据保存在命名卷 `fire-arena-data` 中。彻底删除数据：

```bash
docker compose down -v
```

### 8.2 直接使用 docker 命令

构建镜像：

```bash
docker build -t fire-arena:latest .
```

运行：

```bash
docker run -d \
  --name fire-arena \
  --restart unless-stopped \
  -p 3000:3000 \
  -v fire-arena-data:/app/data \
  fire-arena:latest
```

查看日志：

```bash
docker logs -f fire-arena
```

> Docker 只是运行环境打包，不涉及前端编译。镜像内会执行 `npm ci --omit=dev` 安装运行依赖。

---

## 9. 常用命令速查

```bash
# 安装依赖（按 lock 文件，适合生产）
npm ci

# 安装依赖（开发）
npm install

# 启动
npm start

# 开发模式（服务端文件变化自动重启）
npm run dev

# 健康检查
curl http://localhost:3000/api/health

# 局域网/公网通过 Nginx 检查
curl -I https://game.example.com

# PM2
pm2 start server/index.js --name fire-arena
pm2 status
pm2 logs fire-arena
pm2 restart fire-arena
pm2 stop fire-arena
```

Windows 双击脚本：

| 文件 | 作用 |
| --- | --- |
| `start.bat` | 检查 Node、安装缺失依赖、启动服务 |
| `stop.bat` | 结束占用 3000 端口的 Node 进程 |

---

## 10. 更新、备份与重置

### 10.1 更新代码

```bash
# Windows
stop.bat
git pull          # 如果你使用 Git
npm ci
start.bat
```

```bash
# Linux + systemd
cd /opt/fire-arena
git pull
npm ci --omit=dev
sudo systemctl restart fire-arena
```

### 10.2 备份战绩

战绩只有一个文件：`data/players.json`。

```powershell
Copy-Item data\players.json data\players.backup.json
```

```bash
cp data/players.json data/players.backup.json
```

### 10.3 清空所有玩家和战绩

先停止服务，再删除文件，最后启动：

```powershell
# Windows
stop.bat
Remove-Item data\players.json
start.bat
```

```bash
# Linux
sudo systemctl stop fire-arena
sudo rm /opt/fire-arena/data/players.json
sudo systemctl start fire-arena
```

### 10.4 修改地图/武器参数

前后端共用参数在这里：

- `shared/constants.js`：移动速度、血量、武器伤害、射速、比赛规则
- `shared/map.js`：地图箱体布局、出生点

改完刷新浏览器；服务端改动需要重启（`npm run dev` 会自动重启）。

---

## 11. 操作与规则

| 按键 | 功能 |
| --- | --- |
| W A S D | 移动 |
| 鼠标 | 瞄准（点击画面锁定鼠标） |
| 左键 | 射击（按住连发） |
| 右键 | 机瞄（视野拉近、散布变小） |
| Shift | 冲刺 |
| Space | 跳跃 |
| R | 换弹 |
| Tab | 按住查看计分板 |
| Esc | 释放鼠标（对局继续，点击画面继续） |

- 1v1，先到 **10 杀** 或 **5 分钟** 内击杀更多者获胜
- 阵亡 3 秒后重生，出生后 2 秒保护
- 一把 AR-15：30 发弹匣、射速 100ms、换弹 2.2s
- 身体命中 25 伤害，**爆头 100 伤害**（一枪击杀）
- 墙体和箱体会阻挡子弹；命中判定由服务器射线检测
- 中途退出 / 掉线 10 秒未重连判负
- 战绩按昵称累计：胜、负、击杀、死亡、爆头、K/D

---

## 12. 项目结构

```text
fire/
├─ server/
│  ├─ index.js      Express、REST API、WebSocket 升级、30Hz 主循环
│  ├─ auth.js       昵称会话、Cookie、昵称校验
│  ├─ store.js      玩家战绩 JSON 持久化、排行榜
│  ├─ rooms.js      匹配队列、房间码、断线重连/判负
│  └─ game.js       3D 服务端模拟：移动、碰撞、射击、伤害、结算
├─ shared/
│  ├─ constants.js  前后端共用参数（速度、血量、武器、比赛规则）
│  ├─ map.js        地图 AABB 布局与出生点
│  └─ physics.js    移动碰撞、射线检测、散布等共用物理
├─ public/
│  ├─ index.html
│  ├─ css/style.css
│  └─ js/
│     ├─ main.js    页面流程、登录、大厅、消息路由
│     ├─ net.js     WebSocket 客户端与自动重连
│     ├─ input.js   键鼠、Pointer Lock、鼠标视角
│     ├─ game.js    对局状态、预测/插值、HUD、结算
│     ├─ world.js   Three.js 场景、地图、枪械、特效
│     ├─ avatars.js 低多边形角色、名字与血条
│     ├─ audio.js   WebAudio 合成音效（无音频文件）
│     └─ ...
├─ deploy/
│  ├─ nginx.fire-arena.conf    Nginx 反向代理示例
│  ├─ Caddyfile.example       Caddy 配置示例
│  └─ fire-arena.service      systemd 服务示例
├─ data/players.json          运行时生成，保存昵称与战绩
├─ Dockerfile
├─ compose.yaml
├─ package.json
├─ start.bat
├─ stop.bat
└─ README.md
```

### 同步方式

- 服务器 30Hz 固定步长模拟，每 tick 广播快照
- 自己：客户端用相同物理代码本地预测，收到快照后轻微校正
- 对手：快照目标位置插值，动作平滑
- 射击：客户端只发朝向和开火意图，服务器做射线检测与伤害结算
- 换弹、射速、弹药、命中全部服务端校验；客户端修改射速/穿墙无效

---

## 13. 已知边界

- 仅支持桌面浏览器 + 键鼠，手机不能正常游玩
- 昵称无密码：别人可以使用同名，战绩会合并
- 画面是低多边形占位风格，不使用外部模型/贴图，达不到写实 FPS 效果
- 首版只有一把步枪；可继续扩展狙击枪、2v2、爆破模式等
- 朝向由客户端上报，服务器能防改射速/穿墙，但无法防自瞄
- 玩家碰撞只做水平圆-AABB，不支持爬箱子/楼梯
- 房间、匹配队列、登录会话都在内存中：**只能单进程**，重启会丢失进行中的对局
- 公网部署请务必使用 HTTPS + 反向代理，并只让 Node 监听 `127.0.0.1`

---

## 14. 常见问题

### `node` / `npm` 不是内部或外部命令

Node 没安装或没进 PATH：

- Windows 重新安装 Node.js LTS，或把 `C:\Users\<用户名>\AppData\Local\Programs\nodejs` 加入 PATH
- 本机当前安装位置：`C:\Users\<用户名>\AppData\Local\Programs\nodejs`

安装后重新打开终端再试。

### 启动报 `EADDRINUSE` / 3000 端口被占用

```bat
stop.bat
```

或换个端口：

```bat
set "PORT=3001"
npm start
```

### 点击画面没有锁定鼠标

- 必须在游戏画面上点击一次
- `Esc` 会释放鼠标，点击“继续战斗”重新锁定
- 某些浏览器要求 HTTPS 或 localhost

### 页面能打开，但一直显示“连接中…”

- 检查反向代理是否转发了 WebSocket 的 `Upgrade` / `Connection` 头
- Nginx 使用 `deploy/nginx.fire-arena.conf` 里的配置，或直接用 Caddy
- 浏览器控制台看 `/ws` 是否 401：登录会话可能已过期，重新登录

### 局域网朋友打不开

- 确认使用服务器打印的 `LAN` 地址，而不是 `localhost`
- 确认在同一局域网
- 防火墙放行 3000 端口
- 某些公司/校园网络会隔离设备互访

### 战绩没有保存

- 检查 `data/` 目录是否可写
- Linux systemd 部署时确认 `User=firearena` 对 `/opt/fire-arena/data` 有写权限

### 画面很卡

- 关闭其他占用 GPU 的程序
- 在 `public/js/world.js` 中降低阴影分辨率或关闭阴影：

```js
renderer.shadowMap.enabled = false;
```

### 想限制只允许本机访问

```bash
HOST=127.0.0.1 npm start
```

Windows CMD：

```bat
set "HOST=127.0.0.1"
npm start
```

---

## 15. 部署检查清单

- [ ] 服务器已安装 Node.js 20+
- [ ] 已执行 `npm ci --omit=dev`
- [ ] `node server/index.js` 能正常启动
- [ ] `curl http://127.0.0.1:3000/api/health` 返回 `ok`
- [ ] 防火墙只开放 80/443，未暴露 3000
- [ ] Nginx/Caddy 已正确转发 WebSocket
- [ ] HTTPS 证书有效
- [ ] `data/` 可写，战绩能保存
- [ ] 用两个窗口完成过一次真实对局
- [ ] 只运行**一个** Node 进程（不要 PM2 cluster）
