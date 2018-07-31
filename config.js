'use strict';

// S4S Discovery Data Server
// File: config.js
const version = '20180727';

// Required modules
const argv = require('optimist').argv;
const fs = require('fs');

if (argv.help) {
   console.log('Usage: ' + argv.$0 + ' {--dev | --development}');
   process.exit();
}

var config = {};

// ----- COMMON -----
config.logLevel = 'info';
config.timezone = 'America/Los_Angeles';
config.providerConnectTimeout = 250;
config.providerRequestTimeout = 1000;
config.retries = 1;
config.minRetryTimeout = 250;

// ----- Per deployment -----
if (argv.dev || argv.development) {
   // DEVELOPMENT
   config.deploy = 'DEVELOPMENT';
   config.listenPort = 8081;
   config.logFile = 'discovery-data.log';
} else {
   // PRODUCTION (default)
   config.deploy = 'PRODUCTION';
   config.listenPort = 80;
   config.logFile = '/var/log/discovery-data.log';
}

// ----- Providers & Participants -----
config.providers = JSON.parse(fs.readFileSync('providers.json'));
config.participants = JSON.parse(fs.readFileSync('participants.json'));

// Return the array of available provider names
config.providerNames = function () {
   let names = [];
   for (let name in config.providers) {
      names.push(name);
   }
   return names;
}

// Return the array of providers for this participant (each { providerName: "name", patientId: "id" })
config.providersForParticipant = function (id) {
   const thisParticipant = config.participants[id];
   return thisParticipant ? thisParticipant.providers : [];
}


module.exports = config;
