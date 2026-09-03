# AI学习诊断 - Android 移动端

基于 WebView 的 Android 原生应用，提供与网页版一致的学习体验，同时支持手机端的各种原生能力。

## 功能特性

- 📱 **移动端适配** - 完美适配手机屏幕，操作便捷
- 🔄 **下拉刷新** - 下拉即可刷新页面
- 📸 **拍照上传** - 支持调用相机拍照录题
- 🔔 **系统通知** - 学习提醒推送（可扩展）
- ↩️ **返回键导航** - 按返回键回到上一页
- 🚪 **退出确认** - 防止误触退出
- 💾 **数据同步** - 与网页版、桌面端数据完全同步
- 🔒 **安全加固** - HTTPS加密、安全配置

## 系统要求

- Android 7.0 (API 24) 及以上
- 至少 2GB 内存
- 至少 100MB 可用存储空间
- 稳定的网络连接

## 构建方法

### 前置要求

1. 安装 [Android Studio](https://developer.android.com/studio) 或 Android SDK
2. 配置 JDK 17
3. 配置 ANDROID_HOME 环境变量

### 使用 Android Studio 构建

1. 打开 Android Studio
2. 选择 "Open an Existing Project"
3. 选择 `android/` 目录
4. 等待 Gradle 同步完成
5. 菜单: `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
6. 生成的 APK 位于: `app/build/outputs/apk/release/`

### 使用命令行构建

```bash
cd android

# Windows (使用 gradlew.bat)
gradlew.bat assembleRelease

# Mac/Linux
./gradlew assembleRelease

# 输出位置: app/build/outputs/apk/release/app-release.apk
```

### 生成 debug 包 (快速测试)

```bash
gradlew.bat assembleDebug
# 输出: app/build/outputs/apk/debug/app-debug.apk
```

## 配置服务器地址

修改 `app/build.gradle.kts` 中的地址:

```kotlin
buildConfigField("String", "BASE_URL", "\"https://your-domain.com/\"")
```

修改后需要重新构建。

## 项目结构

```
android/
├── app/
│   ├── build.gradle.kts              # 应用级构建配置
│   ├── proguard-rules.pro            # 代码混淆规则
│   └── src/main/
│       ├── AndroidManifest.xml       # 应用清单
│       ├── java/com/ai/learning/diagnostic/
│       │   ├── MainActivity.kt       # 主Activity (WebView容器)
│       │   └── WebAppInterface.kt    # JS与原生交互接口
│       └── res/
│           ├── layout/
│           │   └── activity_main.xml # 主布局
│           ├── values/
│           │   ├── strings.xml       # 字符串资源
│           │   ├── colors.xml        # 颜色资源
│           │   └── themes.xml        # 主题样式
│           ├── xml/
│           │   └── network_security_config.xml  # 网络安全配置
│           └── mipmap-*/              # 应用图标 (需自行准备)
├── build.gradle.kts                   # 项目级构建配置
├── settings.gradle.kts                # 项目设置
├── gradle.properties                  # Gradle属性
└── README.md                          # 本文件
```

## 应用图标

需要准备以下图标文件 (放在 `app/src/main/res/` 下):

| 目录 | 文件 | 尺寸 | 说明 |
|------|------|------|------|
| `mipmap-mdpi/` | `ic_launcher.png` | 48x48 | 中等密度 |
| `mipmap-hdpi/` | `ic_launcher.png` | 72x72 | 高密度 |
| `mipmap-xhdpi/` | `ic_launcher.png` | 96x96 | 超高密度 |
| `mipmap-xxhdpi/` | `ic_launcher.png` | 144x144 | 超超高密度 |
| `mipmap-xxxhdpi/` | `ic_launcher.png` | 192x192 | 超超超高密度 |
| `mipmap-anydpi-v26/` | `ic_launcher.xml` | - | 自适应图标 |

### 快速生成图标

使用 Android Studio 的 Image Asset Studio:
1. 右键 `res` → New → Image Asset
2. 选择 Launcher Icons
3. 上传你的图标源文件 (推荐 1024x1024 PNG)
4. 自动生成所有尺寸

## 签名发布

Release版本需要签名才能安装到用户设备上。

### 生成签名密钥

```bash
keytool -genkeypair -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias alias_name
```

### 配置签名

在 `app/build.gradle.kts` 中添加签名配置:

```kotlin
signingConfigs {
    create("release") {
        storeFile = file("my-release-key.jks")
        storePassword = "密钥库密码"
        keyAlias = "alias_name"
        keyPassword = "密钥密码"
    }
}

buildTypes {
    release {
        signingConfig = signingConfigs.getByName("release")
        // ...
    }
}
```

## JavaScript 接口

网页端可以通过 `window.AndroidApp` 调用原生功能:

```javascript
// 判断是否在App内
if (window.AndroidApp && window.AndroidApp.isApp()) {
    console.log('运行在Android App内');
}

// 显示原生Toast
window.AndroidApp.showToast('提示信息');

// 显示原生对话框
window.AndroidApp.showAlert('标题', '内容');

// 获取版本号
var version = window.AndroidApp.getAppVersion();

// 获取平台
var platform = window.AndroidApp.getPlatform();
```

## 常见问题

**Q: 安装时提示"未知来源"怎么办？**
A: 首次安装需要在系统设置中允许安装未知来源应用。

**Q: 拍照功能不能用？**
A: 请确保已授予相机权限，可以在系统设置 → 应用 → 权限中检查。

**Q: 网页和App数据同步吗？**
A: 完全同步。App本质上是一个专用浏览器，数据存储在服务器上。

**Q: 可以上架应用商店吗？**
A: 可以，但需要先准备好应用商店要求的资料（隐私政策、截图、描述等），并完成正式签名。

## 许可证

本软件为内部使用版本，版权所有。
