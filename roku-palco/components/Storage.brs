function PalcoLoadSettings() as object
    section = CreateObject("roRegistrySection", "palco")
    settings = {
        host: section.Read("host")
        wsPort: val(section.Read("wsPort"))
        token: section.Read("token")
    }
    if settings.host = invalid then settings.host = ""
    if settings.token = invalid then settings.token = ""
    if not PalcoValidPort(settings.wsPort) then settings.wsPort = 47081
    return settings
end function

sub PalcoSaveSettings(settings as object)
    section = CreateObject("roRegistrySection", "palco")
    section.Write("host", settings.host)
    section.Write("wsPort", str(settings.wsPort).trim())
    section.Write("token", settings.token)
    section.Flush()
end sub
