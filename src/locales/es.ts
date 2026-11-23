export default {
  closeProjection: {
    title: "¿Cerrar proyección?",
    message: "Hay una proyección activa (biblia/himnos/video/sitio). ¿Cerrar ahora? Enter cierra.",
    confirm: "Cerrar",
  },
  auth: {
    wrongPassword: 'Contraseña incorrecta',
    reauthFailed: 'No se pudo confirmar tu identidad',
    accountDeleted: 'Cuenta eliminada',
    passwordRequired: 'Escribe tu contraseña para confirmar',
    sessionExpired: 'Sesión expirada — inicia sesión de nuevo para eliminar la cuenta',
    deleteFailed: 'No se pudo eliminar la cuenta',
  },
  "palcoOutputs": {
    "title": "TVs con Escenario",
    "empty": "Ninguna TV con el Escenario conectada. Ver en Escenario",
    "onHold": "{slot} · en espera"
  },
  "obsOutputs": {
    "detecting": "Detectando y actualizando conexiones OBS…",
    "active": "Conexiones remotas",
    "activateHint": "Active una conexión en Configuración → Transmisión para usarla aquí.",
    "title": "Conexiones OBS",
    "activeConnections": "Conexiones activas: {count}"
  },
  "floating": {
    "closeTitle": "¿Cerrar {title}?",
    "closeMessage": "¿Desea detener este recurso y cerrar su proyección?"
  },
  "updates": {
    checkFailed: "Error al buscar actualizaciones",
    downloadFailedRetry: "No se pudo descargar la actualización. Inténtalo más tarde.",
    downloadFailedConnection: "No se pudo descargar la actualización. Verifica tu conexión a internet.",
    verifyFailed: "No se pudo verificar la actualización. Inténtalo más tarde.",
    updateFailed: "Error en la actualización. Inténtalo más tarde.",
    "downloadMacInstaller": "Descargar instalador macOS",
    "manualMacInstructions": "En macOS, esta actualización se instala manualmente. Descarga el instalador, cierra LouvorJA, abre el DMG y arrastra la aplicación a Aplicaciones, reemplazando la versión anterior. Tus datos y preferencias se conservarán.",
    "version": "Versión {version}",
    "noReleaseNotes": "Sin notas de la versión.",
    "download": "Descargar actualización",
    "installRestart": "Instalar y reiniciar",
    "later": "Más tarde",
    "available": "Versión {version} disponible",
    "update": "Actualizar",
    "dismiss": "Descartar"
  },
  "windowControls": {
    "close": "Cerrar",
    "minimize": "Minimizar",
    "maximize": "Maximizar"
  },
  "a11y": {
    "mainNav": "Navegación principal"
  },
  "apiOffline": {
    "message": "Sin conexión con el servicio — verifica tu internet",
    "retrying": "Intentando reconectar..."
  },
  "projection": {
    liturgy: "Proyección",
    "minimizeProjection": "Minimizar proyección",
    "restoreProjection": "Restaurar proyección",
    "confirmClose": "La proyección está en curso. Cerrar esta ventana detiene la música. ¿Realmente desea salir?"
  },
  "app": {
    "name": "Louvor JA",
    "nameLouvor": "Louvor",
    "nameJa": "JA"
  },
  "common": {
    "close": "Cerrar",
    "comingSoon": "Próximamente",
    "openFolder": "Abrir carpeta",
    "addToPlaylist": "Añadir a la lista",
    "suggestFix": "Sugerir corrección de letra/timing",
    "cancel": "Cancelar",
    "copied": "¡Copiado!"
  },
  "independentProjection": {
    "title": "Proyección independiente",
    "enableHint": "Actívelo en Pantallas para usar",
    "unavailable": "Solo se habilita con monitores extendidos disponibles",
    "hint": "Elige un monitor. Este recurso aparece encima de lo que se esté proyectando en él; los demás monitores no cambian.",
    "monitor": "Monitor {index}",
    "activeOn": "Proyección independiente en el monitor {index}",
    "stop": "Detener proyección independiente",
    "sharedOn": "Proyección compartida en el monitor {index}",
    "modeLabel": "Modo de proyección",
    "status": {
      "stop": "Detener",
      "overlay": "Superponiendo en:",
      "share": "Compartiendo en:",
      "monitor": "Monitor {index}"
    },
    "mode": {
      "overlay": "Superponer",
      "share": "Compartir"
    },
    "hintShare": "Elige un monitor. Su pantalla se divide a la mitad con lo que ya se está proyectando; si un lado sale, el otro vuelve a ocupar toda la pantalla."
  },
  "monitors": {
    "wiredTitle": "Conexiones por cable",
    "selectScreens": "Seleccionar pantallas",
    "identify": "Detectar pantallas",
    "hint": "Comprobar los monitores donde se debe proyectar el recurso.",
    "loading": "Detectando monitores…",
    "empty": "No se encontraron monitores extendidos.",
    "primary": "Principal",
    "returnScreen": "Pantalla de retorno",
    "selectedCount": "{count} seleccionadas",
    "projectNeedsScreens": "Seleccione al menos una pantalla extendida para proyectar"
  },
  "popupCount": {
    "label": "Pantallas",
    "tooltip": "Seleccionar pantallas de proyección"
  },
  "popupControls": {
    "closeAll": "Cerrar todas las pantallas"
  },
  "uiZoom": {
    "label": "Zoom de página",
    "zoomIn": "Acercar",
    "zoomOut": "Alejar"
  },
  "nav": {
    "home": "Inicio",
    "albums": "Central de Medios",
    "community": "Comunidad",
    "liturgy": "Liturgia",
    "bible": "Biblia",
    "utilities": "Utilidades",
    "settings": "Configuraciones",
    "history": {
      "label": "Historial de navegación",
      "back": "Atrás",
      "forward": "Adelante",
      "goTo": "Ir a {label}"
    },
    "historyDetail": {
      "player": "Reproductor",
      "editor": "Editor"
    }
  },
  "connectedDevices": {
    "title": "Dispositivos conectados",
    "remote": "Control remoto",
    "speaker": "Pasador del predicador",
    "monitors": "Compartir monitores",
    "none": "Ninguno conectado",
    "monitorsInUse": "{device} ({host}) · {n} monitor(es)",
    "palco": "Escenario (TVs)",
    "palcoTv": "{name} · {ip}",
    "transmission": "Transmisiones (OBS/navegadores)",
    "transmissionGroup": "{connection} · {page} · {tabs}",
    "tabs": "1 pestaña | {n} pestañas",
    "inObs": "{n} en OBS",
    "inBrowser": "{n} en el navegador",
    "and": " y ",
    "pages": {
      "espelho": "Espejo",
      "retorno": "Retorno",
      "legenda": "Subtítulo",
      "other": "Otra página"
    }
  },
  "minimize": {
    "playlistCount": "{n} lista(s)",
    "pageNumber": "Página {n}",
    "bar": "Páginas minimizadas",
    "close": "Cerrar {title}",
    "page": "Minimizar página",
    "search": "Búsqueda: {q}"
  },
  "sync": {
    "downloadQueue": {
      "title": "Descargas",
      "clearFinished": "Limpiar completados",
      "retry": "Reintentar",
      "cancel": "Cancelar"
    }
  },
  "sljaMigration": {
    "title": "¿Subir {count} himno(s) importado(s) a tu cuenta?",
    "message": "Importaste archivos .slja sin sesión. Pueden ir a tu cuenta (una copia única, sin duplicar) y estar disponibles en cualquier dispositivo.",
    "confirm": "Subir a la cuenta",
    "cancel": "Quedar solo en este dispositivo"
  },
  "download": {
    "indicatorTitle": "Descargas en segundo plano: {done}/{total} ({percent}%)",
    "indicatorCounts": "{done} de {total} completadas",
    "indicatorIdle": "Preparando descarga…"
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
