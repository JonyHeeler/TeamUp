# TeamUP 第一阶段开发约定

## 今晚要验证什么

校内竞赛组队有两种常见需求。队长知道队里缺一个会做数据分析的人，却不知道谁有时间。想参赛的同学有相关经验，却未必愿意在大群里公开自荐。TeamUP 让队长发布招募，也让同学发布可被发现的个人名片，双方看到合适的对象后再决定是否联系。

**2026 年 11 月 23 日的 Demo 目标**是让两位同学在同一台设备上分饰队长和候选人，三分钟内走通一次「发现合适的人或队 → 表达意向 → 对方同意 → 交换演示联系方式」。成功标准是他们能说清队伍缺谁、同学能做什么，以及谁能在什么时候看到联系方式。

参考站首页的部分竞赛卡片可直接进入对应比赛的组队页。组队页将目标比赛、招募人数和能力需求拆成独立字段。今晚借用这个做法，让浏览者一眼看出「参加什么比赛、缺什么人」，并提供按技能找同学的入口。[竞赛信息门户](https://competition.thirdplayer.cn/index.html) · [寻找队友](https://competition.thirdplayer.cn/team.html)

## 功能优先级矩阵

P0 是今晚演示的验收范围。P1 在看完首轮试用反馈后安排。P2 保留为后续讨论。工作量按单机演示估算，小表示单个表单或列表即可完成，中表示要联动多个视图或身份。

| 优先级 | 功能 | 对组队的价值 | 工作量 | 交付边界 |
| --- | --- | --- | --- | --- |
| P0 | 发布招募、找队伍 | 同学能判断自己是否适合 | 小 | 队长填写比赛、队伍名、缺口人数、技能标签和任务说明。发布后立即出现在「找队伍」 |
| P0 | 发布个人名片、找队友 | 队长可以主动物色人选 | 小 | 名片展示昵称、技能和可承担的任务。专业、年级、经历选填，由本人勾选公开字段。队长可按技能筛选并用相同字段比较候选人 |
| P0 | 申请加入、邀请入队 | 任一方都能迈出第一步 | 中 | 申请指向一条招募，邀请指向一位候选人和一条自己的招募。收件人可同意或婉拒，发件人能看到结果 |
| P0 | 双方同意后查看联系方式 | 有意合作的人能转到 QQ 沟通，也能避免意外公开 | 中 | 发起按钮旁说明同意后的可见范围。对方接受后，仅这对演示身份可在该意向详情中查看彼此的虚构 QQ |
| P1 | 扩充主页与筛选 | 验证大家实际依据哪些信息选队友 | 中 | 根据反馈再加作品链接、可投入时间或组合筛选 |
| P1 | 招募帖下公开问答 | 让多人复用有关分工、时间等问题的答复 | 中 | 先验证是否有重复提问。若开放评论，同时设计举报、隐藏和处理入口 |
| P2 | 赛事日历、动态广场、导师资源 | 服务找队友以外的需求 | 另估 | 待明确使用场景和维护人后再排期 |

沟通统一转到站外 QQ。站内只处理意向和结果，聊天记录、消息推送均在本阶段范围之外。

## 架构定案 · 2026 年 11 月 24 日

从第一条招募开始走完整链路：**浏览器 → HTTP API → 本地 MySQL**。前后端放在同一仓库以便同步评审契约，各自拥有入口、依赖、锁文件、测试和构建产物，可单独启动和发布。浏览器只保留界面状态，刷新后通过 API 重新读取。接受意向表示同意交换 QQ，计划招募人数由队长填写，接受意向不会占用名额。

### 从课程图谱项目取用的做法

| 实际参考位置 | 观察与 TeamUP 的取舍 |
| --- | --- |
| [后端路由](D:/swufe-course-kg-agent/backend/api/routes.py)、[响应模型](D:/swufe-course-kg-agent/backend/api/schemas.py)、[MySQL 客户端](D:/swufe-course-kg-agent/backend/db/mysql_client.py) | 路由声明响应模型，数据库连接集中管理。沿用 FastAPI、Pydantic、SQLAlchemy 分工。TeamUP 使用 Alembic 管理表结构演进 |
| [全栈版 HTTP 入口](D:/swufe-course-kg-agent/frontend/src/api/http.ts) | API 地址与错误转换集中在请求层。TeamUP 用一个 fetch 客户端处理相对地址、会话和错误，页面只调用业务方法 |
| [独立前端的构建配置](D:/swufe-course-kg-frontend/package.json)、[数据客户端](D:/swufe-course-kg-frontend/src/api/client.ts) | React 前端可以独立构建，该版本从静态资源读取课程。TeamUP 借用独立交付方式，组队数据与 QQ 权限由后端实时处理，前端演示样例只用于模拟联调 |

### 目录与依赖方向

| 交付单元 | 选型 | 负责什么 |
| --- | --- | --- |
| `frontend/` | React、TypeScript strict、Vite、普通 CSS、Vitest，Node 24 / npm 11，提交 `package-lock.json` | 页面、表单、无障碍交互和请求状态。`src/api/` 封装 fetch、生成的类型及错误处理。产物为 `dist/` |
| `backend/` | Python 3.12、FastAPI、Pydantic、SQLAlchemy 2 同步会话、PyMySQL（含 RSA 认证依赖）、Alembic、pytest，提交 `pyproject.toml` 和 `uv.lock` | `app/api/` 定义路由和输入输出，`app/services/` 执行校验、授权和事务，`app/db/` 管理会话与模型。`migrations/` 随后端版本发布 |
| `contracts/` | `openapi.json` 和少量虚构 JSON 样例 | 后端以响应模型导出 OpenAPI，前端以 openapi-typescript 生成类型。前端可用样例独立开发，后端可用 HTTP 测试独立验收。[FastAPI 客户端生成](https://fastapi.tiangolo.com/advanced/generate-clients/) |
| 根目录 `compose.yaml` | Docker Compose，仅编排 Demo 所需的 MySQL | 前后端进程直接在宿主机运行，方便各自调试。正式发布时分别交付静态站点与 API 服务，入口反向代理沿用同一 HTTP 契约 |

两个工程只通过 `/api/v1` 和契约样例协作。前端包不能导入后端源码、ORM 模型或数据库凭据。后端的构建、迁移和测试均可在未安装 Node 的环境执行。

## 本地 MySQL 与 Docker

已核对本机 Docker Engine 29.4.3、Compose v5.1.3 和缓存镜像 `mysql:8.0`。课程图谱容器使用宿主端口 3307，酒店项目使用 3308，均已在运行。TeamUP 使用独立 Compose 项目 `teamup`、服务名 `db`、数据库 `teamup`、命名卷 `teamup_mysql_data`。选用本机已有镜像以便离线启动，以下三个新端口在设计核对时均未监听。

| 进程 | 本地地址 | 谁连接 |
| --- | --- | --- |
| Vite | `http://127.0.0.1:5180` | 浏览器。开发代理把同源 `/api` 原样转到 8086，无需开放跨域凭证 |
| Uvicorn | `http://127.0.0.1:8086` | Vite 代理、后端开发者和集成测试 |
| MySQL | `127.0.0.1:3309 → db:3306` | 宿主机上的后端和迁移工具。后续若 API 也进入同一 Compose 网络，则改连 `db:3306`。[Compose 网络说明](https://docs.docker.com/compose/how-tos/networking/) |

首个实现提交按下面的配置创建 Compose 文件。根目录的 `.env.example` 只列变量名和非敏感默认项，开发者在被 Git 忽略的 `.env` 中为两个密码分别赋值。API 用 `teamup_app` 连接本项目库，root 密码只用于初始化。前端环境变量里不放数据库或会话密钥。

```yaml
name: teamup
services:
  db:
    image: mysql:8.0
    ports:
      - "127.0.0.1:3309:3306"
    environment:
      MYSQL_DATABASE: teamup
      MYSQL_USER: teamup_app
      MYSQL_PASSWORD: ${TEAMUP_DB_PASSWORD:?required}
      MYSQL_ROOT_PASSWORD: ${TEAMUP_DB_ROOT_PASSWORD:?required}
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "--silent"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  mysql_data:
    name: teamup_mysql_data
```

普通停用执行 `docker compose stop`，再次启动沿用原卷。数据库健康探针用于判断服务进程就绪，API 的 `GET /api/v1/health/ready` 另用应用凭据查询数据库和迁移版本，失败返回 503。可用状态要求迁移达到当前版本。

## 数据结构与事务

所有表采用 InnoDB、`utf8mb4`。业务主键由后端生成 UUID，SQL 使用 `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`，主外键类型及排序规则一致。API 收发 UUID 字符串。时间存 UTC `DATETIME(6)`，API 输出带 `Z` 的 ISO 8601 字符串。列名用 snake_case，JSON 字段用 camelCase。除下表注明可空的字段，业务必填列均设 `NOT NULL`。

| 表 | 字段和关系 | 主要约束与访问路径 |
| --- | --- | --- |
| `users`、`contacts` | `users(id PK, nickname VARCHAR(80))`；`contacts(user_id PK/FK → users, qq VARCHAR(64))` | 每人一条联系方式。种子仅使用 `DEMO-QQ-*`。公开查询不联接 contacts |
| `profiles` | `user_id PK/FK → users`、`contribution VARCHAR(500)`，可空的 `major VARCHAR(80)`、`grade VARCHAR(80)`、`experience VARCHAR(500)`，各对应一个 `show_*` 布尔列 | 一人一张名片，保存即发布。可选字段默认隐藏，公开响应按可见标记逐项组装 |
| `recruitments` | `id PK`、`owner_id FK → users`、`competition` 和 `team_name VARCHAR(80)`、`openings INT`、`task VARCHAR(500)`、`created_at` | `CHECK(openings > 0)`，索引 `(owner_id, created_at)`。所有者从会话获得且创建后固定 |
| `skills`、`profile_skills`、`recruitment_skills` | 技能表用 `code VARCHAR(32) PK` 和中文 `label`，两张关联表分别外键到名片或招募及技能 | 每张关联表以「所属 ID、技能码」为复合主键，并建立逆序索引供按技能筛选。首批固定为 data-analysis、development、design、presentation |
| `intents` | `id PK`、`recruitment_id FK → recruitments`、`candidate_id FK → profiles.user_id`、`kind ENUM('apply','invite')`、`status ENUM('pending','accepted','declined')`、`created_at`、可空的 `responded_at` | 唯一键 `(recruitment_id, candidate_id)` 跨发起方向生效。索引 `(candidate_id, created_at)`。CHECK 保证仅 pending 的回应时间为空 |

写操作的校验与事务由后端统一执行。必填文本去首尾空白后校验非空和表中长度。名片和招募至少有一个合法技能，关联行去重，与主记录在同一事务提交。意向要求候选人有名片、双方不同人、两人均有联系方式。队长由招募推导，发起人和收件人由 kind 推导。

- **创建。** 先校验发起权限，再尝试插入 pending。遇到该复合唯一键冲突，回滚本次写入，在新事务读取已有记录。两个人同时申请和邀请也只产生一条，以首次成功写入的方向为准。
- **回应。** 校验当前用户是收件人后执行带 `WHERE id = ? AND status = 'pending'` 的条件更新，状态与时间一同写入。更新零行时重新读取已提交状态，同一决定返回 200，相反决定返回 409。数据库异常回滚。
- **联系方式。** 仅意向详情在校验参与关系和 accepted 状态后，读取对方 QQ。意向列表始终省略 QQ。私有响应设置 `Cache-Control: no-store`，日志只记请求 ID、状态与耗时。MySQL 对行、外键和检查约束提供落库校验。[MySQL CHECK 约束](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html)

## HTTP 契约与演示身份

以下路径均相对于 `/api/v1`。单项返回对象，列表返回 `{items: [...]}`，错误固定为 `{error: {code, message, fields?}}`。DTO 区分本人可编辑资料、公开资料、意向摘要和意向详情。公开名片返回 userId、昵称、技能、贡献与已公开的可选字段，隐藏字段从响应中省略。

| 操作 | 请求与关键输入 | 成功与授权 |
| --- | --- | --- |
| 切换或恢复身份 | `POST /demo/session` 传 `persona`；`GET /me` | POST 只接受三枚预置身份代号，设置带签名和到期时间的 HttpOnly、SameSite=Strict 会话 Cookie。GET 仅返回当前身份 |
| 浏览或编辑名片 | `GET /profiles?skill=`、`GET /profiles/{userId}`、`GET /me/profile`、`PUT /me/profile` | 公开端点按字段投影，本人端点可读写可选字段与 `publicFields`。PUT 从会话确定所有者 |
| 浏览或发布招募 | `GET /recruitments?skill=`、`GET /recruitments/{id}`、`POST /recruitments` | POST 传 `competition, teamName, openings, skills, task`，返回 201 和新记录。队长可从列表中的 ownerId 识别自己的招募 |
| 申请或邀请 | `POST /intents`，申请传 `{kind, recruitmentId}`，邀请再传 `candidateId` | 申请人的 ID 由会话取得，邀请仅限招募所有者。新建返回 201，重复返回原意向摘要及 200 |
| 查看或回应意向 | `GET /me/intents`、`GET /intents/{id}`、`POST /intents/{id}/response` 传 `{decision}` | 列表只含本人参与的意向，摘要给出方向、双方 ID、状态和可执行操作。decision 仅接受 accepted、declined。详情仅对双方开放 |

受保护端点缺少有效会话返回 401，参与者越权回应返回 403，非参与者读取某条意向返回 404，输入无效返回 422。所有写接口校验浏览器来源。演示入口仅在显式本地 Demo 模式启用，签名密钥只在后端环境中加载；真实试点替换为真实登录和 HTTPS Secure Cookie。切换成功后清除旧身份资料、意向详情和请求缓存，丢弃旧身份尚未完成的响应。

## 开工、联调与编码约定

1. **先交契约。** 围绕一条招募、一张名片、一对身份编写请求响应模型并导出 OpenAPI。契约样例至少覆盖待回应、同意、婉拒和第三人不可读。前端用样例完成列表、表单、意向页。模拟模式显式开启，正式演示统一连接真实 API。
2. **接数据库。** 首个工程提交补齐上面的 Compose、环境样例、锁文件、初始 Alembic 迁移和幂等种子命令。种子包含三个虚构用户、三张名片、两条招募、四个技能。按固定键补缺，保留使用者编辑和已产生的意向。
3. **独立启动。** 以下是首个实现提交需支持的命令。根目录配置好本机环境后运行 `docker compose up -d --wait db`。在 `backend/` 依次运行 `uv sync --frozen`、`uv run alembic upgrade head`、`uv run python -m app.seed`、`uv run uvicorn app.main:app --host 127.0.0.1 --port 8086`。后端配置加载器统一从根目录环境文件读取 TeamUP 参数，迁移与种子复用该加载器。另开终端在 `frontend/` 执行 `npm ci`、`npm run dev`，打开 5180。
4. **交付一条完整路径。** 先跑通发布招募 → 候选人申请 → 队长同意 → 双方在详情看见对方 QQ，再补邀请、婉拒、重复操作和换身份。任一写入失败都保留表单输入，只有 API 确认提交后才更新成功状态。

前端采用 Prettier、两空格缩进、PascalCase 组件和 camelCase 字段。表单有可访问标签，错误靠近字段，用户文本使用 React 默认转义。后端采用 Ruff、四空格、snake_case 标识符、带类型的服务函数。会话按请求创建和关闭，每个业务操作只有一个事务提交点。依赖更新与锁文件同提交，`.env`、虚拟环境、构建产物及数据库卷内容均由 Git 忽略。

## 现场验收

| 操作 | 应看到的结果 |
| --- | --- |
| 以队长身份发布「数学建模队，缺 1 名数据分析队友，负责清洗问卷数据」 | 在「找队伍」能看到这条招募，比赛、缺口和具体任务清楚可见 |
| 以同学甲发布名片，勾选「数据分析」，填写经历并关闭其公开开关 | 队长按「数据分析」能找到甲。甲的公开卡片和详情均隐藏该经历及 QQ |
| 甲从上述招募发出申请，刷新，再切换到队长身份 | 甲看到一条「待回应」，队长收到同一条申请。双方此时都看不到对方 QQ |
| 队长同意甲的申请，分别切回甲和无关同学乙查看 | 队长和甲能在意向详情看到彼此的演示 QQ。乙在公开页面看不到双方 QQ |
| 队长另从名片列表邀请乙加入，乙婉拒 | 队长看到「已婉拒」，双方联系方式继续隐藏。再次点击同一邀请只显示已有状态 |

演示后请队长指出决定邀请谁的那个字段，请候选人指出自己在哪一步同意交换 QQ。这两条反馈分别决定下一轮优先补哪些资料，以及是否需要调整意向按钮的提示。

## 合并与交付

- 前端在独立目录运行 `npm ci`、`npm run format:check`、`npm test`、`npm run build`。后台停用时仍能通过契约样例执行 UI 测试。后端运行 `uv run ruff check .` 和 `uv run pytest`。契约变更须重新导出 OpenAPI 和生成前端类型，并检查提交内容与生成结果一致。
- 后端集成测试使用隔离的 MySQL 测试库。从空库执行迁移，验证种子可重跑、并发创建仅一条、回应冲突、隐藏字段和无关身份读取。运行测试前校验库名为测试专用名称，避免清理演示库。
- 联调时用浏览器网络面板检查隐藏字段和 QQ 是否已从对应 HTTP 响应省略。桌面与手机宽度分别完成现场验收；重启 API 和数据库后，既有招募及意向仍可读取。数据库不可用时就绪检查返回 503，恢复后可继续浏览。
