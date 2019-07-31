
'use strict';

//Based on official Google Cloud IoT Core MQTT example.

// [START iot_mqtt_include]
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
// var MPL3115A2 = require("./mpl3115a2.js");
// import MPL3115A2 from "./MPL3115A2.js"


var Gpio = require('onoff').Gpio;

var redLED = new Gpio(21, 'out');
var yellowLED = new Gpio(20, 'out');
var pushButton = new Gpio(17, 'in', 'both');
// var ds18b20 = require('ds18b20');
// var serial = "28-00000a0e0954";
var I2C = require('raspi-i2c').I2C;


var argv = { 
  projectId: 'ecohouse-9136c',
  cloudRegion: 'europe-west1',
  registryId: 'ecohouse-registry',
  deviceId: 'my-device',
  privateKeyFile: 'rsa_private.pem', //path
  algorithm: 'RS256',
  numMessages: 100,
  tokenExpMins: 20,
  mqttBridgeHostname: 'mqtt.googleapis.com',
  mqttBridgePort: 8883,
  messageType: 'state', //events or states
}


// # Device Addresses used to get data from MPL3115A2
const MPL3115A2_ADDRESS= 0x60
const MPL3115A2_CTRL_REG1 = 0x26
const MPL3115A2_CTRL_REG1_OS128 = 0x38
const MPL3115A2_CTRL_REG1_ALT = 0x80
const MPL3115A2_CTRL_REG1_BAR = 0x00
const MPL3115A2_PT_DATA_CFG = 0x13
const MPL3115A2_REGISTER_TEMP_MSB = 0x04



class MPL3115A2 {
data() { 
      var data = {};

      var i2c = new I2C();
      // Clear CTRL_REG_1
      i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, 0x00);
      // Set oversmapling to 128x
      i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, MPL3115A2_CTRL_REG1_OS128);
      //Enable data flags - data readt for altitude, pressure, temperature
      i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_PT_DATA_CFG, 0x07);
      // Begin acuiring, single shot
      i2c.writeByteSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1, 0x3A);

      var dataReady = false;
      while(!dataReady){
          if(i2c.readByteSync(MPL3115A2_ADDRESS, 0x00) !=0 ){
              //  MPL3115A2_REGISTER_TEMP_MSB - temperature sensor

              //TEMPERATURE
              let temp, cTemp,tHeight,altitude,pres, pressurehPa;
              var responseTemp = i2c.readSync(MPL3115A2_ADDRESS, MPL3115A2_REGISTER_TEMP_MSB , 2);
                
              temp = ((responseTemp[0] * 256) + (responseTemp[1] & 0xF0)) / 16
              cTemp = temp / 16.0
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
              var responsePressure = i2c.readSync(MPL3115A2_ADDRESS, MPL3115A2_CTRL_REG1_BAR , 4);
              pres = ((responsePressure[1] * 65536) + (responsePressure[2] * 256) + (responsePressure[3] & 0xF0)) / 16
              pressurehPa = (pres / 4.0)  /100

              // data.pressureMeta = pres
              data.pressure = pressurehPa;
   

              dataReady=true;
          }
      }
      return data;
  }

}


function blinkLED() { //function to start blinking
    yellowLED.writeSync(1); //set pin state to 1 (turn LED on)
    setTimeout(function(){
      yellowLED.writeSync(0);
  }, 1000);
  
}



// Create a Cloud IoT Core JWT for the given project id, signed with the given
// private key.
// [START iot_mqtt_jwt]
function createJwt(projectId, privateKeyFile, algorithm) {
  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
  const token = {
    iat: parseInt(Date.now() / 1000),
    exp: parseInt(Date.now() / 1000) + 1440 * 60, // 1440 minutes = 24h
    aud: projectId,
  };
  const privateKey = fs.readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, {algorithm: algorithm});
}
// [END iot_mqtt_jwt]

// Publish numMessages messages asynchronously, starting from message
// messagesSent.
// [START iot_mqtt_publish]

