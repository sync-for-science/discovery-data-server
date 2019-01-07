'use strict';

// S4S Discovery Data Server Participants web service
// File: participants.js
const version = '20181219';

// Required modules
const restifyClients = require('restify-clients');
const EventEmitter = require('events').EventEmitter;
const util = require('./utility');
const seedrandom = require('seedrandom');

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
   let groupReqStatus = {};	// Status of all requests to groups
   let clients = {};		// JSON clients making group requests
   let participantData = {};	// Results

   // Get array of group names for this participant
   let groupsForParticipant = config.groupsForParticipant(id);

   if (groupsForParticipant.length === 0) {
      // Try "old" (no groups) format
      getAllParticipantDataOld(id, callback);

//      // Invalid participant or no groups -- return empty obj
//      callback({});
   } 

   for (let groupName of groupsForParticipant) {
      // Get array of providers for this participant and group (each: { providerName: "name", patientId: "id", randLow: "low", randHigh: "high" })
      let providersForGroup = config.providersForGroup(id, groupName);

      // Verify the same patientId for all "providers" in this group
      let patientIds = [];
      for (let provider of providersForGroup) {
	 if (!patientIds.includes(provider.patientId)) {
	    patientIds.push(provider.patientId);
	 }
      }
      if (patientIds.length > 1) {
	 participantData[groupName] = {error: 'Multiple ids for group: ' + groupName, ids: patientIds.join()};
	 callback(participantData);
	 return;
      }

      // Get all resources for this group
      let firstProviderName = providersForGroup[0].providerName;
      let groupPatientId = providersForGroup[0].patientId;	// Same for all "providers" in group
      let groupUrlBase = providers[firstProviderName].base;
      let groupUrlPath = providers[firstProviderName].path.format(groupPatientId);

      // Create JSON client for accessing this group
      let groupClient = restifyClients.createJsonClient({
	 url: groupUrlBase,
	 headers: { group: groupName, id: id },    // To associate response with the correct group/request and distribute resources across "providers"
	 version: '*',
	 retry: { 
	    minTimeout: config.minRetryTimeout,
	    retries: config.retries
	 },
	 connectTimeout: config.providerConnectTimeout,
	 requestTimeout: config.providerRequestTimeout
      });

      // Add to client collection
      clients[groupName] = groupClient;

      // Status of the request to this group is initially "not ready"
      util.setNotReady(groupReqStatus, groupName)

      // Make the request to the group
      groupClient.get(groupUrlPath, function (err, req, res, obj) {

//	    const nodeUtil = require('util');
//	    const fs = require('fs');
//	    for (let item of [{name:'req',val:req}, {name:'res',val:res}, {name:'obj',val:obj}]) {
//	       fs.writeFile('/tmp/restify-{0}-dump.txt'.format(item.name), nodeUtil.inspect(item.val, {showHidden:true, depth:null}), function(err) {
//	          if (err) {
//		     return console.log(err);
//		  }
//	       });
//	    };

	 // Lookup group name, id (ASSUMES: req._headers will be accessible in future restify versions)
	 let groupNameFromRequest = req._headers.group;
	 let id = req._headers.id;

	 // Get array of providers for this participant and group (each: { providerName: "name", patientId: "id", randLow: "low", randHigh: "high" })
	 let providersForGroup = config.providersForGroup(id, groupNameFromRequest);

	 if (err) {
	    for (let provider of providersForGroup) {
	       // Return error info for each "provider" in this group
	       participantData[provider.providerName] = { error: err, providerName: provider.providerName };
	    }

	 } else {
//	    // Create a PRN (Pseudo Random Number) generator using the group name as seed
//	    let prn = seedrandom(groupNameFromRequest);
//
//	    // Generate PRN array to map resources
//	    let prnArray = [];
//	    for (let i = 0; i < obj.entry.length; i++) {
//	       prnArray[i] = prn();
//	    }

	    // Find the Patient resource
	    let patientResourceIndex = obj.entry.findIndex(elt => elt.resource.resourceType === 'Patient');
	     
	    // Distribute the resources across the "providers"
	    for (let provider of providersForGroup) {
	       // Copy the full set of resources
	       participantData[provider.providerName] = Object.assign({}, obj);

	       // Return the Patient resource plus the resources matching the random range for this "provider"
	       participantData[provider.providerName].entry = participantData[provider.providerName].entry.filter(
		  (elt,index) => {
		     if (index === patientResourceIndex) {
			return true;
		     } else {
			// Generate a pseudo-random number from the resource's ID
			let prn = seedrandom(elt.resource.id)();
			// Include this resource if within the defined random range
			return prn >= provider.randLow && prn < provider.randHigh;
		     }
		  }
	       );

//	       // Return the Patient resource plus the resources matching the random range for this "provider"
//	       participantData[provider.providerName].entry = participantData[provider.providerName].entry.filter(
//		  (elt,index) => (index === patientResourceIndex) ||
//				 (prnArray[index] >= provider.randLow && prnArray[index] < provider.randHigh)
//	       );

	       // Update the resource count
	       participantData[provider.providerName].total = participantData[provider.providerName].entry.length;
	    }
	 }

	 // Indicate results from this group are "ready"
	 if (util.setReady(groupReqStatus, groupNameFromRequest)) {
            // Results from ALL groups are "ready" -- return collected data
            callback(participantData);
	 }
      });
   }
}

// [OLD] Get all participant data for :id (NO GROUPS)
function getAllParticipantDataOld (id, callback) {
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

	 let providerName, providerUrlBase, providerUrlPath;
	 try {
            providerName = thisProvider.providerName;
            providerUrlBase = providers[providerName].base;
            providerUrlPath = providers[providerName].path.format(thisProvider.patientId);
	 } catch (e) {
	     // Invalid/malformed provider
	     let errResponse = {};
	     errResponse[thisProvider.providerName] = { error: 'Invalid/malformed provider: ' + thisProvider.providerName };
	     callback(errResponse);
	     return;
	 }

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
