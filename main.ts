let CO2_Werte_zeitlich = [400,400,400,400,400]
let CO2_Werte_sortiert = [400,400,400,400,400]
let temp = 400

/**
 * CO2 block
 */
//%color=#FF8409 icon="\uf185" block="CO2"
//% groups="['CO2', ,'LEDs', 'WIFI', 'Display']"

namespace CO2 {
    
    let co2: number = 0
    
    control.inBackground(() => {
        enableContinuousMeasurement()
        while (true) {
            readMeasurement()
        }
    })
    
    function enableContinuousMeasurement(): void{
        let commandBuffer = pins.createBuffer(5)

        commandBuffer[0] = 0x00 
        commandBuffer[1] = 0x10 
        commandBuffer[2] = 0x00 
        commandBuffer[3] = 0x00 
        commandBuffer[4] = 0x81

        pins.i2cWriteBuffer(0x61, commandBuffer, false)
    }

    function readReady(): boolean{
        let buf = pins.createBuffer(3)
        pins.i2cWriteNumber(0x61, 0x0202, NumberFormat.UInt16BE,false)
        basic.pause(10)
        buf = pins.i2cReadBuffer(0x61, 3, false)
        let res = buf[0]<<8 + buf[1]

        if(buf[1] == 1){
            return true
        }else{
            return false
        }
    }

    function readMeasurement(): void{
        while(readReady() == false){
            //serial.writeLine("waiting in: readMeasurement()")
        }
        let buf = pins.createBuffer(18)
        let tbuf = pins.createBuffer(4)
        pins.i2cWriteNumber(0x61, 0x0300, NumberFormat.UInt16BE, false)
        basic.pause(10)
        buf = pins.i2cReadBuffer(0x61, 18, false)
        
        
        //co2
        tbuf.setNumber(NumberFormat.Int8LE, 0, buf.getNumber(NumberFormat.UInt8LE, 0))
        tbuf.setNumber(NumberFormat.Int8LE, 1, buf.getNumber(NumberFormat.UInt8LE, 1))
        tbuf.setNumber(NumberFormat.Int8LE, 3, buf.getNumber(NumberFormat.UInt8LE, 3))
        tbuf.setNumber(NumberFormat.Int8LE, 4, buf.getNumber(NumberFormat.UInt8LE, 4))
        co2 = tbuf.getNumber(NumberFormat.Float32BE, 0)
        co2 = Math.round(co2*100)/100

    }

    /** ------------------ */


    let wifi_connected: boolean = false
    let thingspeak_connected: boolean = false
    let last_upload_successful: boolean = false

    // write AT command with CR+LF ending
    function sendAT(command: string, wait: number = 100) {
        serial.writeString(command + "\u000D\u000A")
        basic.pause(wait)
    }

    // wait for certain response from ESP8266
    function waitResponse(): boolean {
        let serial_str: string = ""
        let result: boolean = false
        let time: number = input.runningTime()
        while (true) {
            serial_str += serial.readString()
            if (serial_str.length > 200) serial_str = serial_str.substr(serial_str.length - 200)
            if (serial_str.includes("OK") || serial_str.includes("ALREADY CONNECTED")) {
                result = true
                break
            } else if (serial_str.includes("ERROR") || serial_str.includes("SEND FAIL")) {
                break
            }
            if (input.runningTime() - time > 30000) break
        }
        return result
    }

    /** ------------------ */





    /**
     * Reads CO2
     */
    //% weight=87 blockGap=20
    //% block="CO2 Wert"
    //% blockId=read_CO2
    //% group="CO2"
    export function readCO2(): number{
        return Math.round(co2)
    }


    /** ------- Anfang Funktionen ----------- */

    //% block="berechne CO2 Median"
    //% weight=7
    //% group="Funktionen"

