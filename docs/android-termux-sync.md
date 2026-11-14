# Android (Termux) 自部署与本地代码同步指南

本文说明如何在非 Root Android 设备上通过 Termux 原生运行 `jm-view-server`，实现以下两种使用方式，并提供从电脑本地仓库直接构建安装包并同步更新到手机的完整流程：

- **手机离线自启动**：在手机本地直接启动 Web 服务（默认 `8080` 端口），通过手机浏览器访问 `http://127.0.0.1:8080` 浏览 `/storage/emulated/0` 下的全部目录（包括 `.` 开头的隐藏目录，不受系统文件选择器协议限制）。
- **局域网反向共享**：手机作为服务端，同一局域网下的电脑或其他设备访问 `http://<PHONE_LAN_IP>:8080`（例如 `http://192.0.2.10:8080`）直接阅读或管理手机内文件。

---

## 一、首次环境初始化（每台手机执行一次）

### 1.1 安装 Termux 并开启 ADB 调试

1. 在 Android 设备上安装 **Termux**（建议从 Termux 官方 GitHub Releases 或 F-Droid 安装；如需桌面一键快捷方式，可搭配 **Termux:Widget** 或内置微件能力）。
2. 在手机「系统设置 → 开发者选项」中开启 **USB 调试**（或无线调试），数据线连接电脑后执行：

```bash
adb devices
```

确认终端列出目标设备且状态为 `device`。

### 1.2 通过 ADB 授予存储、通知与后台保活权限

在电脑终端执行以下命令，完成文件访问与 ADB 层后台运行基础授权：

```bash
# 允许 Termux 管理设备上的全部共享存储（涵盖 /storage/emulated/0 及隐藏目录）
adb shell appops set com.termux MANAGE_EXTERNAL_STORAGE allow

# 授予后台常驻通知权限（Android 13+）
adb shell pm grant com.termux android.permission.POST_NOTIFICATIONS

# 加入系统 Doze 电池优化白名单
adb shell dumpsys deviceidle whitelist +com.termux

# 授予悬浮窗（上层显示）与后台运行权限，支持后台保活与微件拉起
adb shell appops set com.termux SYSTEM_ALERT_WINDOW allow
adb shell appops set com.termux RUN_IN_BACKGROUND allow
adb shell appops set com.termux RUN_ANY_IN_BACKGROUND allow
```

> **后台保活提示（关键，请务必在手机系统界面完成以下两步）**：
> 1. **关闭后台快速冻结**：部分 Android 定制系统的后台冻结机制（`fast_freezer`）会在切到浏览器约 5～10 秒后无视前台通知直接挂起 Termux，导致浏览时刷新几次就出现 `ERR_FAILED` 断连。请在手机「设置 → 应用 → Termux → 电池 / 耗电管理」（或「设置 → 电池 → 后台耗电管理」）中设为 **允许后台高耗电 / 无限制**。
> 2. **锁定最近任务卡片**：在系统多任务界面为 Termux 卡片开启**锁定**；不要上滑划掉 Termux 卡片，部分系统的单项清理（`single-cleaner`）会对划掉的应用直接执行 `FORCE STOP`，连带结束后台 Python 服务进程。

### 1.3 在 Termux 中安装依赖

优先通过 `pkg` 安装 Termux 官方预编译二进制包，避免在手机端现场编译 C/Rust 扩展，再通过 `pip` 安装纯 Python 依赖。在手机端 Termux 终端中执行：

```bash
pkg update -y && pkg install -y python python-pip python-pillow python-cryptography python-psutil termux-api
pip install --no-cache-dir "flask>=3" "Send2Trash>=1.8.3,<2" jmcomic
```

### 1.4 配置快捷控制与同步命令

在手机端 Termux 中创建 `$PREFIX/bin/jms-start`、`$PREFIX/bin/jms-stop`、`$PREFIX/bin/jms-status` 和 `$PREFIX/bin/jms-sync` 四个脚本，便于后台管理服务和接收电脑同步包：

