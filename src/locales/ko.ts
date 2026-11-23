export default {
  closeProjection: {
    title: "투영을 닫을까요?",
    message: "투영이 활성 상태입니다(성경/찬송가/동영상/사이트). 지금 닫을까요? Enter 키로 닫습니다.",
    confirm: "닫기",
  },
  auth: {
    wrongPassword: '비밀번호가 올바르지 않습니다',
    reauthFailed: '신원을 확인할 수 없습니다',
    accountDeleted: '계정이 삭제되었습니다',
    passwordRequired: '확인하려면 비밀번호를 입력하세요',
    sessionExpired: '세션이 만료되었습니다 — 삭제하려면 다시 로그인하세요',
    deleteFailed: '계정을 삭제할 수 없습니다',
  },
  "palcoOutputs": {
    "title": "Stage TVs",
    "empty": "No TV with Stage connected. Open Stage",
    "onHold": "{slot} · on hold"
  },
  "obsOutputs": {
    "detecting": "Detecting and refreshing OBS connections…",
    "active": "Remote connections",
    "activateHint": "Start a connection in Settings → Broadcast to use it here.",
    "title": "OBS connections",
    "activeConnections": "Active connections: {count}"
  },
  "floating": {
    "closeTitle": "Close {title}?",
    "closeMessage": "Stop this feature and close its projection?"
  },
  "updates": {
    checkFailed: "업데이트 확인 실패",
    downloadFailedRetry: "업데이트를 다운로드할 수 없습니다. 나중에 다시 시도하세요.",
    downloadFailedConnection: "업데이트를 다운로드할 수 없습니다. 인터넷 연결을 확인하세요.",
    verifyFailed: "업데이트를 확인할 수 없습니다. 나중에 다시 시도하세요.",
    updateFailed: "업데이트 실패. 나중에 다시 시도하세요.",
    "downloadMacInstaller": "Download macOS installer",
    "manualMacInstructions": "On macOS, install this update manually. Download the installer below, quit LouvorJA, open the DMG and drag the app to Applications, replacing the previous version. Your data and preferences will be kept.",
    "version": "버전 {version}",
    "noReleaseNotes": "릴리스 노트가 없습니다.",
    "download": "업데이트 다운로드",
    "installRestart": "설치 후 다시 시작",
    "later": "나중에",
    "available": "버전 {version} 사용 가능",
    "update": "업데이트",
    "dismiss": "닫기"
  },
  "windowControls": {
    "close": "Close",
    "minimize": "Minimize",
    "maximize": "Maximize"
  },
  "a11y": {
    "mainNav": "Main navigation"
  },
  "apiOffline": {
    "message": "No connection to the service — check your internet",
    "retrying": "Trying to reconnect..."
  },
  "projection": {
    liturgy: "투영",
    "minimizeProjection": "Minimize projection",
    "restoreProjection": "Restore projection",
    "confirmClose": "Projection is in progress. Closing this window stops the music. Really leave?"
  },
  "app": {
    "name": "Louvor JA",
    "nameLouvor": "Louvor",
    "nameJa": "JA"
  },
  "common": {
    "close": "Close",
    "comingSoon": "Coming soon",
    "openFolder": "Open folder",
    "addToPlaylist": "Add to playlist",
    "suggestFix": "Suggest lyric/timing fix",
    "cancel": "Cancel",
    "copied": "Copied!"
  },
  "independentProjection": {
    "title": "Independent projection",
    "enableHint": "Turn on in Screens to use",
    "unavailable": "Only available with extended monitors connected",
    "hint": "Pick one monitor. This feature appears on top of whatever is projected there; the other monitors stay the same.",
    "monitor": "Monitor {index}",
    "activeOn": "Independent projection on monitor {index}",
    "stop": "Stop independent projection",
    "sharedOn": "Shared projection on monitor {index}",
    "modeLabel": "Projection mode",
    "status": {
      "stop": "Stop",
      "overlay": "Overlaying on:",
      "share": "Sharing on:",
      "monitor": "Monitor {index}"
    },
    "mode": {
      "overlay": "Overlay",
      "share": "Share"
    },
    "hintShare": "Pick one monitor. Its screen is split in half with whatever is already projected; if one side leaves, the other takes the whole screen again."
  },
  "monitors": {
    "wiredTitle": "Wired connections",
    "selectScreens": "Select screens",
    "identify": "Detect screens",
    "hint": "Check the monitors where the resource should be projected.",
    "loading": "Detecting monitors…",
    "empty": "No extended monitors found.",
    "primary": "Primary",
    "returnScreen": "Return screen",
    "selectedCount": "{count} selected",
    "projectNeedsScreens": "Select at least one extended screen to project"
  },
  "popupCount": {
    "label": "Screens",
    "tooltip": "Select projection screens"
  },
  "popupControls": {
    "closeAll": "Close all screens"
  },
  "uiZoom": {
    "label": "Page zoom",
    "zoomIn": "Zoom in",
    "zoomOut": "Zoom out"
  },
  "nav": {
    "home": "Home",
    "albums": "Media Center",
    "community": "Community",
    "liturgy": "Liturgy",
    "bible": "Bible",
    "utilities": "Utilities",
    "settings": "Settings",
    "history": {
      "label": "Navigation history",
      "back": "Back",
      "forward": "Forward",
      "goTo": "Go to {label}"
    },
    "historyDetail": {
      "player": "Player",
      "editor": "Editor"
    }
  },
  "connectedDevices": {
    "title": "Connected devices",
    "remote": "Remote control",
    "speaker": "Preacher's clicker",
    "monitors": "Monitor sharing",
    "none": "None connected",
    "monitorsInUse": "{device} ({host}) · {n} monitor(s)",
    "palco": "Stage (TVs)",
    "palcoTv": "{name} · {ip}",
    "transmission": "Broadcasts (OBS/browsers)",
    "transmissionGroup": "{connection} · {page} · {tabs}",
    "tabs": "1 tab | {n} tabs",
    "inObs": "{n} in OBS",
    "inBrowser": "{n} in the browser",
    "and": " and ",
    "pages": {
      "espelho": "Mirror",
      "retorno": "Stage return",
      "legenda": "Caption",
      "other": "Other page"
    }
  },
  "minimize": {
    "playlistCount": "{n} playlist(s)",
    "pageNumber": "Page {n}",
    "bar": "Minimized pages",
    "close": "Close {title}",
    "page": "Minimize page",
    "search": "Search: {q}"
  },
  "sync": {
    "downloadQueue": {
      "title": "Downloads",
      "clearFinished": "Clear finished",
      "retry": "Retry",
      "cancel": "Cancel"
    }
  },
  "sljaMigration": {
    "title": "Upload {count} imported hymn(s) to your account?",
    "message": "You imported .slja files while logged out. They can go to your account (a single copy, never duplicated) and be available on any device.",
    "confirm": "Upload to account",
    "cancel": "Keep on this device only"
  },
  "download": {
    "indicatorTitle": "Background downloads: {done}/{total} ({percent}%)",
    "indicatorCounts": "{done} of {total} completed",
    "indicatorIdle": "Preparing download…"
  },
  "settings": {
    "appearance": {
      "changeTheme": "Alterar tema"
    },
    "general": {
      "checkUpdate": "Buscar atualizações",
      "checking": "Comprobando…",
      "updateAvailable": "Atualização disponível",
      "updateDesktopOnly": "Somente desktop",
      "updateError": "Erro de atualização",
      "updateHint": "Reinicie para aplicar",
      "updateNotAvailable": "Sem atualizações",
      "updateTitle": "Atualização do app"
    },
    "stage": {
      "title": "Personalizar Palco",
      "scopeGlobal": "Padrão (global)",
      "scope": {
        "hymns": "Hinos",
        "bible": "Bíblia",
        "liturgy": "Liturgia",
        "timer": "Cronômetro",
        "random": "Sorteio",
        "clock": "Relógio",
        "countdown": "Contagem regressiva"
      },
      "inheritingHint": "Este módulo está herdando o padrão global. Qualquer alteração aqui cria uma personalização própria.",
      "backgroundColor": "Cor de fundo",
      "backgroundImage": "Imagem de fundo",
      "officialBackground": "Fundo oficial",
      "officialGalleryHint": "Toque para aplicar; toque novamente para remover.",
      "selectImage": "Clique para selecionar uma imagem",
      "removeImage": "Remover imagem",
      "changeImage": "Trocar imagem",
      "textColor": "Cor do texto",
      "fontSize": "Tamanho da fonte",
      "fontWeight": "Espessura",
      "weightNormal": "Normal",
      "weightMedium": "Média",
      "weightLightPlus": "Leve+",
      "weightStrong": "Forte",
      "bibleAppearance": "Bíblia — aparência própria",
      "bibleTextColor": "Cor do texto (Bíblia)",
      "bibleFontSize": "Tamanho da fonte (Bíblia)",
      "bibleFontWeight": "Espessura (Bíblia)",
      "showBibleVersion": "Mostrar versão da Bíblia no rodapé",
      "footerRefColor": "Cor da referência (rodapé)",
      "shadowAndBox": "Sombra e caixinha",
      "textShadow": "Sombra na letra",
      "shadowIntensity": "Intensidade da sombra",
      "shadowBlur": "Espalhamento da sombra",
      "textBox": "Caixinha atrás da letra",
      "boxOpacity": "Opacidade da caixinha",
      "boxBorder": "Borda na caixinha",
      "alignment": "Alinhamento do texto",
      "horizontal": "Horizontal",
      "vertical": "Vertical",
      "alignLeft": "Esquerda",
      "alignCenter": "Centro",
      "alignRight": "Direita",
      "alignTop": "Em cima",
      "alignMiddle": "Meio",
      "alignBottom": "Em baixo",
      "reset": "Redefinir",
      "resetConfirm": "Voltar este módulo para o padrão?"
    },
    "placeholder": {
      "general": "Preferências gerais do aplicativo em breve.",
      "media": "Configurações de áudio, vídeo e player em breve.",
      "projection": "Configurações de projeção e telas em breve."
    }
  }
}
