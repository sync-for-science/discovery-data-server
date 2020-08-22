'use strict';

// S4S Discovery Data Server Providers web service
// File: data.js
const version = '20200822';

// Required modules
const EventEmitter = require('events').EventEmitter;
const sanitize = require('sanitize-filename');
const fs = require('fs');
const JSZip = require('jszip');
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

// The 'manifest' call (GET /data/manifest)
module.exports.manifest = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {pre:    {desc: 'data service', version: version},
              desc:   'Create a new upload/download repository and return the Procure manifest',
              return: 'The JSON object containing Procure manifest properties: name, uploadUrl, infoUrl, continueLabel, continueUrl, and successMessage'};

   } else {
      util.sendJson(req, res, createManifest());
      return next();
   }
};

// The 'upload' call (PUT /data/upload/:id)
module.exports.upload = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {desc:  'Upload data for this previously defined (via manifest) :id',
              params: [{name: 'id', desc: 'the upload/download id'}],
	      post:   [{name: 'data', desc: 'the uploaded data'}],
	      return: '"OK" indicating successful data upload'};
   } else {
      saveUploadedData(req, res, req.params.id, err => {
	 if (err) {
	    res.send(400, err.message);
	 } else {
	    util.sendText(req, res, 200, 'OK');
	 }
      });

      return next();
   }
};

// The 'download' call (GET /data/download/:id)
module.exports.download = function (req, res, next) {
   if (req == undefined) {
      // Return documentation
      return {desc:  'Download data for this previously defined (via manifest) :id',
              params: [{name: 'id', desc: 'the upload/download id'}],
	      return: 'The JSON object containing the uploaded data'};

   } else {
      downloadData(req, res, req.params.id, (err, data) => {
	 if (err) {
	    res.send(400, err.message);
	 } else {
	    util.sendJson(req, res, data);
	 }
      });

      return next();
   }
};

//---------------------------------------------------------------------------------

// SUPPORT FUNCTIONS

// Return the JSON object containing Procure manifest properties:
//    name, uploadUrl, infoUrl, continueLabel, continueUrl, and successMessage
function createManifest() {
   let id = (new Date()).getTime();
   return {
      name: config.dataName,
      uploadUrl: config.dataUploadUrl(id),
      infoUrl: config.dataInfoUrl,
      continueLabel: config.dataContinueLabel,
      continueUrl: config.dataContinueUrl(id),
      successMessage: config.dataSuccessMessage
   };
}

// Write uploaded data for this previously defined (via manifest) :id
//    Calls 'callback' with the err object from writeFile()
function saveUploadedData(req, res, id, callback) {
   let uploadDir = `${__dirname}/${config.uploadDir}`;
   fs.mkdir(uploadDir, { recursive: true }, err => {
      if (err) {
	 callback(err);
      } else {
	 let fileName = `${uploadDir}/${sanitize(id)}.zip`;
	 fs.writeFile(fileName, req.body, 'binary', err => {
	    callback(err);
	 });
      }
   });
}

// Download data for this previously defined (via manifest) :id
//   Calls 'callback' with an err object (or null if no error) and the JSON object containing the uploaded data
function downloadData(req, res, id, callback) {
   let fileName = `${__dirname}/${config.uploadDir}/${sanitize(id)}.zip`;

   fs.readFile(fileName, function(err, fileContents) {
      if (err) {
	 if (err.code === 'ENOENT') {
	    // Doesn't exist
	    callback(null, {});
	 } else {
	    callback(err, null);
	 }
      } else {
	 let results = {};
	 let resources = {};
	 JSZip.loadAsync(fileContents)
	      .then(function (zip) {
		 zip.forEach((relativePath, file) => {
		    if (file.dir) {
		       // Initialize this provider
		       let provDirName = file.name;
		       let provName = provDirName.slice(0, -1);
		       let filesToLoad = zip.filter((r, f) => r.startsWith(provDirName) && r.endsWith('.json'));	// IGNORE ATTACHMENTS
		       resources[provName] = {};
		       resources[provName].remaining = filesToLoad.length;
		       resources[provName].resources = [];

		       // Process files for this provider
		       filesToLoad.forEach(file => {
			  file.async('string')
			      .then(function success(content) {
				 // Accumulate resources for this file
				 let res = JSON.parse(content).entry;
				 if (res) {
				    // Files has resources
				    resources[provName].resources = resources[provName].resources.concat(res);
				 }
				 resources[provName].remaining--;

				 if (resources[provName].remaining === 0) {
				    // Finished this provider -- save in results
				    results[provName] = {
				       resourceType: 'Bundle',
				       total: resources[provName].resources.length,
				       entry: resources[provName].resources
				    }

				    // Check for all complete
				    if (Object.keys(resources).every(prov => resources[prov].remaining === 0)) {
				       callback(null, results);

				       // No longer need uploaded file
//				       fs.unlink(fileName, err => {
//					  if (err) {
//					     console.error(err);
//					  }
//				       });
				    }
				 }
			      });
		       })
		    }
		 });
	      })
      }
   });
}
