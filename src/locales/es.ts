export default {
  closeProjection: {
    title: "¿Cerrar la proyección?",
    message: "Hay una proyección activa (biblia/himnos/video/sitio). ¿Cerrar ahora? Enter cierra.",
    confirm: "Cerrar",
  },
  auth: {
    wrongPassword: "Contraseña incorrecta",
    reauthFailed: "No se pudo confirmar su identidad",
    accountDeleted: "Cuenta eliminada",
    passwordRequired: "Escriba su contraseña para confirmar",
    sessionExpired: "Sesión expirada — inicie sesión de nuevo para eliminar la cuenta",
    deleteFailed: "No se pudo eliminar la cuenta",
  },
  "palcoOutputs": {
    "title": "Televisores de escenario",
    "empty": "No hay televisor conectado al Escenario. Abra el Escenario",
    "onHold": "{slot} · en espera"
  },
  "obsOutputs": {
    "detecting": "Detecting and refreshing OBS connections…",
    "active": "Conexiones remotas",
    "activateHint": "Inicie una conexión en Ajustes → Transmisión para usarla aquí.",
    "title": "OBS connections",
    "activeConnections": "Conexiones activas: {count}"
  },
  "floating": {
    "closeTitle": "¿Cerrar {title}?",
    "closeMessage": "¿Detener esta función y cerrar su proyección?"
  },
  "updates": {
    checkFailed: "Error al buscar actualizaciones",
    downloadFailedRetry: "No se pudo descargar la actualización. Intente de nuevo más tarde.",
    downloadFailedConnection: "No se pudo descargar la actualización. Compruebe su conexión a Internet.",
    verifyFailed: "La actualización no pudo verificarse. Intente de nuevo más tarde.",
    updateFailed: "Error al actualizar. Intente de nuevo más tarde.",
    "downloadMacInstaller": "Descargar instalador de macOS",
    "manualMacInstructions": "On macOS, install this update manually. Download the installer below, quit LouvorJA, open the DMG and drag the app to Applications, replacing the previous version. Your data and preferences will be kept.",
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
    "message": "Sin conexión al servicio — compruebe su Internet",
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
      "changeTheme": "Cambiar tema"
    },
    "general": {
      "checkUpdate": "Buscar actualizaciones",
      "checking": "Comprobando…",
      "updateAvailable": "Actualización disponible",
      "updateDesktopOnly": "Solo escritorio",
      "updateError": "Error de actualización",
      "updateHint": "Reinicie para aplicar",
      "updateNotAvailable": "Sin actualizaciones",
      "updateTitle": "Actualización de la app"
    },
    "stage": {
      "title": "Personalizar Palco",
      "scopeGlobal": "Predeterminado (global)",
      "scope": {
        "hymns": "Himnos",
        "bible": "Biblia",
        "liturgy": "Liturgia",
        "timer": "Cronómetro",
        "random": "Sorteo",
        "clock": "Reloj",
        "countdown": "Cuenta regresiva"
      },
      "inheritingHint": "Este módulo hereda el valor global predeterminado. Cualquier cambio aquí crea su propia personalización.",
      "backgroundColor": "Color de fondo",
      "backgroundImage": "Imagen de fondo",
      "officialBackground": "Fondo oficial",
      "officialGalleryHint": "Toque para aplicar; toque de nuevo para quitar.",
      "selectImage": "Haga clic para seleccionar una imagen",
      "removeImage": "Quitar imagen",
      "changeImage": "Cambiar imagen",
      "textColor": "Color del texto",
      "fontSize": "Tamaño de la fuente",
      "fontWeight": "Grosor",
      "weightNormal": "Normal",
      "weightMedium": "Media",
      "weightLightPlus": "Fina+",
      "weightStrong": "Fuerte",
      "bibleAppearance": "Biblia — apariencia propia",
      "bibleTextColor": "Color del texto (Biblia)",
      "bibleFontSize": "Tamaño de fuente (Biblia)",
      "bibleFontWeight": "Grosor (Biblia)",
      "showBibleVersion": "Mostrar versión de la Biblia en el pie",
      "footerRefColor": "Color de la referencia (pie)",
      "shadowAndBox": "Sombra y caja",
      "textShadow": "Sombra en la letra",
      "shadowIntensity": "Intensidad de la sombra",
      "shadowBlur": "Difuminado de la sombra",
      "textBox": "Caja detrás de la letra",
      "boxOpacity": "Opacidad de la caja",
      "boxBorder": "Borde de la caja",
      "alignment": "Alineación del texto",
      "horizontal": "Horizontal",
      "vertical": "Vertical",
      "alignLeft": "Izquierda",
      "alignCenter": "Centro",
      "alignRight": "Derecha",
      "alignTop": "Arriba",
      "alignMiddle": "En medio",
      "alignBottom": "Abajo",
      "reset": "Restablecer",
      "resetConfirm": "¿Restablecer este módulo al valor predeterminado?"
    },
    "placeholder": {
      "general": "Preferencias generales de la app próximamente.",
      "media": "Ajustes de audio, vídeo y reproductor próximamente.",
      "projection": "Ajustes de proyección y pantallas próximamente."
    }
  }
}
