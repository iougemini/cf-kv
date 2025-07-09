# Excalidraw Cloudflare Worker 部署指南 (Dashboard 版)

本文档将指导您如何通过 Cloudflare 的网页管理后台 (Dashboard) 部署 Excalidraw 后端服务。

该 Worker 使用 Cloudflare 的 Durable Objects 来持久化存储画布数据，为您提供一个高性能、可扩展的 Excalidraw 后端服务。

## 部署方法概述

我们提供两种通过 Cloudflare Dashboard 部署的方法：

1.  **通过 Git 仓库部署 (推荐)**: 设置一次后，每当您更新代码到 Git 仓库时，Cloudflare 都会自动为您部署最新版本。这是实现 CI/CD 的最佳实践。
2.  **手动复制粘贴代码**: 简单快速，适合一次性测试或不希望关联 Git 仓库的场景。每次更新都需要手动操作。

---

### 方法一：通过 Git 仓库部署 (推荐)

此方法将您的 GitHub 仓库与 Cloudflare 直接关联。

#### 第一步：Fork 仓库

1.  登录您的 GitHub 账户。
2.  访问 `excalidraw-complete` 项目仓库，并点击右上角的 **Fork** 按钮，将项目复刻到您自己的账户下。

#### 第二步：在 Cloudflare 中创建并连接应用

1.  登录到您的 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  在左侧导航栏中，选择 **Workers & Pages**。
3.  点击 **Create application**，然后切换到 **Pages** 标签页，并点击 **Connect to Git**。
4.  选择您刚刚 Fork 的项目仓库，并点击 **Begin setup**。

#### 第三步：配置构建与部署

1.  **Project name**: 为您的项目取一个名字。
2.  **Production branch**: 选择 `main` 或者您 Fork 后的主分支。
3.  **Build settings**:
    -   **Framework preset**: 设置为 `None`。
    -   **Build command**: *留空*。
    -   **Build output directory**: *留空*。
    -   **Root Directory**: 点击 `(Advanced)` 展开，设置为 `cloudflare-worker`。 **这一步至关重要**，它告诉 Cloudflare 只部署该子目录下的 Worker。
4.  点击 **Save and Deploy**。Cloudflare 会开始第一次部署。

#### 第四步：配置 Worker 的环境变量与存储

首次部署完成后，我们需要为 Worker 添加必要的配置。

1.  在项目页面，点击 **Settings** 标签页。
2.  **设置 API 密钥**:
    -   选择子菜单中的 **Variables**。
    -   在 **Secret Variables** 部分，点击 **Add secret variable**。
    -   **Variable name**: `API_TOKEN`
    -   **Value**: 输入一个您自己创建的、足够复杂的安全密钥。**请务必保存好这个值**，前端配置时需要用到。
    -   点击 **Save**。

#### 第五步：重新部署以应用配置

为了让刚才的配置生效，需要触发一次新的部署。

1.  返回到项目的 **Deployments** 标签页。
2.  找到最新的那条部署记录，点击右侧的 **...** 菜单，选择 **Retry deployment**。

部署成功后，在项目主页即可找到您的 Worker 访问 URL。

---

### 方法二：手动复制粘贴代码

此方法无需关联 Git 仓库，但每次更新代码都需要手动操作。

#### 第一步：获取 Worker 代码

1.  首先，将本项目克隆到您的本地电脑，以便获取 Worker 的源代码。
    ```bash
    git clone https://github.com/your-username/excalidraw-complete.git
    # 注意：请将 a-username/excalidraw-complete.git 替换为实际的项目仓库地址
    ```
2.  在您的电脑上找到并打开 `cloudflare-worker/index.js` 文件，将其中的所有代码复制到剪贴板。我们稍后会用到它。

#### 第二步：在 Cloudflare Dashboard 中创建 Worker

1.  登录到您的 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  在左侧导航栏中，选择 **Workers & Pages**。
3.  点击 **Create application**，然后选择 **Create Worker**。
4.  为您的 Worker 指定一个唯一的名称（例如 `my-excalidraw-backend`），然后点击 **Deploy**。

#### 第三步：粘贴并部署代码

1.  创建成功后，您会进入 Worker 的管理页面。点击 **Edit code**。
2.  在打开的代码编辑器中，删除所有的默认 "Hello World" 代码。
3.  将您在 **第一步** 中从 `index.js` 文件复制的代码，完整地粘贴到编辑器中。
4.  点击编辑器右上角的 **Save and Deploy** 按钮。

#### 第四步：设置 API 密钥 (Secret Variable)

1.  返回到您的 Worker 管理页面 (如果当前在代码编辑器，可以点击左上角 Worker 名称返回)。
2.  选择 **Settings** 标签页，然后点击子菜单中的 **Variables**。
3.  在 **Secret Variables** 部分，点击 **Add secret variable**。
4.  按如下方式填写：
    -   **Variable name**: `API_TOKEN`
    -   **Value**: 输入一个您自己创建的、足够复杂的安全密钥（例如，可以使用密码生成器创建一个长随机字符串）。**请务必保存好这个值，前端配置时需要用到。**
5.  点击 **Save**。

#### 第五步：配置持久化存储 (Durable Objects)

这是最关键的一步，它让您的 Worker 能够保存数据。

1.  在 Worker 的 **Settings** 标签页，点击子菜单中的 **Durable Objects**。
2.  点击 **Add binding**。
3.  按如下方式创建第一个绑定：
    -   **Binding name**: `CANVAS_OBJECT`
    -   **Durable Object class name**: `CanvasObject`
4.  再次点击 **Add binding**。
5.  按如下方式创建第二个绑定：
    -   **Binding name**: `INDEX_OBJECT`
    -   **Durable Object class name**: `IndexObject`
6.  完成后，页面上应该有两个 Durable Object 绑定。设置会自动保存。

#### 第六步：最终确认

设置完变量和存储后，建议返回代码编辑器，再次点击 **Save and Deploy**，以确保所有配置都已生效。

部署成功后，在 Worker 的主页面可以找到您的 Worker 的访问URL，格式为 `https://<your-worker-name>.<your-subdomain>.workers.dev`。

---

## 配置 Excalidraw 前端

现在，将您部署好的后端服务配置到 Excalidraw 前端：

1.  打开 Excalidraw 应用。
2.  进入设置或数据源配置界面。
3.  选择 "Cloudflare KV" 作为存储类型。
4.  **API 地址**: 填入您在第六步获取的 Worker URL。
5.  **API 令牌**: 填入您在第四步中设置的 `API_TOKEN` 值。
6.  保存配置。

恭喜！您的 Excalidraw 应用现在拥有了一个完全由您掌控、基于 Cloudflare 的强大后端。
