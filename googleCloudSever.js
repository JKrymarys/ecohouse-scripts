"use strict";

//Based on official Google Cloud IoT Core MQTT example.

const fs = require("fs");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

const Gpio = require("onoff").Gpio;
const redLED = new Gpio(21, "out");
const yellowLED = new Gpio(20, "out");
const pushButton = new Gpio(17, "in", "both");
const I2C = require("raspi-i2c").I2C;

const argv = {
  projectId: "ecohouse-9136c",
  cloudRegion: "europe-west1",
  registryId: "ecohouse-registry",
  deviceId: "my-device",
  privateKeyFile: "rsa_private.pem",
  algorithm: "RS256",
  numMessages: 100,
  tokenExpMins: 20,
  mqttBridgeHostname: "mqtt.googleapis.com",
  mqttBridgePort: 8883,
  messageType: "state" //events or states
};

// # Device Addresses used to get data from MPL3115A2
const MPL3115A2_ADDRESS = 0x60;
const MPL3115A2_CTRL_REG1 = 0x26;
const MPL3115A2_CTRL_REG1_OS128 = 0x38;
const MPL3115A2_CTRL_REG1_ALT = 0x80;
const MPL3115A2_CTRL_REG1_BAR = 0x00;
const MPL3115A2_PT_DATA_CFG = 0x13;
const MPL3115A2_REGISTER_TEMP_MSB = 0x04;

// helpers

function blinkLED() {
  yellowLED.writeSync(1); //set pin state to 1 (turn LED on)
  setTimeout(function() {
    yellowLED.writeSync(0);
  }, 1000);
}

function createJwt(projectId, privateKeyFile, algorithm) {
  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
  const token = {
    iat: parseInt(Date.now() / 1000),
    exp: parseInt(Date.now() / 1000) + 1440 * 60, // 1440 minutes = 24h
    aud: projectId
  };
  const privateKey = fs.readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, { algorithm: algorithm });
}

function fetchData() {
  const mpl3115a2 = new MPL3115A2();
  const tzoffset = new Date().getTimezoneOffset() * 60000; // make adjustments to take into consideration timezonses
  var data = {
    temp_house: mpl3115a2.data().temp,
    pressure_house: mpl3115a2.data().pressure,
    datetime: new Date(Date.now() - tzoffset)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ") //add offset to match timezone of Poland
  };
  return data;
}

function sendData() {
  let payload = fetchData();
  payload = JSON.stringify(payload);
  console.log(mqttTopic, ": Publishing message:", payload);
  client.publish(mqttTopic, payload, { qos: 1 });
  blinkLED(); //give visual feedback that message's been sent (yellow LED)
  setTimeout(sendData, 10 * 60000); //invoke function recursivly every 10 minutes
}

const mqttClientId = `projects/${argv.projectId}/locations/${
  argv.cloudRegion
}/registries/${argv.registryId}/devices/${argv.deviceId}`;

let connectionArgs = {
  host: argv.mqttBridgeHostname,
  port: argv.mqttBridgePort,
  clientId: mqttClientId,
  username: "unused",
  password: createJwt(argv.projectId, argv.privateKeyFile, argv.algorithm),
  protocol: "mqtts",
  secureProtocol: "TLSv1_2_method"
};

const mqttTopic = `/devices/${argv.deviceId}/${argv.messageType}`;
const client = mqtt.connect(connectionArgs);

//end helpers
class MPL3115A2 {
  data() {
    var data = {};
    const i2c = new I2C();
    // Clear CTRL_REG_1
    i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, 0x00);
    // Set oversmapling to 128x
    i2c.writeByteSync(
      MPL3115A2_ADDRESS,
      MPL3115A2_CTRL_REG1,
      MPL3115A2_CTRL_REG1_OS128
    );
    //Enable data flags - data readt for altitude, pressure, temperature
    i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_PT_DATA_CFG, 0x07);
    // Begin acuiring, single shot
    i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, 0x3a);

    let dataReady = false;
    while (!dataReady) {
      if (i2c.readByteSync(MPL3115A2_ADDRESS, 0x00) != 0) {
        //  MPL3115A2_REGISTER_TEMP_MSB - temperature sensor

        //TEMPERATURE
        let temp, cTemp, tHeight, altitude, pres, pressurehPa;
        let responseTemp = i2c.readSync(
          MPL3115A2_ADDRESS,
          MPL3115A2_REGISTER_TEMP_MSB,
          2
        );

        temp = (responseTemp[0] * 256 + (responseTemp[1] & 0xf0)) / 16;
        cTemp = temp / 16.0;
        //data.fullResponse = responseTemp;
        // data.temp_meta = temp;
        data.temp = cTemp;

        // //ALTITUTE
        // var responseAltitute = i2c.readSync(MPL3115A2_ADDRESS, MPL3115A2_REGISTER_PRESSURE_MSB , 3);
        // // tHeight = (((responseAltitute[0] * 256) + (responseAltitute[1] * 16) + (responseAltitute[2])) & 0xF0) / 16
        // tHeight = ((responseAltitute[0] * 65536) + (responseAltitute[1] * 256) + (responseAltitute[2] & 0xF0)) / 16
        // altitude = tHeight / 16.0
        // data.tHeight = tHeight;
        // data.altitude = altitude;

        //set to barometer mode
        // i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, 0x39);

        //PRESSURE
        //4bits status, pres MSB1, pres MSB, pres LSB
        var responsePressure = i2c.readSync(
          MPL3115A2_ADDRESS,
          MPL3115A2_CTRL_REG1_BAR,
          4
        );
        pres =
          (responsePressure[1] * 65536 +
            responsePressure[2] * 256 +
            (responsePressure[3] & 0xf0)) /
          16;
        pressurehPa = pres / 4.0 / 100;

        // data.pressureMeta = pres
        data.pressure = pressurehPa;
        dataReady = true;
      }
    }
    return data;
  }
}

class DataCollector {
  constructor() {}

  runDataCollector() {
    client.on("connect", success => {
      if (success) {
        console.log("Client connected...");
        redLED.writeSync(1); // give visual feedback that data collector is connected
        sendData();
        redLED.writeSync(0); // give visual feedback that data collector has been disconnected
      } else {
        console.log("Client not connected...");
        redLED.writeSync(0);
      }
    });

    client.on("close", () => {
      console.log("close");
      redLED.writeSync(0); // give visual feedback that data collector has been disconnected
    });

    client.on("error", err => {
      console.log("error", err);
      redLED.writeSync(0);
    });
  }
}

new DataCollector().runDataCollector();
