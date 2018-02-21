'use strict';

const http = require('http');
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
            return callback("5004|Could Not Parse Transit Data|The MTA Status Feed did not return a valid response.  This may be temporary so try again later.");
          }

        });
      }

      // No Feed Returned
      else {
        return callback("5004|Could Not Parse Transit Data|The MTA Status Feed did not return a valid response.  This may be temporary so try again later.");
      }

    });

  }

}


function _parse(xml, callback) {
  parseXML(xml, function(err, result) {
    if ( err ) {
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

  // Divisions to return
  let rtn = [];

  // Parse each of the predefined divisions
  let definitions = props.divisions;
  for ( let i = 0; i < definitions.length; i++ ) {
    let definition = definitions[i];

    // Get the Lines
    let lines = service[definition.tag][0].line;

    // Parse the Lines
    let tl = _parseLines(lines);

    // TODO: Set Division Icon

    // Create the Division
    let td = new TransitDivision(definition.code, definition.name);

    // Set the Lines
    td.lines = tl;

    // Add to list
    rtn.push(td);

  }

  // Return Divisions
  return rtn;

}


function _parseLines(lines) {

  // Lines to return
  let rtn = [];

  // Parse Each Line
  for ( let i = 0; i < lines.length; i++ ) {
    let line = lines[i];
    let name = line.name[0];
    let status = line.status[0];
    let text = line.text[0];

    // Parse the text into Events
    let events = _parseEvents(text);

    // TODO: Set Line colors

    // Create the Line
    let tl = new TransitLine(name.replace(/\s/g, ""), name);

    // Set the Status and Events
    tl.status = status;
    tl.events = events;

    // Add to list
    rtn.push(tl);

  }

  // Return the lines
  return rtn;

}


/**
 * Parse the Line's Status Text into separate Events
 * @param {string} text Line Status Text
 * @returns {TransitEvent[]}
 * @private
 */
function _parseEvents(text) {

  // Clean the HTML
  let clean = cleanHTML(text);

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
  if ( indices.length > 1 ) {
    for ( let i = 0; i < indices.length-1; i++ ) {
      let start = indices[i].index;
      let end = indices[i+1].index;
      split.push({
        status: indices[i].name,
        details: clean.substring(start, end)
      });
    }
    split.push({
      status: indices[indices.length - 1].name,
      details: clean.substring(indices[indices.length - 1].index)
    });
  }
  else if ( indices.length === 1 ) {
    split = [{
      status: indices[0].name,
      details: clean
    }];
  }

  // TODO: Parse Details

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
