function PalcoAllowedType(messageType as dynamic) as boolean
    return messageType = "projection" or messageType = "bgPalco" or messageType = "idle" or messageType = "youare" or messageType = "timer" or messageType = "audio" or messageType = "video"
end function

function PalcoIsHttpUrl(value as dynamic) as boolean
    if value = invalid or type(value) <> "roString" then return false
    lower = lcase(value)
    return left(lower, 7) = "http://" or left(lower, 8) = "https://"
end function

function PalcoNormalizeMessage(raw as dynamic) as dynamic
    if raw = invalid or raw.v = invalid or raw.type = invalid then return invalid
    if raw.v <> 1 and raw.v <> 2 then return invalid
    if type(raw.type) <> "roString" or not PalcoAllowedType(raw.type) then return invalid

    mediaType = raw.type = "audio" or raw.type = "video" or raw.type = "bgPalco"
    if mediaType and raw.url <> invalid and not PalcoIsHttpUrl(raw.url) then return invalid

    normalized = {
        v: raw.v
        type: raw.type
        text: PalcoString(raw.text)
        footer: PalcoString(raw.footer)
        url: PalcoString(raw.url)
        action: PalcoString(raw.action)
        msg: PalcoString(raw.msg)
        ip: PalcoString(raw.ip)
        slot: PalcoNumber(raw.slot, -1)
        slotLabel: PalcoString(raw.slotLabel)
        duration: PalcoNumber(raw.duration, 0)
        positionMs: PalcoNumber(raw.positionMs, PalcoNumber(raw.position, 0))
        label: PalcoString(raw.label)
        background: PalcoString(raw.background)
        backgroundColor: PalcoString(raw.backgroundColor)
        fontSize: PalcoNumber(raw.fontSize, 0)
        fontWeight: PalcoString(raw.fontWeight)
        textAlign: PalcoString(raw.textAlign)
        textVerticalAlign: PalcoString(raw.textVerticalAlign)
    }
    return normalized
end function

function PalcoString(value as dynamic) as string
    if value = invalid then return ""
    if type(value) = "roString" then return value
    return str(value).trim()
end function

function PalcoNumber(value as dynamic, fallback as integer) as integer
    if value = invalid then return fallback
    if type(value) = "roInt" or type(value) = "roLongInteger" or type(value) = "roFloat" or type(value) = "roDouble" then return int(value)
    return fallback
end function

function PalcoReconnectDelay(attempt as integer) as integer
    delays = [1, 2, 4, 8, 15]
    safeAttempt = attempt
    if safeAttempt < 0 then safeAttempt = 0
    if safeAttempt > 4 then safeAttempt = 4
    return delays[safeAttempt]
end function

function PalcoValidPort(port as dynamic) as boolean
    if type(port) <> "roInt" and type(port) <> "roLongInteger" then return false
    return port >= 1 and port <= 65535
end function

function PalcoWebSocketUrl(host as string, port as integer, token as string) as string
    url = "ws://" + host + ":" + str(port).trim() + "/palco"
    if token <> "" then url = url + "?token=" + token
    return url
end function
