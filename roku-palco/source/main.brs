sub Main()
    screen = CreateObject("roSGScreen")
    messagePort = CreateObject("roMessagePort")
    screen.setMessagePort(messagePort)
    scene = screen.CreateScene("MainScene")
    screen.show()

    while true
        message = wait(0, messagePort)
        if type(message) = "roSGScreenEvent" and message.isScreenClosed() then return
    end while
end sub
