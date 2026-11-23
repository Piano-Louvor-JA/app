export default {
  closeProjection: {
    title: "投影を閉じますか？",
    message: "投影が有効です（聖書/賛美歌/動画/サイト）。今閉じますか？Enterで閉じます。",
    confirm: "閉じる",
  },
  auth: {
    wrongPassword: 'パスワードが正しくありません',
    reauthFailed: '本人確認できませんでした',
    accountDeleted: 'アカウントを削除しました',
    passwordRequired: '確認のためパスワードを入力してください',
    sessionExpired: 'セッションが期限切れです — 削除するには再度サインインしてください',
    deleteFailed: 'アカウントを削除できませんでした',
  },
  "palcoOutputs": {
    "title": "テレビ（Palco）",
    "empty": "Palco に接続されたテレビがありません。Palco を開く",
    "onHold": "{slot}・一時停止中"
  },
  "obsOutputs": {
    "detecting": "Detecting and refreshing OBS connections…",
    "active": "リモート接続",
    "activateHint": "ここで使用するには、設定 → 配信で接続を開始してください。",
    "title": "OBS connections",
    "activeConnections": "接続中：{count} 件"
  },
  "floating": {
    "closeTitle": "{title} を閉じますか？",
    "closeMessage": "この機能を停止してプロジェクションを閉じますか？"
  },
  "updates": {
    checkFailed: "アップデートの確認に失敗しました",
    downloadFailedRetry: "アップデートをダウンロードできませんでした。後でもう一度お試しください。",
    downloadFailedConnection: "アップデートをダウンロードできませんでした。インターネット接続を確認してください。",
    verifyFailed: "アップデートを検証できませんでした。後でもう一度お試しください。",
    updateFailed: "アップデートに失敗しました。後でもう一度お試しください。",
    "downloadMacInstaller": "macOS 用インストーラーをダウンロード",
    "manualMacInstructions": "On macOS, install this update manually. Download the installer below, quit LouvorJA, open the DMG and drag the app to Applications, replacing the previous version. Your data and preferences will be kept.",
    "version": "バージョン {version}",
    "noReleaseNotes": "リリースノートはありません。",
    "download": "アップデートをダウンロード",
    "installRestart": "インストールして再起動",
    "later": "後で",
    "available": "バージョン {version} が利用可能",
    "update": "アップデート",
    "dismiss": "閉じる"
  },
  "windowControls": {
    "close": "閉じる",
    "minimize": "最小化",
    "maximize": "最大化"
  },
  "a11y": {
    "mainNav": "メインナビゲーション"
  },
  "apiOffline": {
    "message": "サービスに接続できません — インターネット接続を確認してください",
    "retrying": "再接続を試みています..."
  },
  "projection": {
    liturgy: "投影",
    "minimizeProjection": "プロジェクションを最小化",
    "restoreProjection": "プロジェクションを元に戻す",
    "confirmClose": "プロジェクションの実行中です。このウィンドウを閉じると音楽が停止します。本当に閉じますか？"
  },
  "app": {
    "name": "Louvor JA",
    "nameLouvor": "Louvor",
    "nameJa": "JA"
  },
  "common": {
    "close": "閉じる",
    "comingSoon": "近日公開",
    "openFolder": "フォルダーを開く",
    "addToPlaylist": "プレイリストに追加",
    "suggestFix": "歌詞・タイミングの修正を提案",
    "cancel": "キャンセル",
    "copied": "コピーしました！"
  },
  "independentProjection": {
    "title": "独立プロジェクション",
    "enableHint": "使用するには「画面」でオンにしてください",
    "unavailable": "拡張モニターが接続されている場合にのみ利用できます",
    "hint": "モニターを 1 台選択してください。この機能はそのモニターのプロジェクションの上に表示され、他のモニターはそのまま維持されます。",
    "monitor": "モニター {index}",
    "activeOn": "モニター {index} で独立プロジェクション中",
    "stop": "独立プロジェクションを停止",
    "sharedOn": "モニター {index} で共有プロジェクション中",
    "modeLabel": "プロジェクションモード",
    "status": {
      "stop": "停止",
      "overlay": "オーバーレイ中：",
      "share": "共有中：",
      "monitor": "モニター {index}"
    },
    "mode": {
      "overlay": "オーバーレイ",
      "share": "共有"
    },
    "hintShare": "モニターを 1 台選択してください。画面は既にプロジェクションされている内容と半分ずつに分割されます。片方が終了すると、もう片方が画面全体を使用します。"
  },
  "monitors": {
    "wiredTitle": "有線接続",
    "selectScreens": "画面を選択",
    "identify": "画面を検出",
    "hint": "リソースをプロジェクションするモニターを選択してください。",
    "loading": "モニターを検出しています…",
    "empty": "拡張モニターが見つかりません。",
    "primary": "メイン",
    "returnScreen": "画面を戻す",
    "selectedCount": "{count} 台選択中",
    "projectNeedsScreens": "プロジェクションするには拡張画面を 1 台以上選択してください"
  },
  "popupCount": {
    "label": "画面",
    "tooltip": "プロジェクション画面を選択"
  },
  "popupControls": {
    "closeAll": "すべての画面を閉じる"
  },
  "uiZoom": {
    "label": "ページの拡大率",
    "zoomIn": "拡大",
    "zoomOut": "縮小"
  },
  "nav": {
    "home": "ホーム",
    "albums": "メディアセンター",
    "community": "コミュニティ",
    "liturgy": "礼拝",
    "bible": "聖書",
    "utilities": "ユーティリティ",
    "settings": "設定",
    "history": {
      "label": "ナビゲーション履歴",
      "back": "戻る",
      "forward": "進む",
      "goTo": "{label} へ移動"
    },
    "historyDetail": {
      "player": "プレイヤー",
      "editor": "エディター"
    }
  },
  "connectedDevices": {
    "title": "接続されたデバイス",
    "remote": "リモコン",
    "speaker": "伝道者のクリッカー",
    "monitors": "モニター共有",
    "none": "接続なし",
    "monitorsInUse": "{device}（{host}）・モニター {n} 台",
    "palco": "テレビ（Palco）",
    "palcoTv": "{name}・{ip}",
    "transmission": "Broadcasts (OBS/browsers)",
    "transmissionGroup": "{connection}・{page}・{tabs}",
    "tabs": "タブ 1 個 | タブ {n} 個",
    "inObs": "{n} in OBS",
    "inBrowser": "ブラウザーで {n} 件",
    "and": " と ",
    "pages": {
      "espelho": "ミラー",
      "retorno": "Palco リターン",
      "legenda": "字幕",
      "other": "その他のページ"
    }
  },
  "minimize": {
    "playlistCount": "プレイリスト {n} 件",
    "pageNumber": "ページ {n}",
    "bar": "最小化されたページ",
    "close": "{title} を閉じる",
    "page": "ページを最小化",
    "search": "検索：{q}"
  },
  "sync": {
    "downloadQueue": {
      "title": "ダウンロード",
      "clearFinished": "完了を消去",
      "retry": "再試行",
      "cancel": "キャンセル"
    }
  },
  "sljaMigration": {
    "title": "インポートした {count} 曲の賛美歌をアカウントにアップロードしますか？",
    "message": "ログアウト中に .slja ファイルをインポートしました。アカウントにアップロードすると（重複することなく 1 つのコピーとして）、どのデバイスでも利用できるようになります。",
    "confirm": "アカウントにアップロード",
    "cancel": "このデバイスにのみ保持"
  },
  "download": {
    "indicatorTitle": "バックグラウンドダウンロード：{done}/{total}（{percent}%）",
    "indicatorCounts": "{done} / {total} 完了",
    "indicatorIdle": "ダウンロードを準備しています…"
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