function fetchData(){

var mpl3115a2 = new MPL3115A2();
console.log(mpl3115a2.data());

// old sensor
  // let _temp = ds18b20.temperatureSync(serial);
  // var tzoffset = (new Date()).getTimezoneOffset() * 60000;
  // var data = {
  //   temp_house: _temp,
  //   datetime: new Date(Date.now()-tzoffset).toISOString().slice(0, 19).replace('T', ' '),  //add offset to match timezone of Poland
  // };

 
  var tzoffset = (new Date()).getTimezoneOffset() * 60000; // make adjustments to take into consideration timezonses
  var data = {
    temp_house: mpl3115a2.data().temp,
    pressure_house: mpl3115a2.data().pressure,
    datetime: new Date(Date.now()-tzoffset).toISOString().slice(0, 19).replace('T', ' '),  //add offset to match timezone of Poland
  };
  return data;
}

// [START iot_mqtt_run]
// The mqttClientId is a unique string that identifies this device. For Google
// Cloud IoT Core, it must be in the format below.
const mqttClientId = `projects/${argv.projectId}/locations/${
  argv.cloudRegion
}/registries/${argv.registryId}/devices/${argv.deviceId}`;

// With Google Cloud IoT Core, the username field is ignored, however it must be
// non-empty. The password field is used to transmit a JWT to authorize the
// device. The "mqtts" protocol causes the library to connect using SSL, which
// is required for Cloud IoT Core.
let connectionArgs = {
  host: argv.mqttBridgeHostname,
  port: argv.mqttBridgePort,
  clientId: mqttClientId,
  username: 'unused',
  password: createJwt(argv.projectId, argv.privateKeyFile, argv.algorithm),
  protocol: 'mqtts',
  secureProtocol: 'TLSv1_2_method',
};

// Create a client, and connect to the Google MQTT bridge.
let client = mqtt.connect(connectionArgs);

// Subscribe to the /devices/{device-id}/config topic to receive config updates.
// Config updates are recommended to use QoS 1 (at least once delivery)
client.subscribe(`/devices/${argv.deviceId}/config`, {qos: 1});

// Subscribe to the /devices/{device-id}/commands/# topic to receive all
// commands or to the /devices/{device-id}/commands/<subfolder> to just receive
// messages published to a specific commands folder; we recommend you use
// QoS 0 (at most once delivery)
client.subscribe(`/devices/${argv.deviceId}/commands/#`, {qos: 0});

// The MQTT topic that this device will publish data to. The MQTT topic name is
// required to be in the format below. The topic name must end in 'state' to
// publish state and 'events' to publish telemetry. Note that this is not the
// same as the device registry's Cloud Pub/Sub topic.
const mqttTopic = `/devices/${argv.deviceId}/${argv.messageType}`;

function sendData() { 
  var payload = fetchData(); 
 
  payload = JSON.stringify(payload); 
  console.log(mqttTopic, ': Publishing message:', payload); 
  client.publish(mqttTopic, payload, { qos: 1 });
  
  blinkLED(); //give visual feedback that message's been sent (yellow LED)
 
  console.log('Transmitting in 10*60 seconds'); 
  setTimeout(sendData, 10*60000); 
}


client.on('connect', success => {
  if(success)
  {
    console.log("Client connected...");
    redLED.writeSync(1); // give visual feedback that data collector is connected
    sendData();
  }else {
    console.log('Client not connected...'); 
  }
  // console.log('connect');
  // if (!success) {
  //   console.log('Client not connected...');
  // } else if (!publishChainInProgress) {
  //   publishAsync(1, argv.numMessages);
  // }
});

client.on('close', () => {
  console.log('close');
  redLED.writeSync(0); // give visual feedback that data collector has been disconnected
});

client.on('error', err => {
  console.log('error', err);
  redLED.writeSync(0);
});

client.on('message', (topic, message) => {
  let messageStr = 'Message received: ';
  if (topic === `/devices/${argv.deviceId}/config`) {
    messageStr = 'Config message received: ';
  } else if (topic === `/devices/${argv.deviceId}/commands`) {
    messageStr = 'Command message received: ';
  }

  messageStr += Buffer.from(message, 'base64').toString('ascii');
  console.log(messageStr);
});

client.on('packetsend', () => {
  // Note: logging packet send is very verbose
});

// Once all of the messages have been published, the connection to Google Cloud
// IoT will be closed and the process will exit. See the publishAsync method.
// [END iot_mqtt_run]
