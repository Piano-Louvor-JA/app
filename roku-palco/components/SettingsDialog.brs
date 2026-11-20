sub init()
    m.top.visible = false
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "OK" then
        m.top.saveRequested = true
        return true
    end if
    return false
end function
