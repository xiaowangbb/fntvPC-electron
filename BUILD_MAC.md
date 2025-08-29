# 在Mac上构建fntv-electron

本指南将帮助你在Mac上构建fntv-electron桌面客户端。

## 系统要求

- macOS 10.15 (Catalina) 或更高版本
- Node.js 16.0 或更高版本
- npm 8.0 或更高版本

## 构建步骤

### 1. 克隆项目

```bash
git clone git@github.com:xiaowangbb/fntvPC-electron.git
cd fntvPC-electron
```

### 2. 安装依赖

```bash
npm install
```

### 3. 构建TypeScript代码

```bash
npm run build:ts
```

### 4. 构建Mac版本

```bash
npm run build:mac
```

## 构建输出

构建完成后，你可以在 `release/` 目录中找到以下文件：

- `FNMedia_1.6.3_mac_arm64.dmg` - Mac ARM64版本的DMG安装包
- `FNMedia_1.6.3_mac_arm64.dmg.blockmap` - 增量更新用的块映射文件
- `mac-arm64/` - 包含应用程序包的目录

## 安装说明

1. 双击 `FNMedia_1.6.3_mac_arm64.dmg` 文件
2. 将 `飞牛影视.app` 拖拽到 `Applications` 文件夹
3. 从启动台或应用程序文件夹启动应用

## 注意事项

- 由于没有Apple开发者证书，应用可能无法通过Gatekeeper验证
- 首次运行时，需要在"系统偏好设置 > 安全性与隐私"中允许运行
- 应用支持M1/M2芯片的ARM64架构

## 故障排除

### 构建失败

如果构建失败，请检查：

1. Node.js版本是否兼容
2. 依赖是否正确安装
3. 是否有足够的磁盘空间

### 运行时错误

如果应用无法启动：

1. 检查系统权限设置
2. 查看控制台日志
3. 确保系统版本兼容

## 技术细节

- 使用Electron 36.2.1构建
- 支持ARM64架构（Apple Silicon）
- 包含完整的Mac应用包结构
- 使用DMG格式进行分发

## 许可证

本项目采用 [GPL3.0 许可证](LICENSE)
