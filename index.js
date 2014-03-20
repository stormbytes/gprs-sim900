var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Packetizer = require('./packetizer.js');
var Postmaster = require('./postmaster.js');

function GPRS (hardware, secondaryHardware, baud) {
  /*
  constructor

  args
    hardware
      the tessel port to be used for priary communication
    secondaryHardware
      the additional port that can be used for debug purposes. not required. Typically, D/A will be primary, C/B will be secondary
    baud
      override the defualt baud rate of 115200 if necessary (for software UART)
  */
  var self = this;

  baud = baud || 9600;

  self.hardware = hardware;
  self.uart = new hardware.UART({baudrate: baud});
  self.power = hardware.gpio(3).high();
  self.packetizer = new Packetizer(self.uart);
  self.packetizer.packetize();
  //  the defaults are fine for most of Postmaster's args
  self.postmaster = new Postmaster(self.packetizer, ['OK', 'ERROR']);

  //  second debug port is optional and largely unnecessary
  // self.debugHardware = null;
  //  ring indicator can be useful, though
  // self.ringIndicator = null;
  // console.log('sech:\t', secondaryHardware);
  if (secondaryHardware) {//arguments.length > 2) {
    self.debugHardware = secondaryHardware;
    self.debugUART = secondaryHardware.UART({baudrate: 115200});
    self.ringIndicator = secondaryHardware.gpio(3);
    self.debugPacketizer = new Packetizer(self.debugUART);
    self.debugPacketizer.packetize();
  }
}

util.inherits(GPRS, EventEmitter)

function use(hardware, debug, baud, callback) {
  /*
  connect the gprs module and establish contact, then call the callback

  args
    hardware
      the tessel port to use for the main GPRS hardware
    debug
      the debug port, if any, to use (null most of the time)
    baud
      alternate baud rate for the UART
    callback
      what to call once you're connected to the module

    callback parameters
      err
        error, if any, while connecting
      contacted
        did we establish contact or not? t/f
  */
  callback = callback || function() {;};
  var radio = new GPRS(hardware, debug, baud);
  radio.establishContact(callback);
  return radio;
}

GPRS.prototype.txrx = function(message, patience, callback) {
  /*
  every time we interact with the sim900, it's through a series of uart calls and responses. this fucntion makes that less painful.

  args
    message
      string you're sending, ie 'AT'
    patience
      milliseconds until we stop listening. it's likely that the module is no longer responding to any single event if the reponse comes too much after we ping it.
    callback
      callback function
    
  callback parameters
    err
      error object
    recieved
      the reply recieved within the interval
  */
  
  var self = this;

  message  = message  || 'AT';
  patience = patience || 250;
  callback = callback || ( function(err, arg) { 
    if (err) {
      console.log('err:\n', err);
    }
    else {
      console.log('reply:\n', arg);
    };
  });
  //  it's a virtue, but mostly the module won't work if you're impatient
  patience = Math.max(patience, 100);

  self.postmaster.send(message, patience, callback);
}

GPRS.prototype.togglePower = function() {
  /*
  turn the module on or off by switching the power buton (G3) electronically
  */
  var self = this;
  self.power.high();
  setTimeout(function() {
    self.power.low();
    setTimeout(function() {
      self.power.high();
      setTimeout(function() {
        self.emit('powertoggled');
      }, 3000);
    }, 1000);
  }, 100);
}

GPRS.prototype.establishContact = function(callback, rep, reps) {
  /*
  make contact with the GPRS module, emit the 'ready' event

  args
    callback
      callback function
    rep
      how many times ahve we tried?
    reps
      how many times until we give up

  callback parameters
    err
      an error
    contacted
      true/false
  */

  var self = this;
  rep = rep || 0;
  reps = reps || 5;

  self.postmaster.send('AT', 1000, function(err, data) {
    //  too many tries = fail

    console.log('------>\trep ' + rep + ' of ' + reps + '\n\t\terr:\n' + [err] + '\n\t\tdata:\n' + [data] + '\n');

    if (rep > reps) {
      console.log('FAILED TO CONNECT TO MODULE');
      callback(err, false);
    }
    //  if we timeout on an AT, we're probably powered off. toggle the power button and try again
    else if (err && err.message === 'no reply after 1000 ms to message "AT"') {
      self.togglePower();
      console.log('---> module appears off on trial ' + rep);
      self.once('powertoggled', function() {
        console.log('---> power toggled, trying to connect again');
        self.establishContact(callback, rep + 1, reps);
      })
    }
    //this is where we want to be
    else if (data.length === 2 && data[0] === 'AT' && data[1] === 'OK') {
      console.log('success')
      self.emit('ready');
      if (callback) {
        callback(null, true);
      }
    }
    else if (err && err.message != 'Postmaster busy') {
      console.log('---> postmaster busy on rep', rep + '. [err]:\t', [err], '\n[data]:\t', [data], '\n\ttry again');
      self.establishContact(callback, rep + 1, reps);
    }
    else {
      console.log('else')
      setTimeout(function() {
        self.establishContact(callback, rep + 1, reps);
      }, 1200);
    }
  });
}

GPRS.prototype.sendSMS = function(number, message, callback) {
  /*
  send an SMS to the specified number

  args
    number
      a string representation of the number. must be at least 10 digits
    message
      a string to send
    callback
      callback function

  callback parameters
    none
  */

  var self = this;

  number = String(number) || '15555555555';
  message = message || 'text from a Tessel';
}

GPRS.prototype.dial = function(number, callback) {
  /*
  call the specified number

  args
    number
      a string representation of the number. must be at least 10 digits
    callback
      callback function

  callback parameters
    call
      a call object
  */

  var self = this;
}

GPRS.prototype.answerCall = function(callback) {
  /*
  answer an incoming voice call

  args
    callback
      callback function

  callback parameters
    call
      a call object
  */

  var self = this;
}

GPRS.prototype.ignoreCall = function(callback) {
  /*
  ignore an incoming voice call

  args
    callback
      callback function

  callback parameters
    none
  */

  var self = this;
}

GPRS.prototype.readSMS = function(messageNumber, callback) {
  /*
  answer an incoming voice call

  args - two possibilities
    messageNumber
      the index of the message to read. if not specified, the newest message is read
    callback
      callback function

  callback parameters
    err
      error
    message
      the SMS string
  */

  var self = this;
}


module.exports.GPRS = GPRS;
module.exports.use = use;
module.exports.txrx = txrx;
module.exports.establishContact = establishContact;
module.exports.sendSMS = sendSMS;
module.exports.dial = dial;
module.exports.answerCall = answerCall;
module.exports.ignoreCall = ignoreCall;
module.exports.readSMS = readSMS;