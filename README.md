# 一拍即合 · TeamUP

「一拍即合」帮同学找校内竞赛队伍和队友。三个演示身份可以在官方比赛里创建队伍、公开个人名片、发出申请或邀请。收件人同意后，双方可在同一条击掌申请的详情里查看彼此在名片里填写的 QQ。

## 本地启动

需要 Docker Compose、Python 3.12、uv、Node 24 和 npm 11。首次配置时，将 [.env.example](.env.example) 复制为 .env，分别填写两个 MySQL 密码和一个随机会话签名密钥，并设置 TEAMUP_DEMO_MODE=true。演示地址使用 127.0.0.1，与来源校验保持一致。

在项目根目录启动 MySQL。

~~~powershell
docker compose up -d --wait db
~~~

在 backend 目录迁移数据库、初始化虚构资料并启动 API。

~~~powershell
uv sync --frozen
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn app.main:app --host 127.0.0.1 --port 8086
~~~

在另一个终端的 frontend 目录启动 Vite，再打开 [一拍即合](http://127.0.0.1:5180)。

~~~powershell
npm ci
npm run dev
~~~

API 就绪状态见 [数据库和迁移检查](http://127.0.0.1:8086/api/v1/health/ready)。退出演示后可在根目录执行 docker compose stop，原数据保存在 TeamUP 专用的 MySQL 卷中。

页面支持直接访问 `/`、`/teams`、`/people` 与 `/center`。静态部署对这些前端路径及其子路由回退到 `index.html`，并将 `/api/v1` 转发到后端。前端通过 `GET /api/v1/me` 恢复 Cookie 会话，通过 `POST /api/v1/demo/session` 切换演示身份。

已有本地演示库可运行 `uv run python -m app.seed --fill-profiles` 补齐演示名片。该命令会替换旧版预置的简短自我介绍，并为仍使用该介绍的角色补充技能。其他已编辑内容会保留。

学号账号在独立环境通过直达地址试用。启动、激活和恢复的步骤见 [账号系统运行说明](docs/account-system.md#本机试用与运营操作)。

## 演示流程

1. 切到队长林舟，在「欢迎」的比赛目录打开「美赛」，或在「找队伍」按比赛筛选。点击「创建队伍」，填写队伍 BG 介绍，为每个招募名额单独选技能标签或写期望。队名留空时使用平台编号。
2. 切到同学甲许言，从「个人中心」打开「编辑名片」，填写学院、QQ、自我介绍和一段虚构经历，关闭经历的公开开关。回到该比赛，向新队伍申请加入。
3. 切回林舟，在「个人中心」打开待回应的击掌申请并同意。详情显示许言的演示 QQ。切回许言可看到林舟的演示 QQ。
4. 林舟从「找队友」邀请同学乙周禾加入。切到周禾婉拒，再回到林舟查看结果或重复发起邀请。

官方比赛目录在 [backend/app/competitions.py](backend/app/competitions.py) 中配置。前端从 GET /api/v1/competitions 获取目录，创建队伍时使用对应条目的中文比赛名称。

队伍编号由北京时间的 YYYYMMDD 和当天三位递增的 36 进制序号组成。名片学院默认公开，可手动关闭。找队友可按公开学院和预设技能筛选，自定义技能仅在名片显示。升级后，旧名片在下次保存时补填学院，旧队伍的资料继续保留。

「编辑名片」的经历区可添加至多 3 张静态 JPG、PNG 或 WebP 图片。浏览器压缩大图，API 将保存的每张图片规范为 1 MB 以内的 WebP。发布名片后，图片随经历公开开关控制可见范围。

## 验证与契约

在 frontend 运行 npm run format:check、npm test 和 npm run build。UI 测试使用 [契约样例](contracts/examples/demo.json)，可单独运行。

需要在后端停用时预览页面，可在 frontend 的 PowerShell 中运行以下命令。模拟身份在当前标签页刷新后可以恢复。模拟数据的修改保留到刷新前。

~~~powershell
$env:VITE_TEAMUP_MOCK = 'true'
npm run dev
Remove-Item Env:VITE_TEAMUP_MOCK
~~~

在 backend 运行 uv run ruff check . 和 uv run pytest。要同时运行 MySQL 集成测试，将 TEAMUP_TEST_DATABASE_URL 设为指向空的 teamup_test 库的 mysql+pymysql URL，并为该库配置专用测试账号。测试从空库执行迁移，结束时撤销本轮迁移。根目录已配置本机验收用 .env.test.local 时，可在 backend 目录运行以下命令。

~~~powershell
$env:TEAMUP_TEST_DATABASE_URL = (Get-Content ../.env.test.local -Raw).Trim().Split('=', 2)[1]
uv run pytest
Remove-Item Env:TEAMUP_TEST_DATABASE_URL
~~~

在 backend 运行 uv run python -m app.export_openapi 可导出 [OpenAPI 契约](contracts/openapi.json)。随后在 frontend 运行 npm run generate:api，更新 TypeScript 类型。[意向样例](contracts/examples/intent-responses.json)覆盖待回应、同意、婉拒和第三人读取失败。
