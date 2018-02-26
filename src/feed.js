'use strict';

const http = require('http');
const path = require('path');
const parseXML = require('xml2js').parseString;
const cleanHTML = require('htmlclean');
const props = require('../agency.json');

const TF = require('right-track-transit/src/TransitFeed');
const TransitFeed = TF.TransitFeed;
const TransitDivision = TF.TransitDivision;
const TransitLine = TF.TransitLine;
const TransitEvent = TF.TransitEvent;


// Feed Cache
let CACHE = undefined;
let CACHE_UPDATED = new Date(0);


/**
 * Load the MTA Transit Feed
 * @param {function} callback Callback function
 * @param {Error} callback.error Transit Feed Error. The Error's message will be a pipe (|) separated
 * string in the format of: Error Code|Error Type|Error Message that will be parsed out by the Right
 * Track API Server into a more specific error Response.
 * @param {TransitFeed} [callback.feed] The built Transit Feed for the MTA
 */
function loadFeed(callback) {

  // Return Cached Feed
  if ( CACHE !== undefined &&
    CACHE_UPDATED.getTime() >= (new Date().getTime() - (props.maxCache*1000)) ) {
    return callback(null, CACHE);
  }

  // Get Fresh Feed
  else {

    // Download the MTA Feed
    _download(function(xml) {

      // Process the MTA Feed
      if ( xml ) {
        _parse(xml, function(feed) {

          // Return the Feed
          if ( feed ) {
            CACHE = feed;
            CACHE_UPDATED = feed.updated;
            return callback(null, feed);
          }

          // No Feed Returned
          else {
            _parseError();
          }

        });
      }

      // No Feed Returned
      else {
        _parseError();
      }

    });

  }


  /**
   * Return a Parse Error Response
   * @private
   */
  function _parseError() {
    return callback(
      new Error("5004|Could Not Parse Transit Data|The MTA Status Feed did not return a valid response.  This may be temporary so try again later.")
    );
  }

}


/**
 * Parse the MTA Service Feed XML into a Transit Feed
 * @param {string} xml MTA Service Feed XML
 * @param {function} callback Callback function(feed)
 * @private
 */
function _parse(xml, callback) {
  parseXML(xml, function(err, result) {
    if ( err || !result || !result.service ) {
      return callback();
    }

    // Get the service
    let service = result.service;

    // Parse the Timestamp
    let timestamp = service.timestamp[0];
    let updated = new Date(Date.parse(timestamp));

    // Create the Feed
    let feed = new TransitFeed(updated);

    // Get and Set the Divisions
    feed.divisions = _parseDivisions(service);

    // Return the Feed
    return callback(feed);

  });
}


/**
 * Parse the Service Information into a list of Transit Divisions
 * @param {Object} service Parsed XML Service Information
 * @returns {TransitDivision[]}
 * @private
 */
function _parseDivisions(service) {

  // Load the Transit Agency
  const TA = require('./index.js');

  // Divisions to return
  let rtn = [];

  // Parse each of the predefined divisions
  let definitions = props.divisions;
  for ( let i = 0; i < definitions.length; i++ ) {
    let definition = definitions[i];

    // Set Icon Path
    let icon = TA.getDivisionIconPath(definition.code);

    // Create the Division
    let td = new TransitDivision(definition.code, definition.name, icon);

    // Set the Lines
    td.lines = _parseLines(service[definition.tag][0].line);

    // Add to list
    rtn.push(td);

  }

  // Return Divisions
  return rtn;

}


/**
 * Parse a Division's Lines into separate TransitLines
 * @param lines MTA Lines
 * @returns {TransitLine[]}
 * @private
 */
