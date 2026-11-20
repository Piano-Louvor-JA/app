sub init()
    m.background = m.top.findNode("background")
    m.lyrics = m.top.findNode("lyrics")
    m.footer = m.top.findNode("footer")
    m.timer = m.top.findNode("timer")
    m.status = m.top.findNode("status")
    m.audio = m.top.findNode("audio")
    m.video = m.top.findNode("video")
    m.settings = m.top.findNode("settings")
    m.socket = m.top.findNode("socket")

    config = PalcoLoadSettings()
    m.socket.host = config.host
    m.socket.wsPort = config.wsPort
    m.socket.token = config.token
    m.socket.observeField("message", "onPalcoMessage")
    m.socket.observeField("connectionState", "onConnectionState")
    m.settings.observeField("saveRequested", "onSaveSettings")
    showIdle("Configure host/porta ou aguarde a transmissão")
end sub

sub onPalcoMessage()
    message = m.socket.message
    if message = invalid then return
    messageType = message.type
    if messageType = "connectionLost" then
        stopMedia()
        showIdle("Conexão perdida. Reconectando…")
    else if messageType = "projection" then
        stopVideoOnly()
        m.lyrics.text = message.text
        m.footer.text = message.footer
        m.lyrics.visible = true
        m.footer.visible = true
        m.timer.visible = false
    else if messageType = "bgPalco" then
        m.background.uri = message.url
    else if messageType = "idle" then
        stopMedia()
        showIdle(message.msg)
    else if messageType = "youare" then
        m.status.text = "Conectado: " + message.slotLabel
    else if messageType = "timer" then
        applyTimer(message)
    else if messageType = "audio" then
        applyMedia(m.audio, message)
    else if messageType = "video" then
        applyMedia(m.video, message)
    end if
end sub

sub onConnectionState()
    state = m.socket.connectionState
    if state = "connected" then
        m.status.text = "Conectado ao PIANO Palco"
    else if state = "waiting-config" then
        m.status.text = "Pressione * para configurar conexão"
    else if state = "reconnecting" then
        m.status.text = "Reconectando…"
    end if
end sub

sub applyTimer(message as object)
    if message.action = "stop" then
        m.timer.visible = false
        return
    end if
    m.lyrics.visible = false
    m.footer.visible = false
    m.timer.visible = true
    m.timer.text = message.label
    if message.duration > 0 then m.timer.text = message.label + chr(10) + str(int(message.duration / 1000)).trim() + " s"
end sub

sub applyMedia(node as object, message as object)
    action = message.action
    if action = "stop" then
        node.control = "stop"
        node.content = invalid
        node.visible = false
        return
    end if
    if message.url <> "" then
        content = CreateObject("RoSGNode", "ContentNode")
        content.url = message.url
        node.content = content
    end if
    if action = "seek" then node.seek = message.positionMs / 1000.0
    if action = "pause" then node.control = "pause"
    if action = "play" then node.control = "play"
    node.visible = (node = m.video)
end sub

sub stopVideoOnly()
    m.video.control = "stop"
    m.video.content = invalid
    m.video.visible = false
end sub

sub stopMedia()
    m.audio.control = "stop"
    m.audio.content = invalid
    stopVideoOnly()
end sub

sub showIdle(message as string)
    m.lyrics.text = message
    m.lyrics.visible = true
    m.footer.visible = false
    m.timer.visible = false
end sub

sub onSaveSettings()
    if not m.settings.saveRequested then return
    config = { host: m.settings.host.trim(), wsPort: m.settings.wsPort, token: m.settings.token }
    if config.host <> "" and PalcoValidPort(config.wsPort) then
        PalcoSaveSettings(config)
        m.socket.host = config.host
        m.socket.wsPort = config.wsPort
        m.socket.token = config.token
        m.settings.visible = false
    end if
    m.settings.saveRequested = false
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "options" then
        m.settings.visible = not m.settings.visible
        return true
    end if
    return false
end function
