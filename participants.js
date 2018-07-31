'use strict';

// S4S Discovery Data Server Participants web service
// File: participants.js
const version = '20180727';

// Required modules
const restifyClients = require('restify-clients');
const EventEmitter = require('events').EventEmitter;
const util = require('./utility');

// Configuration (Kluge: config is read by all modules)
const config = require('./config');
const providers = config.providers;
const participants = config.participants;

// Setup for 'ready' event
module.exports = new EventEmitter();

// Send module 'ready' event to parent -- setTimeout() provides a "yield" so that wait is setup before emit
setTimeout(function () {
   module.exports.emit('ready');
});


//---------------------------------------------------------------------------------

// The 'participants' call (GET /participants)
module.exports.participants = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {pre:    {desc: 'participants service', version: version},
	      desc:   'Get the id, name, ... for each participant: { &lt;id&gt; : { name: &lt;name&gt;, ... }, ... }',
              return: 'The JSON object of participants:<div style="margin-left:30px;"><pre style="margin-top:0px;">'
	      	      + JSON.stringify(config.participants,null,3) + '</pre></div>'};
   } else {
      util.sendJson(req, res, config.participants);
      return next();
   }
};

// The 'participant data' call (GET /participants/:id)
module.exports.participantData = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {desc:   'Get data from all providers for participant :id',
       	      params: [{name: 'id', desc: 'the participant id'}],
              return: 'The data for this participant.'};
   } else {
      getAllParticipantData(req.params.id, function (participantData) {
	 // All data (and errors) have been collected -- return to requestor
	 util.sendJson(req, res, participantData);
      });
      return next();
   }
};


//---------------------------------------------------------------------------------

// SUPPORT FUNCTIONS

// Get all participant data for :id
function getAllParticipantData (id, callback) {
   var providerReqStatus = {};	// Status of all requests to providers
   var clients = {};		// JSON clients making provider requests
   var participantData = {};	// Results

   // Find the providers "registered" for this participant (id)
   var providersForParticipant = config.providersForParticipant(id);

   if (providersForParticipant.length == 0) {
      // Invalid participant or no providers -- return empty obj
      callback({});

   } else {
      for (let thisProvider of providersForParticipant) {

         let providerName = thisProvider.providerName;
         let providerUrlBase = providers[providerName].base;
         let providerUrlPath = providers[providerName].path.format(thisProvider.patientId);

         // Create JSON client for accessing this provider
         let providerClient = restifyClients.createJsonClient({
	    url: providerUrlBase,
	    headers: { provider: providerName },	// Used to associate response with the correct provider/request
	    version: '*',
	    retry: { 
	       minTimeout: config.minRetryTimeout,
	       retries: config.retries
	    },
	    connectTimeout: config.providerConnectTimeout,
	    requestTimeout: config.providerRequestTimeout
         });

         // Add to client collection
         clients[providerName] = providerClient;

         // Status of the request to this provider is initially "not ready"
         util.setNotReady(providerReqStatus, providerName)

         // Make the request to the provider
         providerClient.get(providerUrlPath, function (err, req, res, obj) {

//	    const nodeUtil = require('util');
//	    const fs = require('fs');
//	    for (let item of [{name:'req',val:req}, {name:'res',val:res}, {name:'obj',val:obj}]) {
//	       fs.writeFile('/tmp/restify-{0}-dump.txt'.format(item.name), nodeUtil.inspect(item.val, {showHidden:true, depth:null}), function(err) {
//	          if (err) {
//		     return console.log(err);
//		  }
//	       });
//	    };

	    // Lookup provider name (ASSUMES: req._headers will be accessible in future versions)
	    let providerNameFromRequest = req._headers.provider;

	    // Save the response
	    participantData[providerNameFromRequest] = err ? { error: err, providerName: providerNameFromRequest } : obj;

	    // Indicate results from this provider are "ready"
	    if (util.setReady(providerReqStatus, providerNameFromRequest)) {
	       // Results from ALL providers are "ready" -- return collected data
	       callback(participantData);
	    }
         });
      }
   }
}
