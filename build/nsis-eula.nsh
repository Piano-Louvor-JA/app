; NSIS include script — EULA multi-idioma + instalação per-machine simplificada.
; Mostra o EULA no idioma selecionado pelo usuário no installer.
; O NSIS não expõe uma macro LANG_PORTUGUESEBR, embora o nome do arquivo
; de idioma seja PortugueseBR.nlf. O LCID do português brasileiro é 1046.
;
; Pasta de mídia: sempre %ProgramData%\LouvorJA-PIANO\Media na instalação.
; Override de caminho fica só em Configurações → Geral (MediaFolderCard).

!define LANG_PORTUGUESE_BR 1046
!define LANG_ENGLISH_US 1033
!define LANG_SPANISH_ES 3082
; O compilador NSIS roda a partir do diretório de templates do electron-builder,
; não da raiz do projeto. PROJECT_DIR é injetado pelo electron-builder e mantém
; estes caminhos válidos tanto no Windows do CI quanto no build local.
!define LICENSE_PTBR "${PROJECT_DIR}\electron\legal\eula\pt-BR.txt"
!define LICENSE_EN "${PROJECT_DIR}\electron\legal\eula\en.txt"
!define LICENSE_ES "${PROJECT_DIR}\electron\legal\eula\es.txt"

; Nome da pasta de instalação (per-machine / todos os usuários).
!define INSTALL_FOLDER_NAME "Louvor JA PIANO"
; Pasta de dados / mídia compartilhada (não confundir com Program Files).
!define DATA_FOLDER_NAME "LouvorJA-PIANO"

LicenseLangString LicenseFile ${LANG_PORTUGUESE_BR} "${LICENSE_PTBR}"
LicenseLangString LicenseFile ${LANG_ENGLISH_US} "${LICENSE_EN}"
LicenseLangString LicenseFile ${LANG_SPANISH_ES} "${LICENSE_ES}"

; APP_FILENAME continua louvorja-piano (executableName).
; Com allowToChangeInstallationDirectory desativado, o caminho de instalação
; vem de preInit + setInstallMode (Louvor JA PIANO).

; Prioriza build/extractAppPackage.nsh sobre o template do electron-builder
; (última !addincludedir é pesquisada primeiro).
!macro customHeader
  !addincludedir "${BUILD_RESOURCES_DIR}"
!macroend

!macro killAppIfRunning
  DetailPrint "Encerrando processos de ${PRODUCT_NAME}..."
  nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
  Pop $0
  Sleep 600
  nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
  Pop $0
  Sleep 400
!macroend

; Só encerra o .exe — sem MessageBox. Instância elevada (UAC) também precisa
; disso no .onInit: o template pula CHECK_APP_RUNNING no inner instance.
!macro customCheckAppRunning
  !insertmacro killAppIfRunning
!macroend

!macro customInit
  !ifndef BUILD_UNINSTALLER
  !insertmacro killAppIfRunning
  !endif
!macroend

; Caminho canônico único: per-machine (HKLM).
; O HKCU legado é removido para não sobrar uma segunda localização válida —
; dois InstallLocation (HKLM + HKCU) faziam o updater desinstalar/reinstalar
; em diretório diferente do atalho do desktop, que ficava apontando para
; .exe inexistente ("ícone sumiu" após atualização).
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\${INSTALL_FOLDER_NAME}"
  DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
!macroend

; Dados do app + mídia padrão em ProgramData, com ACL para Users (S-1-5-32-545).
; Não altera MediaRoot / .media-root — override fica a cargo de Configurações.
!macro customInstall
  !ifndef BUILD_UNINSTALLER
  SetRegView 64
  ReadEnvStr $0 PROGRAMDATA
  ; NSIS: use \\ antes de ${...} — senão \${ engole a barra
  ; (criava C:\ProgramDataLouvorJA-PIANO na raiz do disco).
  CreateDirectory "$0\\${DATA_FOLDER_NAME}"
  CreateDirectory "$0\\${DATA_FOLDER_NAME}\\Media"
  CreateDirectory "$0\\${DATA_FOLDER_NAME}\\Media\\covers"
  CreateDirectory "$0\\${DATA_FOLDER_NAME}\\Media\\music"
  CreateDirectory "$0\\${DATA_FOLDER_NAME}\\Media\\images"
  ExecWait '"$WINDIR\System32\icacls.exe" "$0\\${DATA_FOLDER_NAME}" /grant *S-1-5-32-545:(OI)(CI)M /T /C' $1
  ; Recria o atalho do desktop apontando para o .exe da instalação atual.
  ; Sem isso, update que muda o caminho deixa .lnk órfão (ícone "sumido").
  CreateShortCut "$DESKTOP\\${PRODUCT_NAME}.lnk" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" 0
  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\\${PRODUCT_NAME}.lnk" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" 0
  !endif
!macroend
