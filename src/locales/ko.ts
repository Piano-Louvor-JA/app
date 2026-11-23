export default {
  closeProjection: {
    title: "Close projection?",
    message: "A projection is active (bible/hymns/video/site). Close now? Enter closes.",
    confirm: "Close",
  },
  auth: {
    wrongPassword: "Incorrect password",
    reauthFailed: "Could not confirm your identity",
    accountDeleted: "Account deleted",
    passwordRequired: "Type your password to confirm",
    sessionExpired: "Session expired — sign in again to delete the account",
    deleteFailed: "Could not delete the account",
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
    checkFailed: "Failed to check for updates",
    downloadFailedRetry: "Could not download the update. Try again later.",
    downloadFailedConnection: "Could not download the update. Check your internet connection.",
    verifyFailed: "The update could not be verified. Try again later.",
    updateFailed: "Update failed. Try again later.",
    "downloadMacInstaller": "Download macOS installer",
    "manualMacInstructions": "On macOS, install this update manually. Download the installer below, quit LouvorJA, open the DMG and drag the app to Applications, replacing the previous version. Your data and preferences will be kept.",
    "version": "Version {version}",
    "noReleaseNotes": "No release notes.",
    "download": "Download update",
    "installRestart": "Install and restart",
    "later": "Later",
    "available": "Version {version} available",
    "update": "Update",
    "dismiss": "Dismiss"
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
