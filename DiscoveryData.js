'use strict';

// S4S Discovery Data Services
// File: DiscoveryData.js
const version = '20200815';

// Required modules
const restify = require('restify');
const Logger = require('bunyan');
const moment = require('moment');
const util = require('./utility');

// Configuration
const config = require('./config');

// Create a file logger enabling the standard serializers
const logInst = Logger.createLogger({
    	name: 'DiscoveryData',
	serializers: Logger.stdSerializers,
    	streams: [
		{
		   type: 'file',
		   path: config.logFile,
		   level: config.logLevel
		}]
});

// Setup restify
const server = restify.createServer({name: 'S4S Discovery Data Server', version: '1.3.0', log: logInst});
server.use(restify.plugins.bodyParser());

// CORS support
server.pre(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', '*');
    next();
});

// Correctly handle HTTP OPTIONS (for CORS)
server.on('MethodNotAllowed', function (req, res) {
    if (req.method == 'OPTIONS') {
	    // Add header to satisfy CORS preflight check
	    res.header('Access-Control-Allow-Headers', 'content-type, x-requested-with');
	    res.send('');
    } else {
	    logInst.info({req: req}, 'Method Not Allowed: ' + req.method + ' ' + req.path);
	    res.header('content-type', 'text/plain');
	    res.send(405, 'Method Not Allowed\n');
    }
});

// Log 'Not Found' errors
server.on('NotFound', function (req, res) {
    logInst.info({req: req}, 'Not Found');
    res.header('content-type', 'text/plain');
    res.send(404, 'Not Found\n');
});

// Log completion
process.on('SIGINT', function () {
    var msg = 'Stopped: ' + moment().format('YYYYMMDD-HH:mm:ss');
    logInst.info(msg);
    console.log('\n'+msg);
    process.exit();
})

// Keep track of which service modules are ready
var isReady = {};
util.setNotReady(isReady, 'providers');
util.setNotReady(isReady, 'participants');
util.setNotReady(isReady, 'reference');
util.setNotReady(isReady, 'data');

// ---------- Document the available routes --------------------
server.get('/', documentRoutes);


// ---------- Configure the 'providers' service --------------------
var providers = require('./providers');
providers.on('ready', function () {
    // Check whether all services are ready
    if (util.setReady(isReady, 'providers')) {
	    // Yes -- start listening for requests
	    listen();
    }
});

// Allowed 'providers' methods and routes
server.get('/providers', providers.providers);
server.get('/providers/:id', providers.providersForParticipant);


// ---------- Configure the 'participants' service --------------------
var participants = require('./participants');
participants.on('ready', function () {
     // Check whether all services are ready
    if (util.setReady(isReady, 'participants')) {
        // Yes -- start listening for requests
        listen();
    }
});

// Allowed 'participants' methods and routes
server.get('/participants', participants.participants);
server.get('/participants/:id', participants.participantData);
server.post('/participants/:id/:provider/:resourceId', participants.participantAnnotation);


// ---------- Configure the 'reference' service --------------------
var reference = require ('./reference');
reference.on('ready', function () {
    // Check whether all services are ready
    if (util.setReady(isReady, 'reference')) {
	// Yes -- start listening for requests
	listen();
    }
});

// Allowed 'reference' methods and routes
server.get('/reference/:provider/:referencePath', reference.reference);


// ---------- Configure the 'data' service --------------------
var data = require ('./data');
data.on('ready', function () {
    // Check whether all services are ready
    if (util.setReady(isReady, 'data')) {
	// Yes -- start listening for requests
	listen();
    }
});

// Allowed 'data' methods and routes
server.get('/data/manifest', data.manifest);
server.put('/data/upload/:id', binaryParser, data.upload);
server.get('/data/download/:id', data.download);


//---------------------------------------------------------------------------------

// SUPPORT FUNCTIONS

// Binary data parser
function binaryParser (req, res, next) {
   if (req.contentType() !== 'application/octet-stream' ) {
      next();

   } else {
      let buffer = [];

      req.on('error', next);

      req.on('data', function onRequestData(chunk) {
	 buffer.push(chunk);
      });

      req.once('end', function() {
	 req.body = Buffer.concat(buffer).toString('binary');
	 next();
      });
   }
}

// Document routes
function documentRoutes (req, res, next) {
    if (req == undefined) {
        // Return documentation
        return {pre:  {desc:server.name + ' -- All Valid Routes', version:version},
                desc: 'Show this page (all valid ' + config.deploy + ' routes).'};
    } else {
        res.writeHead(200);
        res.end(util.documentRestifyRoutes(server));
        return next();
    }
}

// Start listening...
function listen () {
    server.listen(config.listenPort, function() {
	    var msg = 'Started: {0} {1} Listening at {2} ({3})'.format(moment().format('YYYYMMDD-HH:mm:ss'), server.name, server.url, config.deploy);
	    logInst.info(msg);
	    console.log(msg);
    });
}
