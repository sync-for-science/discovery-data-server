'use strict';

// S4S Discovery Data Server Reference web service
// File: reference.js
const version = '20180802';

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

// The 'reference' call (GET /reference/:provider/:referencePath)
module.exports.reference = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {pre:    {desc: 'reference service', version: version},
	      desc:   'Get the :referencePath data bundle from provider :provider',
	      params: [{name: 'provider', desc: 'the URL-encoded provider name'},
		       {name: 'referencePath', desc: 'the URL-encoded path to the data bundle'}],
              return: 'The data for this reference.'};
   } else {
      getReferenceData(req.params.provider, req.params.referencePath, function (referenceData) {
	 // Return data to requestor
	 util.sendJson(req, res, referenceData);
      });  
      return next();
   }
};


//---------------------------------------------------------------------------------

// SUPPORT FUNCTIONS

// Get the :referencePath data bundle from provider :provider
function getReferenceData (providerName, referencePath, callback) {
   let provider = null;

   debugger;

   try {
      provider = config.providers[providerName];
   } catch (e) {};

   if (!provider) {
      // Invalid provider -- return empty obj
      callback({});

   } else {
      let providerClient = restifyClients.createJsonClient({
	 url: provider.base,
	 version : '*',
	 retry: {
	    minTimeout: config.minRetryTimeout,
	    retries: config.retries
	 },
	 connectTimeout: config.providerConnectTimeout,
	 requestTimeout: config.providerRequestTimeout
      });

      // Make the request to the provider
      providerClient.get(provider.refPath.format(referencePath), function (err, req, res, obj) {

//	    const nodeUtil = require('util');
//	    const fs = require('fs');
//	    for (let item of [{name:'req',val:req}, {name:'res',val:res}, {name:'obj',val:obj}]) {
//	       fs.writeFile('/tmp/restify-{0}-dump.txt'.format(item.name), nodeUtil.inspect(item.val, {showHidden:true, depth:null}), function(err) {
//	          if (err) {
//		     return console.log(err);
//		  }
//	       });
//	    };

	 // Return the response
	 callback( err ? {error:err} : obj );
      });
   }
}
