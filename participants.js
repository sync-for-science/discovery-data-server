'use strict';

// S4S Discovery Data Server Participants web service
// File: participants.js
const version = '20191016';

// Required modules
const restifyClients = require('restify-clients');
const EventEmitter = require('events').EventEmitter;
const util = require('./utility');
const seedrandom = require('seedrandom');
const LocalStorage = require('node-localstorage').LocalStorage;

// Setup local storage
const localStorage = new LocalStorage('./localStorage');

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
	 util.sendJson(req, res, addAnnotations(req.params.id, participantData));
      });
      return next();
   }
};

// The participant create/update annotation call (POST /participants/:id/:provider/:resourceId)
module.exports.participantAnnotation = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {desc:   'Create/update annotation for participant :id, provider :provider, resourceId :resourceId',
	      params: [{name: 'id', desc: 'the participant id'},
		       {name: 'provider', desc: 'the provider name'},
		       {name: 'resourceId', desc: 'the resource id'}],
	      post:   [{name: 'annotation', desc: 'the annotation text'}],
	      return: '"OK" indicating successful creation/update of the annotation'};
   } else {
      annotate(req.params.id, req.params.provider, req.params.resourceId, req.body.annotation, function () {
	 util.sendText(req, res, 200, 'OK');
      });
      return next();
   }
};

//---------------------------------------------------------------------------------

// SUPPORT FUNCTIONS

// Get all participant data for :id
//   Note: this assumes unique org names!
function getAllParticipantData (id, callback) {
   let participantData = {};	// Results

   // Get array of group names for this participant (id)
   let groupsForParticipant = config.groupsForParticipant(id);

   if (groupsForParticipant.length > 0) {
      // Organize resources by group members
      process.stdout.write('ID: ' + id + ' Groups: ' + groupsForParticipant.length + '\n');
      getAllParticipantDataForGroups(participantData, groupsForParticipant, id, callback);
   }

   // Get the array of non-group providers for this participant (id)
   let providersForParticipant = config.providersForParticipant(id).filter(prov => !config.providers[prov.providerName].group);

   // Divide into useOrg and not useOrg
   let providersForParticipantUseOrg = providersForParticipant.filter(prov => providers[prov.providerName].useOrg);
   let providersForParticipantNoOrg = providersForParticipant.filter(prov => !providers[prov.providerName].useOrg);

   if (providersForParticipantUseOrg.length > 0) {
      // Organize resources by providing organization
      process.stdout.write('ID: ' + id + ' Orgs: ' + providersForParticipantUseOrg.length + '\n');
      getAllParticipantDataNoGroups(participantData, providersForParticipantUseOrg, id, organizeResources, callback);
   }

   if (providersForParticipantNoOrg.length > 0) {
      // Organize resources using "old" (no groups/org) format
      process.stdout.write('ID: ' + id + ' Non-group/orgs: ' + providersForParticipantNoOrg.length + '\n');
      getAllParticipantDataNoGroups(participantData, providersForParticipantNoOrg, id,
				    (participantData, defaultName, participantId, obj) => participantData[defaultName] = obj, callback);
   }
      
   if (groupsForParticipant.length === 0 && providersForParticipant.length === 0) {
      // Invalid participant or no providers -- return empty obj
      callback({});
   }	 
}

