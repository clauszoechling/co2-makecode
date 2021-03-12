CO2_Werte_zeitlich = [400, 400, 400, 400, 400]
CO2_Werte_sortiert = [400, 400, 400, 400, 400]
temp = 400
"""

CO2 block

"""
# %color=#FF8409 icon="\uf185" block="CO2"
# % groups="['CO2', ,'LEDs', 'WIFI', 'Display']"
@namespace
class CO2:
    co2: number = 0
    
    def on_in_background():
        enableContinuousMeasurement()
        while True:
            readMeasurement()
    control.in_background(on_in_background)
    
    def enableContinuousMeasurement():
        commandBuffer = bytearray(5)
        commandBuffer[0] = 0x00
        commandBuffer[1] = 0x10
        commandBuffer[2] = 0x00
        commandBuffer[3] = 0x00
        commandBuffer[4] = 0x81
        pins.i2c_write_buffer(0x61, commandBuffer, False)
    def readReady():
        buf = bytearray(3)
        pins.i2c_write_number(0x61, 0x0202, NumberFormat.UINT16_BE, False)
        basic.pause(10)
        buf = pins.i2c_read_buffer(0x61, 3, False)
        res = buf[0] << 8 + buf[1]
        if buf[1] == 1:
            return True
        else:
            return False
    def readMeasurement():
        global co2
        # serial.writeLine("waiting in: readMeasurement()")
        while readReady() == False:
            pass
        buf2 = bytearray(18)
        tbuf = bytearray(4)
        pins.i2c_write_number(0x61, 0x0300, NumberFormat.UINT16_BE, False)
        basic.pause(10)
        buf2 = pins.i2c_read_buffer(0x61, 18, False)
        # co2
        tbuf.set_number(NumberFormat.INT8_LE,
            0,
            buf2.get_number(NumberFormat.UINT8_LE, 0))
        tbuf.set_number(NumberFormat.INT8_LE,
            1,
            buf2.get_number(NumberFormat.UINT8_LE, 1))
        tbuf.set_number(NumberFormat.INT8_LE,
            3,
            buf2.get_number(NumberFormat.UINT8_LE, 3))
        tbuf.set_number(NumberFormat.INT8_LE,
            4,
            buf2.get_number(NumberFormat.UINT8_LE, 4))
        co2 = tbuf.get_number(NumberFormat.FLOAT32_BE, 0)
        co2 = Math.round(co2 * 100) / 100
    """
    ------------------ 
    """
    wifi_connected: bool = False
    thingspeak_connected: bool = False
    last_upload_successful: bool = False
    # write AT command with CR+LF ending
    def sendAT(command: str, wait: number = 100):
        serial.write_string(command + "\u000D\u000A")
        basic.pause(wait)
    # wait for certain response from ESP8266
    def waitResponse():
        serial_str: str = ""
        result: bool = False
        time: number = input.running_time()
        while True:
            serial_str += serial.read_string()
            if len(serial_str) > 200:
                serial_str = serial_str.substr(len(serial_str) - 200)
            if serial_str.includes("OK") or serial_str.includes("ALREADY CONNECTED"):
                result = True
                break
            elif serial_str.includes("ERROR") or serial_str.includes("SEND FAIL"):
                break
            if input.running_time() - time > 30000:
                break
        return result
    """
    ------------------ 
    """
    """
    
    Reads CO2
    
    """
    # % weight=87 blockGap=20
    # % block="CO2 Wert"
    # % blockId=read_CO2
    # % group="CO2"
    def readCO2():
        return Math.round(co2)
    """
    ------- Anfang Funktionen ----------- 
    """
    # % block="berechne CO2 Median"
    # % weight=7
    # % group="Funktionen"
    def writeNumNewLine2():
        global temp
        # addiere
        for Indexa in range(4):
            CO2_Werte_zeitlich[Indexa] = CO2_Werte_zeitlich[Indexa + 1]
        CO2_Werte_zeitlich.insert_at(4, Math.round(co2))
        # kopiere
        for Indexb in range(5):
            CO2_Werte_sortiert.insert_at(Indexb, CO2_Werte_zeitlich[Indexb])
        # sortiere
        for k in range(5):
            i = 0
            while i <= 3 - k:
                if CO2_Werte_sortiert[i] > CO2_Werte_sortiert[i + 1]:
                    temp = CO2_Werte_sortiert[i]
                    CO2_Werte_sortiert[i] = CO2_Werte_sortiert[i + 1]
                    CO2_Werte_sortiert[i + 1] = temp
                i += 1
        return CO2_Werte_sortiert[2]
    """
    -------- Ende Funktionen ---------- 
    """
    """
    
    Initialize ESP8266 module and connect it to Wifi router
    
    """
    # % block="Initialisiere ESP8266|RX (Tx of micro:bit) %tx|TX (Rx of micro:bit) %rx|Baud rate %baudrate|Wifi SSID = %ssid|Wifi PW = %pw"
    # % tx.defl=SerialPin.P1
    # % rx.defl=SerialPin.P2
    # % ssid.defl=your_ssid
    # % pw.defl=your_pw
    # % subcategory="WIFI"
    # % group="WIFI"
    def connectWifi(tx: SerialPin, rx: SerialPin, baudrate: BaudRate, ssid: str, pw: str):
        global wifi_connected, thingspeak_connected
        wifi_connected = False
        thingspeak_connected = False
        serial.redirect(tx, rx, baudrate)
        sendAT("AT+RESTORE", 1000)
        # restore to factory settings
        sendAT("AT+CWMODE=1")
        # set to STA mode
        sendAT("AT+RST", 1000)
        # reset
        sendAT("AT+CWJAP=\"" + ssid + "\",\"" + pw + "\"", 0)
        # connect to Wifi router
        wifi_connected = waitResponse()
        basic.pause(100)
    """
    
    Connect to ThingSpeak and upload data. It would not upload anything if it failed to connect to Wifi or ThingSpeak.
    
    """
    # % block="Upload Daten auf ThingSpeak|URL/IP = %ip|Write API key = %write_api_key|Wert %field|Feld = %data"
    # % ip.defl=api.thingspeak.com
    # % write_api_key.defl=your_write_api_key
    # % subcategory="WIFI"
    # % group="WIFI"
    def connectThingSpeak(ip: str, write_api_key: str, field: number, data: number):
        global thingspeak_connected, last_upload_successful
        if wifi_connected and write_api_key != "":
            thingspeak_connected = False
            sendAT("AT+CIPSTART=\"TCP\",\"" + ip + "\",80", 0)
            # connect to website server
            thingspeak_connected = waitResponse()
            basic.pause(100)
            if thingspeak_connected:
                last_upload_successful = False
                str2: str = "GET /update?api_key=" + write_api_key + "&field" + str(field) + "=" + str(data)
                sendAT("AT+CIPSEND=" + str((len(str2) + 2)))
                sendAT(str2, 0)
                # upload data
                last_upload_successful = waitResponse()
                basic.pause(100)
    """
    
    Wait between uploads
    
    """
    # % block="Warte %delay ms"
    # % delay.min=0 delay.defl=5000
    # % subcategory="WIFI"
    # % group="WIFI"
    # % blockHidden=true
    def wait(delay: number):
        if delay > 0:
            basic.pause(delay)
    """
    
    Check if ESP8266 successfully connected to Wifi
    
    """
    # % block="Wifi verbunden ?"
    # % subcategory="WIFI"
    # % group="WIFI"
    def isWifiConnected():
        return wifi_connected
    """
    
    Check if ESP8266 successfully connected to ThingSpeak
    
    """
    # % block="ThingSpeak verbunden ?"
    # % subcategory="WIFI"
    # % group="WIFI"
    def isThingSpeakConnected():
        return thingspeak_connected
    """
    
    Check if ESP8266 successfully uploaded data to ThingSpeak
    
    """
    # % block="Last data upload successful ?"
    # % subcategory="WIFI"
    # % group="WIFI"
    # % blockHidden=true
    def isLastUploadSuccessful():
        return last_upload_successful