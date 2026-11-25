export default {
  closeProjection: {
    title: "关闭投影？",
    message: "投影正在进行（圣经/赞美诗/视频/网站）。现在关闭吗？按 Enter 关闭。",
    confirm: "关闭",
  },
  auth: {
    wrongPassword: "密码错误",
    reauthFailed: "无法确认您的身份",
    accountDeleted: "账户已删除",
    passwordRequired: "请输入密码以确认",
    sessionExpired: "会话已过期 — 请重新登录以删除账户",
    deleteFailed: "无法删除账户",
  },
  "palcoOutputs": {
    "title": "舞台电视",
    "empty": "没有已连接舞台的电视。请打开舞台",
    "onHold": "{slot} · 暂停"
  },
  "obsOutputs": {
    "detecting": "正在检测并刷新 OBS 连接…",
    "active": "远程连接",
    "activateHint": "请在 设置 → 直播 中开始连接以在此使用。",
    "title": "OBS 连接",
    "activeConnections": "活动连接：{count}"
  },
  "floating": {
    "closeTitle": "关闭 {title}？",
    "closeMessage": "停止此功能并关闭其投影？"
  },
  "updates": {
    checkFailed: "检查更新失败",
    downloadFailedRetry: "无法下载更新。请稍后重试。",
    downloadFailedConnection: "无法下载更新。请检查网络连接。",
    verifyFailed: "无法验证更新。请稍后重试。",
    updateFailed: "更新失败。请稍后重试。",
    "downloadMacInstaller": "下载 macOS 安装程序",
    "manualMacInstructions": "在 macOS 上，请手动安装此更新。下载下方安装程序后，退出 LouvorJA，打开 DMG 并将应用拖入「应用程序」文件夹以替换旧版本。您的数据和偏好设置将保留。",
    "version": "版本 {version}",
    "noReleaseNotes": "暂无更新说明。",
    "download": "下载更新",
    "installRestart": "安装并重启",
    "later": "稍后",
    "available": "有可用版本 {version}",
    "update": "更新",
    "dismiss": "忽略"
  },
  "windowControls": {
    "close": "关闭",
    "minimize": "最小化",
    "maximize": "最大化"
  },
  "a11y": {
    "mainNav": "主导航"
  },
  "apiOffline": {
    "message": "无法连接服务 — 请检查网络",
    "retrying": "正在尝试重新连接..."
  },
  "projection": {
    liturgy: "投影",
    "minimizeProjection": "最小化投影",
    "restoreProjection": "恢复投影",
    "confirmClose": "投影正在进行中。关闭此窗口将停止音乐。确定离开吗？"
  },
  "app": {
    "name": "Louvor JA",
    "nameLouvor": "Louvor",
    "nameJa": "JA"
  },
  "common": {
    "close": "关闭",
    "comingSoon": "即将推出",
    "openFolder": "打开文件夹",
    "addToPlaylist": "添加到播放列表",
    "suggestFix": "建议修正歌词/时间轴",
    "cancel": "取消",
    "copied": "已复制！"
  },
  "independentProjection": {
    "title": "独立投影",
    "enableHint": "请在「屏幕」中开启以使用",
    "unavailable": "仅在连接扩展显示器时可用",
    "hint": "选择一台显示器。此功能将显示在其投影内容之上；其他显示器保持不变。",
    "monitor": "显示器 {index}",
    "activeOn": "显示器 {index} 上的独立投影",
    "stop": "停止独立投影",
    "sharedOn": "显示器 {index} 上的共享投影",
    "modeLabel": "投影模式",
    "status": {
      "stop": "停止",
      "overlay": "叠加于：",
      "share": "共享于：",
      "monitor": "显示器 {index}"
    },
    "mode": {
      "overlay": "叠加",
      "share": "共享"
    },
    "hintShare": "选择一台显示器。其屏幕将与现有投影内容对半分屏；若一侧退出，另一侧将重新占据整个屏幕。"
  },
  "monitors": {
    "wiredTitle": "有线连接",
    "selectScreens": "选择屏幕",
    "identify": "检测屏幕",
    "hint": "请勾选需要投影的显示器。",
    "loading": "正在检测显示器…",
    "empty": "未找到扩展显示器。",
    "primary": "主显示器",
    "returnScreen": "返回屏幕",
    "selectedCount": "已选择 {count} 台",
    "projectNeedsScreens": "请至少选择一个扩展屏幕进行投影"
  },
  "popupCount": {
    "label": "屏幕",
    "tooltip": "选择投影屏幕"
  },
  "popupControls": {
    "closeAll": "关闭所有屏幕"
  },
  "uiZoom": {
    "label": "页面缩放",
    "zoomIn": "放大",
    "zoomOut": "缩小"
  },
  "nav": {
    "home": "首页",
    "albums": "媒体中心",
    "community": "社区",
    "liturgy": "崇拜程序",
    "bible": "圣经",
    "utilities": "工具",
    "settings": "设置",
    "history": {
      "label": "导航历史",
      "back": "后退",
      "forward": "前进",
      "goTo": "前往 {label}"
    },
    "historyDetail": {
      "player": "播放器",
      "editor": "编辑器"
    }
  },
  "connectedDevices": {
    "title": "已连接设备",
    "remote": "遥控器",
    "speaker": "讲道翻页器",
    "monitors": "显示器共享",
    "none": "无连接",
    "monitorsInUse": "{device}（{host}）· {n} 台显示器",
    "palco": "舞台（电视）",
    "palcoTv": "{name} · {ip}",
    "transmission": "Broadcasts (OBS/browsers)",
    "transmissionGroup": "{connection} · {page} · {tabs}",
    "tabs": "1 个标签页 | {n} 个标签页",
    "inObs": "OBS 中 {n} 个",
    "inBrowser": "浏览器中 {n} 个",
    "and": " 和 ",
    "pages": {
      "espelho": "镜像",
      "retorno": "舞台返看",
      "legenda": "字幕",
      "other": "其他页面"
    }
  },
  "minimize": {
    "playlistCount": "{n} 个播放列表",
    "pageNumber": "第 {n} 页",
    "bar": "已最小化的页面",
    "close": "关闭 {title}",
    "page": "最小化页面",
    "search": "搜索：{q}"
  },
  "sync": {
    "downloadQueue": {
      "title": "下载",
      "clearFinished": "清除已完成",
      "retry": "重试",
      "cancel": "取消"
    }
  },
  "sljaMigration": {
    "title": "将导入的 {count} 首赞美诗上传到您的账户？",
    "message": "您在退出登录时导入了 .slja 文件。可将它们上传到您的账户（仅单一副本，绝不重复），并在任何设备上使用。",
    "confirm": "上传到账户",
    "cancel": "仅保留在此设备"
  },
  "download": {
    "indicatorTitle": "后台下载：{done}/{total}（{percent}%）",
    "indicatorCounts": "{total} 项中 {done} 项已完成",
    "indicatorIdle": "正在准备下载…"
  },
  "settings": {
    "appearance": {
      "changeTheme": "更改主题"
    },
    "general": {
      "checkUpdate": "检查更新",
      "checking": "正在检查…",
      "updateAvailable": "有可用更新",
      "updateDesktopOnly": "仅限桌面版",
      "updateError": "更新错误",
      "updateHint": "重启后生效",
      "updateNotAvailable": "暂无更新",
      "updateTitle": "应用更新"
    },
    "stage": {
      "title": "自定义舞台",
      "scopeGlobal": "默认（全局）",
      "scope": {
        "hymns": "赞美诗",
        "bible": "圣经",
        "liturgy": "崇拜程序",
        "timer": "计时器",
        "random": "随机抽取",
        "clock": "时钟",
        "countdown": "倒计时"
      },
      "inheritingHint": "此模块继承全局默认值。在此处的任何更改都会创建自己的自定义设置。",
      "backgroundColor": "背景颜色",
      "backgroundImage": "背景图片",
      "officialBackground": "官方背景",
      "officialGalleryHint": "点击应用；再次点击移除。",
      "selectImage": "点击选择图片",
      "removeImage": "移除图片",
      "changeImage": "更改图片",
      "textColor": "文字颜色",
      "fontSize": "字体大小",
      "fontWeight": "字体粗细",
      "weightNormal": "常规",
      "weightMedium": "中等",
      "weightLightPlus": "细体+",
      "weightStrong": "粗体",
      "bibleAppearance": "圣经 — 独立外观",
      "bibleTextColor": "文字颜色（圣经）",
      "bibleFontSize": "字体大小（圣经）",
      "bibleFontWeight": "字体粗细（圣经）",
      "showBibleVersion": "在页脚显示圣经译本",
      "footerRefColor": "参考经文颜色（页脚）",
      "shadowAndBox": "阴影和衬底",
      "textShadow": "文字阴影",
      "shadowIntensity": "阴影强度",
      "shadowBlur": "阴影扩散",
      "textBox": "歌词后的衬底",
      "boxOpacity": "衬底不透明度",
      "boxBorder": "衬底边框",
      "alignment": "文字对齐",
      "horizontal": "水平",
      "vertical": "垂直",
      "alignLeft": "左",
      "alignCenter": "居中",
      "alignRight": "右",
      "alignTop": "上",
      "alignMiddle": "垂直居中",
      "alignBottom": "下",
      "reset": "重置",
      "resetConfirm": "将此模块重置为默认值？"
    },
    "placeholder": {
      "general": "常规应用偏好设置即将推出。",
      "media": "音频、视频和播放器设置即将推出。",
      "projection": "投影和屏幕设置即将推出。"
    }
  }
}