function _parseLines(lines) {

  // Load the Transit Agency
  const TA = require('./index.js');

  // Lines to return
  let rtn = [];

  // Parse Each Line
  for ( let i = 0; i < lines.length; i++ ) {
    let line = lines[i];
    let name = line.name[0];
    let status = line.status[0];
    let text = line.text[0];

    // HOTFIX: Change NQR --> NQRW
    if ( name === "NQR" ) {
      name = "NQRW";
    }

    // Change GOOD SERVICE to Good Service
    if  ( status === "GOOD SERVICE" ) {
      status = "Good Service";
    }

    // Set Line Code
    let code = name;
    code = code.replace(/ - /g, "-");
    code = code.replace(/ /g, "-");

    // Set Line Colors
    let backgroundColor = TA.getLineBackgroundColor(code);
    let textColor = TA.getLineTextColor(code);

    // Create the Line
    let tl = new TransitLine(code, name, backgroundColor, textColor);

    // Set the Status and Events
    tl.status = status;
    tl.events = _parseEvents(text);

    // Add to list
    rtn.push(tl);

  }

  // Return the lines
  return rtn;

}


/**
 * Parse the Line's Status Text into separate TransitEvents
 * @param {string} text Line Status Text
 * @returns {TransitEvent[]}
 * @private
 */
function _parseEvents(text) {

  // Clean the HTML
  let clean = cleanHTML(text).toString();

  // Find the event split points
  let indices = [];
  for ( let i = 0; i < props.eventDelimiters.length; i++ ) {
    let delim = props.eventDelimiters[i].delim;
    let name = props.eventDelimiters[i].name;

    let index = -1;
    let startIndex = 0;
    while ( (index = clean.indexOf(delim, startIndex)) > -1 ) {
      let span = clean.substring(0, index).lastIndexOf('<');
      indices.push({index: span, name: name});
      startIndex = index + delim.length;
    }
  }

  // Sort the indices
  indices.sort(_sort);

  // Split the events
  let split = [];
  for ( let i = 0; i < indices.length; i++ ) {
    let start = indices[i].index;
    let end = clean.length;
    if ( i < indices.length-1 ) {
      end = indices[i+1].index;
    }
    split.push({
      status: indices[i].name,
      details: clean.substring(start, end)
    });
  }

  // Parse the Details of each event
  for ( let i = 0; i < split.length; i++ ) {
    split[i].details = _parseDetails(split[i].details);
  }

  // Create the Events
  let events = [];
  for ( let i = 0; i < split.length; i++ ) {
    events.push(
      new TransitEvent(split[i].status, split[i].details)
    );
  }

  // Return the Events
  return events;


  /**
   * Sort the indices by index number
   * @private
   */
  function _sort(a, b) {
    if ( a.index < b.index ) {
      return -1;
    }
    else if ( a.index > b.index ) {
      return 1;
    }
    else {
      return 0;
    }
  }

}


/**
 * Parse the Details Text
 * @param {string} details Details Text
 * @returns {string}
 * @private
 */
function _parseDetails(details) {

  // Remove Redundant Header
  details = details.replace(/<span class=["']Title[A-Za-z]*["']>[^<]*<\/span>/g, "");

  // Remove all display:none
  details = details.replace(/display: ?none/g, "display:block");

  // Remove leading breaks
  details = details.replace(/^(<br ?(\/)?>\s*)+/g, "");

  // Remove trailing breaks
  details = details.replace(/(<br ?(\/)?>\s*)+$/g, "");

  // Replace Event Tokens
  for ( let i = 0; i < props.eventTokens.length; i++ ) {
    if ( details.indexOf(props.eventTokens[i].token) > -1 ) {
      let replace = props.eventTokens[i].token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      let regex = new RegExp(replace, 'g');
      details = details.replace(regex, props.eventTokens[i].replace);
    }
  }

  // Add Event Styles
  let style = "";
  for ( let i = 0; i < props.eventStyles.length; i++ ) {
    if ( details.indexOf(props.eventStyles[i].selector) > -1 ) {
      style += props.eventStyles[i].style;
    }
  }
  if ( style !== "" ) {
    style = "<style>" + style + "</style>";
  }
  details = style + details;

  // Return the parsed details
  return details;

}


/**
 * Download the MTA Status Feed
 * @param callback Callback function(body)
 * @private
 */
function _download(callback) {

  // Make the get request
  http.get(props.url, function(response) {
    let body = "";
    response.on("data", function(data) {
      body += data;
    });
    response.on("end", function() {
      body = body.toString();
      return callback(body);
    });
  }).on('error', function(err) {
    console.error(err);
    return callback();
  });

}


module.exports = loadFeed;
