'use strict';

// S4S Discovery Data Server Providers web service
// File: providers.js
const version = '20180309';

// Required modules
const EventEmitter = require('events').EventEmitter;
const util = require('./utility');

// Configuration (Kluge: config is read by all modules)
const config = require('./config');

// Setup for 'ready' event
module.exports = new EventEmitter();

// Send module 'ready' event to parent -- setTimeout() provides a "yield" so that wait is setup before emit
setTimeout(function () {
    module.exports.emit('ready');
});


//---------------------------------------------------------------------------------

// The 'providers' call (GET /providers)
module.exports.providers = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {pre:    {desc: 'providers service', version: version},
              desc:   'Get the array of available provider names.',
              return: 'The JSON array of providers:<div style="margin-left:30px;">' + JSON.stringify(config.providerNames(), null, 3) + '</div>'};
   } else {
      util.sendJson(req, res, config.providerNames());
      return next();
   }
};

// The 'providers for participant' call (GET /providers/:id)
module.exports.providersForParticipant = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {desc:  'Get the array of providers for participant :id',
              params: [{name: 'id', desc: 'the participant id'}],
	      return: 'The JSON array of providers.'};
   } else {
      util.sendJson(req, res, config.providersForParticipant(req.params.id));
      return next();
   }
};
