# TeamUp

TeamUp 帮同学找校内竞赛队伍和队友。三个演示身份可以发布招募、公开个人名片、发出申请或邀请。收件人同意后，双方可在同一条意向详情里查看对方的演示 QQ。

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

在另一个终端的 frontend 目录启动 Vite，再打开 [TeamUp 演示](http://127.0.0.1:5180)。

~~~powershell
npm ci
npm run dev
~~~

API 就绪状态见 [数据库和迁移检查](http://127.0.0.1:8086/api/v1/health/ready)。退出演示后可在根目录执行 docker compose stop，原数据保存在 TeamUp 专用的 MySQL 卷中。

## 演示流程

1. 切到队长林舟，发布一条比赛招募，招聘 1 名数据分析队友负责清洗问卷数据。
2. 切到同学甲许言，在「我的名片」填写可承担的任务和一段虚构经历，将经历设为隐藏。进入「找队伍」，向新招募申请加入。
3. 切回林舟，在「我的意向」打开待回应的申请并同意。详情显示许言的演示 QQ。切回许言可看到林舟的演示 QQ。
4. 林舟从「找队友」邀请同学乙周禾加入。切到周禾婉拒，再回到林舟查看结果或重复发起邀请。

## 验证与契约

在 frontend 运行 npm run format:check、npm test 和 npm run build。UI 测试使用 [契约样例](contracts/examples/demo.json)，可单独运行。

需要在后端停用时预览页面，可在 frontend 的 PowerShell 中运行以下命令。模拟数据的修改保留在当前页面会话中。

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
