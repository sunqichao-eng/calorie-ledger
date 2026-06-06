# 热量账本手机安装版

这是一个可安装的 PWA。部署到 HTTPS 网址后，手机浏览器可以把它安装到桌面。

## 本地启动

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
npm start
```

打开 `http://localhost:3000`。

## 手机安装

- Android Chrome: 打开部署后的 HTTPS 网址，点击浏览器的安装提示。
- iPhone Safari: 打开部署后的 HTTPS 网址，通过分享菜单添加到主屏幕。

## AI 视觉识别

前端会调用同域名的 `/api/analyze-meal`。生产环境需要部署 `server.js`，并在服务器环境变量里设置 `OPENAI_API_KEY`。