```bash
cat <<'EOF' > "$PREFIX/bin/jms-start"
#!/data/data/com.termux/files/usr/bin/bash
set -e

ROOT_DIR="/storage/emulated/0"
PORT="${JMV_PORT:-8080}"
STATE_DIR="$HOME/.jm_view_server"
PID_FILE="$STATE_DIR/termux-jms.pid"
LOG_FILE="$STATE_DIR/termux-jms.log"
OPEN_BROWSER=1

for arg in "$@"; do
  if [ "$arg" = "--no-open" ]; then
    OPEN_BROWSER=0
  elif [ -d "$arg" ]; then
    ROOT_DIR="$arg"
  fi
done

open_local_url() {
  if command -v termux-open-url >/dev/null 2>&1; then
    termux-open-url "$1" >/dev/null 2>&1 && return 0
  fi
  /system/bin/am start -a android.intent.action.VIEW -d "$1" >/dev/null 2>&1 || true
}

mkdir -p "$STATE_DIR"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "jms 已在运行 (PID: $OLD_PID)"
    if [ "$OPEN_BROWSER" = "1" ]; then
      open_local_url "http://127.0.0.1:$PORT"
    fi
    exit 0
  fi
fi

termux-wake-lock >/dev/null 2>&1 || true
nohup jms "$ROOT_DIR" -p "$PORT" --no-reload >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 2
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "jms 已启动 (PID: $NEW_PID, 端口: $PORT)"
  echo "本机访问: http://127.0.0.1:$PORT"
  grep "局域网访问" "$LOG_FILE" || true
  if [ "$OPEN_BROWSER" = "1" ]; then
    open_local_url "http://127.0.0.1:$PORT"
  fi
else
  echo "启动失败，请查看日志: $LOG_FILE"
  tail -n 30 "$LOG_FILE" || true
  exit 1
fi
EOF

cat <<'EOF' > "$PREFIX/bin/jms-stop"
#!/data/data/com.termux/files/usr/bin/bash
STATE_DIR="$HOME/.jm_view_server"
PID_FILE="$STATE_DIR/termux-jms.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    echo "已停止 jms (PID: $PID)"
  fi
  rm -f "$PID_FILE"
fi

pkill -f "jm_view_server" >/dev/null 2>&1 || true
termux-wake-unlock >/dev/null 2>&1 || true
EOF

cat <<'EOF' > "$PREFIX/bin/jms-status"
#!/data/data/com.termux/files/usr/bin/bash
STATE_DIR="$HOME/.jm_view_server"
PID_FILE="$STATE_DIR/termux-jms.pid"
LOG_FILE="$STATE_DIR/termux-jms.log"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "状态: 运行中 (PID: $PID)"
    [ -f "$LOG_FILE" ] && grep -E "本机访问|局域网访问" "$LOG_FILE" || true
    exit 0
  fi
fi

echo "状态: 未运行"
EOF

cat <<'EOF' > "$PREFIX/bin/jms-sync"
#!/data/data/com.termux/files/usr/bin/bash
set -e
shopt -s nullglob

SYNC_DIR="/sdcard/Download/.jms_sync"
wheels=("$SYNC_DIR"/jm_view_server-*.whl)

if [ ${#wheels[@]} -eq 0 ]; then
  echo "未在 $SYNC_DIR 中找到 jm_view_server-*.whl，请先从电脑端打包推送。"
  exit 1
fi

WHEEL_FILE="${wheels[0]}"
for f in "${wheels[@]}"; do
  if [ "$f" -nt "$WHEEL_FILE" ]; then
    WHEEL_FILE="$f"
  fi
done

echo "准备覆盖安装: $(basename "$WHEEL_FILE")"
python -m pip install --no-deps --force-reinstall "$WHEEL_FILE"
rm -f "$SYNC_DIR"/jm_view_server-*.whl

jms-stop || true
jms-start --no-open
EOF

chmod +x "$PREFIX/bin/jms-start" "$PREFIX/bin/jms-stop" "$PREFIX/bin/jms-status" "$PREFIX/bin/jms-sync"
```

可选配置桌面快捷入口（`~/.shortcuts/`），使用无扩展名脚本名称并通过桌面的 **1×1 Termux 快捷方式**添加到主屏（还可拖入同一个桌面文件夹收纳）：

```bash
mkdir -p ~/.shortcuts ~/.shortcuts/tasks
chmod 700 ~/.shortcuts ~/.shortcuts/tasks

printf '#!/data/data/com.termux/files/usr/bin/bash\njms-start >/dev/null 2>&1 || true\n' > ~/.shortcuts/JM看本
printf '#!/data/data/com.termux/files/usr/bin/bash\njms-stop\n' > ~/.shortcuts/tasks/停止JM
printf '#!/data/data/com.termux/files/usr/bin/bash\njms-sync\nsleep 1.5\n' > ~/.shortcuts/同步JM
printf '#!/data/data/com.termux/files/usr/bin/bash\njms-status\nread -r -t 5 -p "5 秒后自动关闭（或按回车立即退出）..." || true\n' > ~/.shortcuts/查看地址

chmod 700 ~/.shortcuts/JM看本 ~/.shortcuts/tasks/停止JM ~/.shortcuts/同步JM ~/.shortcuts/查看地址
```

> 说明：
> - `停止JM` 放在 `~/.shortcuts/tasks/` 下可后台静默执行；`JM看本` 需要拉起本地浏览器，受 Android 后台弹窗限制影响保留在 `~/.shortcuts/`。
> - 若使用单独的 **Termux:Widget（F-Droid / GitHub 版）** 且支持自定义图标，可额外在 `~/.shortcuts/icons/` 放置同名 `.png` 图标；部分内置版 Termux（如应用商店构建）不支持解析 `icons/` 目录且会将其直接列为文本条目，此情形请勿创建 `icons/` 目录。