// Get all participant data for :id (with GROUPS)
function getAllParticipantDataForGroups (participantData, groupsForParticipant, id, callback) {
   let groupReqStatus = {};	// Status of all requests to groups
   let clients = {};		// JSON clients making group requests

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
//      groupClient.get(groupUrlPath, function (err, req, res, obj) {
      let urlPath = groupUrlPath + (config.requestCount ? `?_count=${config.requestCount}` : '');
      let result;
      let resourceHash = {};
      getAllDataFromProvider(groupClient, groupUrlBase, groupUrlPath+`?_count=${config.requestCount}`, result, resourceHash, function (err, req, res, obj) {

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

// Get all participant data for :id
function getAllParticipantDataNoGroups (participantData, providersForParticipant, id, storeResourcesFn, callbackFn) {
   let providerReqStatus = {};	// Status of all requests to providers
   let clients = {};		// JSON clients making provider requests

   for (let thisProvider of providersForParticipant) {

      let providerName, providerUrlBase, providerUrlPath;
      try {
         providerName = thisProvider.providerName;
         providerUrlBase = providers[providerName].base;
	 process.stdout.write('base: ' + providers[providerName].base + '\n');
         providerUrlPath = providers[providerName].path.format(thisProvider.patientId);
      } catch (e) {
	 // Invalid/malformed provider
	 let errResponse = {};
	 errResponse[thisProvider.providerName] = { error: 'Invalid/malformed provider: ' + thisProvider.providerName };
	 callbackFn(errResponse);
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
      let urlPath = providerUrlPath + (config.requestCount ? `?_count=${config.requestCount}` : '');
      let result;
      let resourceHash = {};
      getAllDataFromProvider(providerClient, providerUrlBase, urlPath, result, resourceHash, function (err, req, res, obj) {

//	 const nodeUtil = require('util');
//	 const fs = require('fs');
//	 for (let item of [{name:'req',val:req}, {name:'res',val:res}, {name:'obj',val:obj}]) {
//	    fs.writeFile('/tmp/restify-{0}-dump.txt'.format(item.name), nodeUtil.inspect(item.val, {showHidden:true, depth:null}), function(err) {
//	       if (err) {
//	          return console.log(err);
//	       }
//	    });
//	 };

	 // Lookup provider name (ASSUMES: req._headers will be accessible in future versions)
	 let providerNameFromRequest = req._headers.provider;

	 // Save the response
	 if (err) {
	    participantData[providerNameFromRequest] = { error: err, providerName: providerNameFromRequest, response: obj };   
	 } else {	 
	    storeResourcesFn(participantData, providerNameFromRequest, id, obj);
	 }

	 // Indicate results from this provider are "ready"
	 if (util.setReady(providerReqStatus, providerNameFromRequest)) {
	    // Results from ALL providers are "ready" -- return collected data
	    callbackFn(participantData);
	 }
      });
   }
}

function extractUrlPath(base, url) {
   // Return everything after 'base'. Add an initial '/' if missing
   let path = url.substring(base.length);
   return path.charAt(0) === '/' ? path : '/' + path;
}

// Collect all resources from this provider (may require multiple fetches)
function getAllDataFromProvider(providerClient, providerUrlBase, providerUrlPath, result, resourceHash, callbackFn) {
   providerClient.get(providerUrlPath, function (err, req, res, bundle) {
      if (err) {
	 callbackFn(err, req, res, bundle);
      } else {
	 process.stdout.write(providerUrlPath+'\n');
	 if (!result) {
	    // Set initial result
	    result = Object.assign({}, bundle);
	    result.entry = [];
	    result.link = result.link.filter(link => link.relation !== 'next');	// Dump the 'next' link
	    result.total = 0;
	 }
	 // Add to prior results
	 addNewResources(resourceHash, result, bundle)
	  
	 // More data to fetch?
	 let nextLink = bundle.link.find(link => link.relation === 'next');
//	 process.stdout.write('nextLink: ' + JSON.stringify(nextLink, null, 3) + '\n');
	 if (!nextLink) {
	    callbackFn(err, req, res, result);
	 } else {
//	    process.stdout.write('path: ' + extractUrlPath(providerUrlBase, nextLink.url) + '\n');
	    getAllDataFromProvider(providerClient, providerUrlBase, extractUrlPath(providerUrlBase, nextLink.url), result, resourceHash, callbackFn);
	 }
      }
   });
}

// Add resources not already in the results
function addNewResources(resourceHash, result, bundle) {
   if (bundle.entry) {
      for (let res of bundle.entry) {
	  if (!resourceHash.hasOwnProperty(res.resource.id)) {
//	     process.stdout.write(' Added: ' + res.resource.id + '\n');
	     result.entry.push(res);
	     result.total++;
	     resourceHash[res.resource.id] = true;
	  } else {
//	     process.stdout.write(' ***DUP: ' + res.resource.id + '\n');
	  }
      }
   }
}

// Organize resources by the providing organization
function organizeResources(participantData, defaultName, participantId, obj) {
   let patient;		// Patient resource
   let encs = {};	// Collection of encounters ( Encounter/{id}: "Organization/{id}" )
   let claims = {};	// Collection of claims ( Claim/{id}: "Organization/{id}" )
   let orgs = {};	// Collection of organizations ( Organization/{id}: "org name" or {GUID}: "org name" )

   // First pass -- collect Patient, Encounters, Organizations
   for (let elt of obj.entry) {
      switch (elt.resource.resourceType) {
	 case 'Patient':
	    patient = elt;
	    break;

	 case 'Encounter':
	    encs['Encounter/'+elt.resource.id] = elt.resource.serviceProvider.reference;
	    break;

	 case 'Claim':
	    claims['Claim/'+elt.resource.id] = elt.resource.organization.reference;
	    break;

	 case 'Organization':
	    orgs['Organization/'+elt.resource.id] = elt.resource.name;		// By org id
	    orgs[elt.resource.identifier[0].value] = elt.resource.name;		// By GUID/hash
	    break;

	 default:
	    break;
      }
   }

   // Setup results structure
   let results = {};
   for (let org in orgs) {
      let orgName = orgs[org];
      if (!results[orgName]) {
	 results[orgName] = {
	    resourceType: 'Bundle',
	    total: 1,
	    entry: [ patient ]		// first resource for this individual for each provider/organization
	 };
      }
   }

   // Second pass -- collect results by actual provider name
   for (let elt of obj.entry) {
      switch (elt.resource.resourceType) {
	 case 'Patient':
	 case 'Organization':
	 case 'Practitioner':
	    break;

	 case 'Encounter':
	    results[orgs[elt.resource.serviceProvider.reference]].entry.push(elt);
	    results[orgs[elt.resource.serviceProvider.reference]].total++;
	    break;

	 case 'Claim':
	    results[orgs[elt.resource.organization.reference]].entry.push(elt);
	    results[orgs[elt.resource.organization.reference]].total++;
	    break;

	 case 'ExplanationOfBenefit':
	    if (elt.resource.organization) {
	       results[orgs[elt.resource.organization.identifier.value]].entry.push(elt);
	       results[orgs[elt.resource.organization.identifier.value]].total++;
	    } else if (elt.resource.claim) {
	       results[orgs[claims[elt.resource.claim.reference]]].entry.push(elt);
	       results[orgs[claims[elt.resource.claim.reference]]].total++;
	    } else {
	       process.stdout.write(`NO REFERENCE (${participantId}): ExplanationOfBenefit ID: ${elt.resource.id}\n`);
	    }
	    break;

	 default:
	    if (elt.resource.encounter) {
	       results[orgs[encs[elt.resource.encounter.reference]]].entry.push(elt);
	       results[orgs[encs[elt.resource.encounter.reference]]].total++;
	    } else if (elt.resource.context) {
	       results[orgs[encs[elt.resource.context.reference]]].entry.push(elt);
	       results[orgs[encs[elt.resource.context.reference]]].total++;
	    } else {
	       process.stdout.write(`NO REFERENCE (${participantId}): ${elt.resource.resourceType} ID: ${elt.resource.id}\n`);
	    }
	    break;
      }
   }

   // Merge results into collected data
   Object.assign(participantData, results);
}

function stripTags(text) {
   return text ? text.replace(/<[^>]*>/g, '') : '';
}

//
// Create/update the annotation for id, provider, resourceId
//
function annotate(id, provider, resourceId, newText, callback) {
   let key = id;
   let subKey = `${provider}_${resourceId}`;
   let annotationsForKey = localStorage.getItem(key);
   let annotationsObj;
   let timestamp = new Date();
   let newTextClean = stripTags(newText);	// remove html tags

   if (annotationsForKey) {
      // There are existing annotations for this id
      annotationsObj = JSON.parse(annotationsForKey);
      let annotationForSubKey = annotationsObj[subKey];
      let newAnnotationForSubKey;

      if (annotationForSubKey) {
	 // Update previous annotation for this subKey
	 newAnnotationForSubKey = { created: annotationForSubKey.created,
				    annotationHistory: annotationForSubKey.annotationHistory.concat({ updated: timestamp, annotationText: newTextClean }) };

      } else {
	 // Create new annotation for this subKey
	 newAnnotationForSubKey = { created: timestamp, annotationHistory: [{ updated: timestamp, annotationText: newTextClean }] };
      }

      // Update subKey prop of object
      annotationsObj[subKey] = newAnnotationForSubKey;
       
   } else {
      // Initialize annotations for this id
      annotationsObj = {};
      annotationsObj[subKey] = { created: timestamp, annotationHistory: [{ updated: timestamp, annotationText: newTextClean }] };
   }

//   console.log('key: ' + key);
//   console.log('new value: ' + JSON.stringify(annotationsObj, null, 3));

   localStorage.setItem(key, JSON.stringify(annotationsObj));
   callback();
}

//
// Add annotations to retrieved data for id
//
function addAnnotations(id, data) {
   let annotationsForId = localStorage.getItem(id);
   let annotationsObj = annotationsForId ? JSON.parse(annotationsForId) : {};

//   console.log(JSON.stringify(annotationsObj, null, 3));

   for (let provider in data) {
      for (let elt of data[provider].entry) {
	 let subKey = `${provider}_${elt.resource.id}`;
	 let annotation = annotationsObj[subKey];
	 if (annotation) {
//	    console.log(`   ${provider} - ${elt.resource.id}:`);
//	    console.log(`   ${JSON.stringify(annotation, null, 3)}`);
	    elt.resource['discoveryAnnotation'] = annotation;
	 }
      }
   }

   return data;
}
