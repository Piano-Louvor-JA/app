sub init()
    m.top.functionName = "connectLoop"
end sub

sub connectLoop()
    port = CreateObject("roMessagePort")
    attempt = 0

    while true
        host = m.top.host.trim()
        if host = "" or not PalcoValidPort(m.top.wsPort) then
            m.top.connectionState = "waiting-config"
            sleep(1000)
            continue while
        end if

        socket = CreateObject("roWebSocket")
        socket.SetMessagePort(port)
        socket.SetUrl(PalcoWebSocketUrl(host, m.top.wsPort, m.top.token))
        m.top.connectionState = "connecting"
        socket.Open()
        active = true

        while active
            event = wait(0, port)
            if type(event) = "roWebSocketEvent" then
                eventType = event.GetType()
                Opened = 1
                Closed = 2
                ErrorType = 3
                TextReceived = 5
                if eventType = Opened then
                    attempt = 0
                    m.top.connectionState = "connected"
                else if eventType = TextReceived then
                    info = event.GetInfo()
                    payload = ParseJson(info.Text)
                    normalized = PalcoNormalizeMessage(payload)
                    if normalized <> invalid then m.top.message = normalized
                else if eventType = Closed or eventType = ErrorType then
                    active = false
                end if
            end if
        end while

        socket.Close()
        m.top.connectionState = "reconnecting"
        m.top.message = { type: "connectionLost" }
        sleep(PalcoReconnectDelay(attempt) * 1000)
        attempt = attempt + 1
    end while
end sub