    export function writeNumNewLine2() {
        //addiere
        for (let Index = 0; Index <= 3; Index++) {
            CO2_Werte_zeitlich[Index] = CO2_Werte_zeitlich[Index + 1]
        }
        CO2_Werte_zeitlich.insertAt(4, Math.round(co2))
        
    //kopiere
    for (let Index = 0; Index <= 4; Index++) {
            CO2_Werte_sortiert.insertAt(Index, CO2_Werte_zeitlich[Index])
        }


    //sortiere
    for (let k = 0; k <= 4; k++) {
        for (let i = 0; i <= 3 - k; i++) {
            if (CO2_Werte_sortiert[i] > CO2_Werte_sortiert[i + 1]) {
                temp = CO2_Werte_sortiert[i]
                CO2_Werte_sortiert[i] = CO2_Werte_sortiert[i + 1]
                CO2_Werte_sortiert[i + 1] = temp
            }
        }
    }

    return CO2_Werte_sortiert[2]

    }



    /** -------- Ende Funktionen ---------- */




    /**
    * Initialize ESP8266 module and connect it to Wifi router
    */
    //% block="Initialisiere ESP8266|RX (Tx of micro:bit) %tx|TX (Rx of micro:bit) %rx|Baud rate %baudrate|Wifi SSID = %ssid|Wifi PW = %pw"
    //% tx.defl=SerialPin.P1
    //% rx.defl=SerialPin.P2
    //% ssid.defl=your_ssid
    //% pw.defl=your_pw
    //% subcategory="WIFI"
    //% group="WIFI"
    export function connectWifi(tx: SerialPin, rx: SerialPin, baudrate: BaudRate, ssid: string, pw: string) {
        wifi_connected = false
        thingspeak_connected = false
        serial.redirect(
            tx,
            rx,
            baudrate
        )
        sendAT("AT+RESTORE", 1000) // restore to factory settings
        sendAT("AT+CWMODE=1") // set to STA mode
        sendAT("AT+RST", 1000) // reset
        sendAT("AT+CWJAP=\"" + ssid + "\",\"" + pw + "\"", 0) // connect to Wifi router
        wifi_connected = waitResponse()
        basic.pause(100)
    }



    /**
    * Connect to ThingSpeak and upload data. It would not upload anything if it failed to connect to Wifi or ThingSpeak.
    */
    //% block="Upload Daten auf ThingSpeak|URL/IP = %ip|Write API key = %write_api_key|Feld %field|Kanal = %data"
    //% ip.defl=api.thingspeak.com
    //% write_api_key.defl=your_write_api_key
    //% subcategory="WIFI"
    //% group="WIFI"
    

    export function connectThingSpeak(ip: string, write_api_key: string, field: number, data: number) {

        if (wifi_connected && write_api_key != "") {
            thingspeak_connected = false
            sendAT("AT+CIPSTART=\"TCP\",\"" + ip + "\",80", 0) // connect to website server
            thingspeak_connected = waitResponse()
            basic.pause(100)
            if (thingspeak_connected) {
                last_upload_successful = false
                let str: string = "GET /update?api_key=" + write_api_key + "&field" + field +"=" + data
                sendAT("AT+CIPSEND=" + (str.length + 2))
                sendAT(str, 0) // upload data
                last_upload_successful = waitResponse()
                basic.pause(100)
            }
        }
    }

    /**
    * Wait between uploads
    */
    //% block="Warte %delay ms"
    //% delay.min=0 delay.defl=5000
    //% subcategory="WIFI"
    //% group="WIFI"
    //% blockHidden=true
    export function wait(delay: number) {
        if (delay > 0) basic.pause(delay)
    }

    /**
    * Check if ESP8266 successfully connected to Wifi
    */
    //% block="Wifi verbunden ?"
    //% subcategory="WIFI"
    //% group="WIFI"
    export function isWifiConnected() {
        return wifi_connected
    }

    /**
    * Check if ESP8266 successfully connected to ThingSpeak
    */
    //% block="ThingSpeak verbunden ?"
    //% subcategory="WIFI"
    //% group="WIFI"
    export function isThingSpeakConnected() {
        return thingspeak_connected
    }

    /**
    * Check if ESP8266 successfully uploaded data to ThingSpeak
    */
    //% block="Last data upload successful ?"
    //% subcategory="WIFI"
    //% group="WIFI"
    //% blockHidden=true
    export function isLastUploadSuccessful() {
        return last_upload_successful
    }








} 
