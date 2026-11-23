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
  "projection": {
    liturgy: "Projection",
    "confirmClose": "La projection est en cours. Fermer la fenêtre interrompt la musique. Voulez-vous vraiment quitter ?",
    "minimizeProjection": "Réduire la projection",
    "restoreProjection": "Restaurer la projection"
  },
  "app": {
    "name": "Louvor JA",
    "nameLouvor": "Louvor",
    "nameJa": "JA"
  },
  "monitors": {
    "selectScreens": "Sélectionner les écrans",
    "identify": "Détecter les écrans",
    "hint": "Cochez les moniteurs sur lesquels le contenu doit être projeté.",
    "loading": "Détection des moniteurs…",
    "empty": "Aucun écran étendu détecté.",
    "primary": "Principal",
    "returnScreen": "Écran de retour",
    "selectedCount": "{count} sélectionné(s)",
    "projectNeedsScreens": "Sélectionnez au moins un écran étendu pour projeter",
    "wiredTitle": "Connexions filaires"
  },
  "common": {
    "comingSoon": "Bientôt",
    "cancel": "Annuler",
    "close": "Fermer",
    "openFolder": "Ouvrir le dossier",
    "addToPlaylist": "Ajouter à la playlist",
    "suggestFix": "Suggérer une correction des paroles/timing",
    "copied": "Copié !"
  },
  "popupCount": {
    "label": "Écrans",
    "tooltip": "Sélectionner les écrans de projection"
  },
  "popupControls": {
    "closeAll": "Fermer tous les écrans"
  },
  "uiZoom": {
    "label": "Zoom de la page",
    "zoomIn": "Augmenter le zoom",
    "zoomOut": "Diminuer le zoom"
  },
  "nav": {
    "home": "Accueil",
    "albums": "Médiathèque",
    "community": "Communauté",
    "liturgy": "Liturgie",
    "bible": "Bible",
    "utilities": "Utilitaires",
    "settings": "Paramètres",
    "history": {
      "label": "Historique de navigation",
      "back": "Retour",
      "forward": "Suivant",
      "goTo": "Aller à {label}"
    },
    "historyDetail": {
      "player": "Lecteur",
      "editor": "Éditeur"
    }
  },
  "settings": {
    "appearance": {
      "changeTheme": "Changer le thème"
    },
    "general": {
      "checkUpdate": "Rechercher des mises à jour",
      "checking": "Vérification…",
      "updateAvailable": "Mise à jour disponible",
      "updateDesktopOnly": "Desktop uniquement",
      "updateError": "Erreur de mise à jour",
      "updateHint": "Redémarrez pour appliquer",
      "updateNotAvailable": "Aucune mise à jour",
      "updateTitle": "Mise à jour de l'app"
    },
    "stage": {
      "title": "Personnaliser la scène",
      "scopeGlobal": "Par défaut (global)",
      "scope": {
        "hymns": "Cantiques",
        "bible": "Bible",
        "liturgy": "Liturgie",
        "timer": "Chronomètre",
        "random": "Tirage au sort",
        "clock": "Horloge",
        "countdown": "Compte à rebours"
      },
      "inheritingHint": "Ce module hérite du style global par défaut. Toute modification ici crée une personnalisation propre.",
      "backgroundColor": "Couleur de fond",
      "backgroundImage": "Image de fond",
      "officialBackground": "Fond officiel",
      "officialGalleryHint": "Touchez pour appliquer ; touchez à nouveau pour retirer.",
      "selectImage": "Cliquez pour sélectionner une image",
      "removeImage": "Supprimer l'image",
      "changeImage": "Changer l'image",
      "textColor": "Couleur du texte",
      "fontSize": "Taille de la police",
      "fontWeight": "Épaisseur",
      "weightNormal": "Normal",
      "weightMedium": "Moyen",
      "weightLightPlus": "Léger+",
      "weightStrong": "Fort",
      "bibleAppearance": "Bible — apparence personnalisée",
      "bibleTextColor": "Couleur du texte (Bible)",
      "bibleFontSize": "Taille de la police (Bible)",
      "bibleFontWeight": "Épaisseur (Bible)",
      "showBibleVersion": "Afficher la version de la Bible dans le pied de page",
      "footerRefColor": "Couleur de la référence (pied de page)",
      "shadowAndBox": "Ombre et cadre",
      "textShadow": "Ombre du texte",
      "shadowIntensity": "Intensité de l'ombre",
      "shadowBlur": "Diffusion de l'ombre",
      "textBox": "Cadre derrière le texte",
      "boxOpacity": "Opacité du cadre",
      "boxBorder": "Bordure du cadre",
      "alignment": "Alignement du texte",
      "horizontal": "Horizontal",
      "vertical": "Vertical",
      "alignLeft": "Gauche",
      "alignCenter": "Centre",
      "alignRight": "Droite",
      "alignTop": "En haut",
      "alignMiddle": "Milieu",
      "alignBottom": "En bas",
      "reset": "Réinitialiser",
      "resetConfirm": "Ramener ce module au style par défaut ?"
    },
    "placeholder": {
      "general": "Préférences générales de l'application bientôt disponibles.",
      "media": "Réglages audio, vidéo et lecteur bientôt disponibles.",
      "projection": "Réglages de projection et d'écrans bientôt disponibles."
    }
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
  "independentProjection": {
    "title": "Projection indépendante",
    "enableHint": "Activez dans Écrans pour utiliser",
    "unavailable": "S'active uniquement si des écrans étendus sont disponibles",
    "hint": "Choisissez un écran. Cette fonctionnalité s'affiche par-dessus ce qui est projeté sur celui-ci ; les autres écrans restent inchangés.",
    "monitor": "Écran {index}",
    "activeOn": "Projection indépendante sur l'écran {index}",
    "stop": "Arrêter la projection indépendante",
    "sharedOn": "Projection partagée sur l'écran {index}",
    "modeLabel": "Mode de projection",
    "status": {
      "stop": "Arrêter",
      "overlay": "Superposition sur :",
      "share": "Partage en cours sur :",
      "monitor": "Écran {index}"
    },
    "mode": {
      "overlay": "Superposer",
      "share": "Partager"
    },
    "hintShare": "Choisissez un écran. Son affichage est divisé en deux avec ce qui est déjà projeté ; si l'un des côtés quitte, l'autre réoccupe tout l'écran."
  },
  "connectedDevices": {
    "title": "Appareils connectés",
    "remote": "Contrôle à distance",
    "speaker": "Défilement du prédicateur",
    "monitors": "Partage des moniteurs",
    "none": "Aucun connecté",
    "monitorsInUse": "{device} ({host}) · {n} moniteur(s)",
    "palco": "Scène (téléviseurs)",
    "palcoTv": "{name} · {ip}",
    "transmission": "Transmissions (OBS/navigateurs)",
    "transmissionGroup": "{connection} · {page} · {tabs}",
    "tabs": "1 onglet | {n} onglets",
    "inObs": "{n} dans OBS",
    "inBrowser": "{n} dans le navigateur",
    "and": " et ",
    "pages": {
      "espelho": "Miroir",
      "retorno": "Retour",
      "legenda": "Sous-titres",
      "other": "Autre page"
    }
  },
  "minimize": {
    "playlistCount": "{n} playlist(s)",
    "pageNumber": "Page {n}",
    "bar": "Pages minimisées",
    "close": "Fermer {title}",
    "page": "Minimiser la page",
    "search": "Recherche : {q}"
  },
  "sync": {
    "downloadQueue": {
      "title": "Téléchargements",
      "clearFinished": "Effacer les terminés",
      "retry": "Réessayer",
      "cancel": "Annuler"
    }
  },
  "sljaMigration": {
    "title": "Envoyer {count} hymne(s) importé(s) vers votre compte ?",
    "message": "Vous avez importé des fichiers .slja sans être connecté. Ils peuvent être ajoutés à votre compte (une seule copie, sans doublon) et être disponibles sur n'importe quel appareil.",
    "confirm": "Envoyer vers le compte",
    "cancel": "Garder uniquement sur cet appareil"
  },
  "download": {
    "indicatorTitle": "Téléchargements en arrière-plan : {done}/{total} ({percent}%)",
    "indicatorCounts": "{done} sur {total} terminés",
    "indicatorIdle": "Préparation du téléchargement…"
  }
}