---

## 二、从电脑本地仓库同步代码到手机

每当在电脑本地修改了 `jm-view-server` 代码或前端资源，可按以下流程直接将本地未发布的改动打包成 `.whl` 覆盖安装到手机，无需等待 PyPI 发版。

### 方式 A：标准两步同步（推荐，通用稳定）

**步骤 1（电脑端）**：在 `jm-view-server` 仓库根目录下打包纯本包 wheel 并推送到手机中转目录 `/sdcard/Download/.jms_sync/`，完成后清理本地构建目录：

- **Windows (PowerShell)**：

```powershell
python -B -m pip wheel --no-deps --no-build-isolation -w dist . ; adb shell mkdir -p /sdcard/Download/.jms_sync ; adb push dist/*.whl /sdcard/Download/.jms_sync/ ; Remove-Item -Recurse -Force dist, build -ErrorAction SilentlyContinue
```

- **macOS / Linux**：

```bash
python3 -B -m pip wheel --no-deps --no-build-isolation -w dist . && adb shell mkdir -p /sdcard/Download/.jms_sync && adb push dist/*.whl /sdcard/Download/.jms_sync/ && rm -rf dist build
```

> 说明：使用 `--no-deps --no-build-isolation` 仅构建 `jm-view-server` 自身，跳过第三方依赖联网下载，耗时通常在 2 秒以内。

**步骤 2（手机端）**：在 Termux 中执行以下命令（或点击桌面快捷方式 `同步JM`），自动完成覆盖安装、清理中转包并重启服务：

```bash
jms-sync
```

### 方式 B：电脑端单命令触发全自动同步（进阶）

如果希望全程无需触碰手机屏幕，可启用 Termux 外部命令接口，在电脑推送完成后直接通过 `adb shell am startservice` 调用 `jms-sync`（注：`RunCommandService` 仅 GitHub Releases / F-Droid 等支持外部执行接口的 Termux 构建提供；若返回 `Error: Not found; no service started.` 或被系统策略拦截，常见于部分商店精简版本，请回退使用方式 A）：

1. 在 Termux 中启用外部应用调用（一次性配置）：

```bash
mkdir -p ~/.termux
grep -q '^allow-external-apps' ~/.termux/termux.properties 2>/dev/null \
  && sed -i 's/^allow-external-apps.*/allow-external-apps = true/' ~/.termux/termux.properties \
  || echo 'allow-external-apps = true' >> ~/.termux/termux.properties
termux-reload-settings
```

2. 在手机开发者选项中允许通过 ADB 调度外部后台服务（部分定制系统默认拦截时请改用方式 A）。
3. 在电脑仓库根目录推送完成后附加执行：

```bash
adb shell am startservice \
  --user 0 \
  -n com.termux/com.termux.app.RunCommandService \
  -a com.termux.RUN_COMMAND \
  --es com.termux.RUN_COMMAND_PATH "/data/data/com.termux/files/usr/bin/jms-sync" \
  --ez com.termux.RUN_COMMAND_BACKGROUND true
```

---

## 三、常见问题与维护说明

1. **在 `setup.py` 中新增了纯 Python 第三方依赖怎么办？**
   `jms-sync` 使用 `--no-deps` 仅覆盖安装 `jm-view-server` 本体。若改动新增了第三方库依赖，只需在手机 Termux 终端中补充执行一次 `pip install <package>`。
2. **切后台刷新几下变成 `ERR_FAILED`，或局域网访问 `http://<PHONE_LAN_IP>:8080` 超时 / 连接重置？**
   - **几秒内即断连（常见原因）**：系统快速冻结（`fast_freezer`）挂起了 Termux，或用户从多任务界面上滑划掉了 Termux 卡片触发强行停止。请确认手机系统设置中 Termux 已改为**允许后台高耗电 / 无限制**并**锁定多任务卡片**，再重新运行 `jms-start`。
   - **仅局域网访问不通**：确认手机和电脑连接在同一路由器 Wi-Fi 下，且路由器未开启 AP 隔离、设备未开启代理软件的全局接管规则。
3. **在手机端网页删除文件会移到哪里？**
   - 由于 Android 共享存储（FUSE）没有桌面系统标准回收站接口，后端检测到 `Send2Trash` 不可用时，会自动把被删除的文件/目录移入 `/storage/emulated/0/.jm_trash/` 并自动处理重名冲突，避免意外永久删除。
4. **手动检查运行日志**
   - 服务运行日志保存在 `~/.jm_view_server/termux-jms.log`，可通过 `tail -n 50 ~/.jm_view_server/termux-jms.log` 查看启动横幅、报错或访问记录。
