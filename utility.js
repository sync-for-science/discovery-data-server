'use strict';

// S4S Discovery utilities
// File: utility.js
const version = '20180308';

// Required modules
const moment = require('moment-timezone');
const fs = require('fs');
const Handlebars = require('handlebars');

// Configuration
const config = require('./config');

// Add an 'ifarray' block helper to Handlebars
Handlebars.registerHelper('ifarray', function (context, options) {
   var type = Object.prototype.toString.call(context);
   if (type === '[object Function]') { context = context.call(this); }

   if (!context || Handlebars.Utils.isEmpty(context) || type != '[object Array]') {
      return options.inverse(this);
   } else {
      return options.fn(this);
   }
});

// Handlebars template file for documentRestifyRoutes()
const documentTemplate = Handlebars.compile(fs.readFileSync(__dirname + '/template.html', 'utf8'));

// Create a list of '($1,$2,...,$len)' with no offset
//   or a list of '($n,$n+1,...)' with offset=n
exports.placeHolderList = function (len, offset) {
   var h = new Array(len);
   var start = (offset == undefined) ? 0 : offset;
   for (var i = 0; i < len; i++)
      h[i] = '$' + (start+i+1);
   return '(' + h.join(',') + ')';
};

// Determine the type of obj (by hacking apart '[object Array]' etc.)
exports.typeOf = function (obj) {
   return Object.prototype.toString.call(obj).split(' ')[1].slice(0, -1);
};

// Add a format method to String: 'hello {1} {2}'.format('there', '.') --> 'hello there.'
String.prototype.format = function() {
   var formatted = this;
   for (var i = 0; i < arguments.length; i++) {
      var regexp = new RegExp('\\{'+i+'\\}', 'gi');
      formatted = formatted.replace(regexp, arguments[i]);
   }
   return formatted;
};

// Functions to determine whether a set of asynchronous components are all "ready"
//   (this could be done with a counter, but then harder to observe)

// Set the tracking structure's element for this named component to "not ready"
exports.setNotReady = function (isReady, name) {
   isReady[name] = false;
};

// Set the tracking structure's element for this named component to "ready"
//   and return true if ALL elements are "ready"
exports.setReady = function (isReady, name) {
   isReady[name] = true;

   for (var key in isReady) {
      if (isReady.hasOwnProperty(key) && !isReady[key]) {
	 // At least one element is not "ready"
	 return false;
      }
   }

   // All elements are "ready"
   return true;
};

// Convert 'from' strings to 'to' strings (change case, instantiate parameters, etc.)
// 'struct' is a string or structured data object (hash).
// 'mapArray' is an array of objects, each containing a 'from' and 'to' member.
exports.remap = function (struct, mapArray) {
   var result = (exports.typeOf(struct) == 'String') ? struct : JSON.stringify(struct);
   for (var i = 0; i < mapArray.length; i++) {
      var map = mapArray[i];
      var regExp = new RegExp(map.from, 'g');
      result = result.replace(regExp, map.to);
   }

   return (exports.typeOf(struct) == 'String') ? result : JSON.parse(result);
};

// Create group structure
// 'array' is the set of elements to group
// 'predicate' is the function to select the item of each element to group on
exports.groupBy = function (array, predicate) {
   var groups = {};
   for (var i = 0; i < array.length; i++) {
      var groupKey = predicate(array[i]);
      if (groups[groupKey] == undefined) {
         groups[groupKey] = [];
      }
      groups[groupKey].push(array[i]);
   }
   return groups;
};

// Order the array 'array' (MODIFIES THE ARRAY!)
// 'dir' is 'ascending' for ascending order, else descending order
// 'select' is the function to select the item of each element to order on
exports.orderBy = function (array, dir, select) {
   var isAscending = (dir == 'ascending');
   return array.sort(function (a, b) {
      var predA = select(a);
      var predB = select(b);
      return predA < predB ? (isAscending ? -1 : 1) : predA > predB ? (isAscending ? 1 : -1) : 0;
   })
};

// Send text response (with headers)
exports.sendText = function (req, res, code, val) {
   var strVal = val.toString();
   req.log.info({req:req}, strVal);
   res.header('Access-Control-Allow-Headers', 'content-type, x-requested-with');
   res.header('content-type', 'text/plain');
   res.send(code, strVal);
};

// Send JSON response (with headers)
// TODO: Check for Accept-Encoding header & compress response
exports.sendJson = function (req, res, val) {
   req.log.info({req: req}, val);
   res.header('Access-Control-Allow-Headers', 'content-type, x-requested-with');
   res.json(val);
};

// Document restify routes
exports.documentRestifyRoutes = function (server) {
   // Collect documentation
   var calls = {};
   var callUrls = [];
   for (var route in server.routes) {
      if (server.routes.hasOwnProperty(route)) {
         try {
            // Get documentation from route's function (if defined)
            var doc = server.routes[route][2]();

	    // Add route info
	    var spec = server.router.mounts[route].spec;
	    var route = spec.method + ' ' + spec.path;
	    var id = makeId(route);
	    doc.url = {route:route, id:id};

	    // Construct 'calls' element (for Javascript create/edit)
	    var elt = {path: route.split(' ')[1]};
	    if (doc.params != undefined) {
	       elt.params = doc.params;
	    };
	    if (doc.post != undefined) {
	       elt.post = doc.post;
	    };
	    calls[id] = elt;

            // Add doc to 'callUrls' (for page display)
            callUrls.push(doc);

         } catch (e) {}
      }
   }

   // Construct date & time
   var timestamp = moment().format('D MMMM YYYY h:mm:ss A ') + moment.tz(moment.tz.guess()).zoneAbbr();

   // Populate the template
   return documentTemplate({calls:JSON.stringify(calls), callUrls:callUrls, timestamp:timestamp, deployMode:config.deploy, serverName:server.name});
}

// "Squish" a route into an identifier (remove spaces and colons, replace forward slash with underscore)
function makeId(route) {
   return route.replace(/ /g, '').replace(/:/g, '').replace(/\//g, '_');
}
