'use strict';

const https = require('https');

const TF = require('right-track-core/modules/classes/RightTrackTransitAgency/TransitFeed');
const TransitFeed = TF.TransitFeed;
const TransitDivision = TF.TransitDivision;
const TransitEvent = TF.TransitEvent;


// Transit Agency Config
let CONFIG = {};

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
function loadFeed(config, callback) {
  CONFIG = config;

  // Return Cached Feed
  if ( CACHE && CACHE_UPDATED.getTime() >= (new Date().getTime() - (CONFIG.maxCache*1000)) ) {
    return callback(null, CACHE);
  }

  // Download the MTA Feed
  _download(function(mta) {

    // Process the MTA Feed
    if ( mta ) {
      let feed = _parse(mta);

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
    }

    // No Feed Returned
    else {
      _parseError();
    }

  });


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
 * Build the Transit Feed using the parsed alert entities from the MTA API
 * @param {Date} last_updated DateTime of when the Feed was last updated
 * @param {Object[]} entities Parsed entities containing the info needed for the Feed
 * @returns {TransitFeed} The built Transit Feed
 * @private
 */
function _buildFeed(last_updated, entities) {
  let feed = new TransitFeed(last_updated);

  // Parse each division from the agency config...
  let divisions = [];
  for ( let i = 0; i < CONFIG.divisions.length; i++ ) {
    let d = CONFIG.divisions[i];

    // Create the Division
    let division = new TransitDivision(d.code, d.name, d.icon);

    // Build the Lines for the Division
    division.divisions =  _buildLines(d, entities);

    divisions.push(division);
  }

  // Add the Divisions to the Feed
  feed.divisions = divisions;
  return feed;
}


/**
 * Build the sub-Divisions for the specified parent Division
 * @param {Object} division Division information (from the agency config)
 * @param {Object[]} entities Parsed entities (from the MTA API)
 * @returns {TransitDivision[]} Sub-Divisions/Lines for the specified parent Division
 * @private
 */
function _buildLines(division, entities) {
  let mta_agency_ids = division.mta_agency_ids;
  let lines = [];

  // Parse the pre-defined lines for the division
  if ( division.lines ) {
    for ( let i = 0; i < division.lines.length; i++ ) {
      let l = division.lines[i];

      // Create top level division
      let line = new TransitDivision(l.code, l.name, l.backgroundColor, l.textColor);

      // Create Events for pre-defined routes
      if ( l.mta_route_id ) {
        line.events = _buildEvents(mta_agency_ids, l.mta_route_id, entities);
        line.status = line.events && line.events.length > 0 ? line.events[0].status : 'Good Service';
      }

      // Find dynamic routes (2nd level divisions)
      else if ( l.mta_route_id_matches ) {
        let routes = _findRoutes(mta_agency_ids, l.mta_route_id_matches, entities);
        let sub_lines = [];
        
        // Create dynamic routes
        for ( let j = 0; j < routes.length; j++ ) {
          let sub_line = new TransitDivision(routes[j], routes[j], l.backgroundColor, l.textColor);

          // Create Events for the dynamic route
          sub_line.events = _buildEvents(mta_agency_ids, routes[j], entities);
          sub_line.status = sub_line.events && sub_line.events.length > 0 ? sub_line.events[0].status : 'Good Service';

          sub_lines.push(sub_line);
        }

        line.divisions = sub_lines;
      }

      lines.push(line);
    }
  }

  return lines;
}


/**
 * Find matching MTA Route IDs given the specified Agency IDs and Route ID RegExps
 * @param {String[]} agency_ids MTA Agency IDs
 * @param {String[]} route_id_matches Regular Expressions for matching MTA Route IDs
 * @param {Object[]} entities Parsed entities (from the MTA API) 
 * @returns {String[]} Array of matching MTA Route IDs
 */
function _findRoutes(agency_ids, route_id_matches, entities) {
  let route_ids = [];
  for ( let i = 0; i < entities.length; i++ ) {
    let e = entities[i];
    for ( let j = 0; j < e.routes.length; j++ ) {
      let r = e.routes[j];
      for ( let k = 0; k < route_id_matches.length; k++ ) {
        let re = new RegExp(route_id_matches[k], "i");
        if ( agency_ids.includes(r.agency_id) && r.route_id.match(re) ) {
          if ( !route_ids.includes(r.route_id) ) route_ids.push(r.route_id);
        }
      }
    }
  }

  route_ids.sort();
  return(route_ids);
}


/**
 * Build the Transit Events for the specified Route ID
 * @param {String[]} agency_ids MTA Agency IDs
 * @param {String} route_id MTA Route ID
 * @param {Object[]} entities Parsed entities (from the MTA API)
 * @returns {TransitEvent[]} Array of build Transit Events
 */
function _buildEvents(agency_ids, route_id, entities) {
  let events = [];
  for ( let j = 0; j < entities.length; j++ ) {
    let e = entities[j];
    for ( let k = 0; k < e.routes.length; k++ ) {
      let r = e.routes[k];
      if ( agency_ids.includes(r.agency_id) && r.route_id === route_id ) {
        let event = new TransitEvent(e.event.status, e.event.details);
        event._sort = r.sort_order;
        events.push(event);
      }
    }
  }

  let rtn = [];
  events.sort(function(a, b){ return b._sort-a._sort });
  for ( let j = 0; j < events.length; j++ ) {
    rtn.push({
      status: events[j].status,
      details: events[j].details
    });
  }
  
  return rtn;
}


/**
 * Parse the MTA Service Feed API Response into a Transit Feed
 * @param {Object} mta JSON-parsed MTA Service Feed
 * @returns {TransitFeed} The built Transit Feed
 * @private
 */
 function _parse(mta) {

  // Set the Last Updated time from the Timestamp, if provided
  let last_updated = mta && mta.header && mta.header.timestamp 
      ? new Date(mta.header.timestamp * 1000) 
      : new Date();

  // Parse each of the Alert entities
  let entities = mta && mta.entity ? mta.entity : [];
  let parsed_entities = [];
  for ( let i = 0; i < entities.length; i++ ) {
    let parsed_entity = _parseEntity(entities[i]);
    if ( parsed_entity ) parsed_entities.push(parsed_entity);
  }

  // Build and Return the Feed
  return _buildFeed(last_updated, parsed_entities);

}


/**
 * Parse the MTA Alert Entity and retrieve the routes and event 
 * details for an entity that should be displayed in the Feed
 * @param {Object} e Alert Entity
 * @returns {Object|Boolean} false if the entity should not be displayed
 * For active alerts, return an object with the following keys:
 *    - routes: agency_id, route_id, and sort_order of impacted routes
 *    - event: id, status, and details of event
 */
function _parseEntity(e) {
  let a = e.alert;
  if ( a ) {
    let id = e.id;

    // Determine if the entity is active
    let now = (new Date().getTime()) / 1000;
    let aps = a.active_period ? a.active_period : [];
    let active = aps.length > 0 ? false : true;
    for ( let i = 0; i < aps.length; i++ ) {
      let ap = aps[i];
      if ( ap.start <= now && !ap.end ) active = true;
      if ( ap.start <= now && ap.end && ap.end >= now ) active = true;
    }

    // Continue parsing active alerts
    if ( active ) {
      
      // Get the Agencies and Routes
      let ies = a.informed_entity;
      let routes = [];
      for ( let i = 0; i < ies.length; i++ ) {
        let ie = ies[i];
        if ( ie.hasOwnProperty("transit_realtime.mercury_entity_selector") ) {
          routes.push({
            agency_id: ie.agency_id,
            route_id: ie.route_id,
            sort_order: (ie["transit_realtime.mercury_entity_selector"].sort_order).split(':')[2]
          });
        }
      }

      // Get the Event Details
      if ( routes.length > 0 ) {

        // Set status = alert_type
        let status = a["transit_realtime.mercury_alert"] && a["transit_realtime.mercury_alert"].alert_type 
          ? a["transit_realtime.mercury_alert"].alert_type 
          : "Alert";

        // Get properties for details
        let header;
        if ( a.header_text && a.header_text.translation ) { 
          for ( let i = 0; i < a.header_text.translation.length; i++ ) {
            if ( !header || a.header_text.translation[i].language === 'en-html' ) {
              header = a.header_text.translation[i].text;
            }
          }
        }
        let description;
        if ( a.description_text && a.description_text.translation ) {
          for ( let i = 0; i < a.description_text.translation.length; i++ ) {
            if ( !description || a.description_text.translation[i].language === 'en-html' ) {
              description = a.description_text.translation[i].text;
            }
          }
        }
        let additional_information;
        if ( a["transit_realtime.mercury_alert"].additional_information && a["transit_realtime.mercury_alert"].additional_information.translation ) {
          for ( let i = 0; i < a["transit_realtime.mercury_alert"].additional_information.translation.length; i++ ) {
            if ( !additional_information || a["transit_realtime.mercury_alert"].additional_information.translation[i].language === 'en-html' ) {
              additional_information = "<p>" + a["transit_realtime.mercury_alert"].additional_information.translation[i].text + "</p>";
            }
          }
        }
        let updated;
        if ( a["transit_realtime.mercury_alert"].updated_at ) {
          updated = "<p><strong>Last Updated:</strong> " + new Date(a["transit_realtime.mercury_alert"].updated_at * 1000).toLocaleString() + "</p>";
        }
        let active;
        if ( a["transit_realtime.mercury_alert"].human_readable_active_period && a["transit_realtime.mercury_alert"].human_readable_active_period.translation ) {
          for ( let i = 0; i < a["transit_realtime.mercury_alert"].human_readable_active_period.translation.length; i++ ) {
            if ( !active || a["transit_realtime.mercury_alert"].human_readable_active_period.translation[i].language === 'en-html' ) {
              active = "<p><strong>Active:</strong> " + a["transit_realtime.mercury_alert"].human_readable_active_period.translation[i].text + "</p>";
            }
          }
        }

        // Build details (header, details, info)
        let details = "";
        if ( header && header !== status ) details += "<div class='event-details-header'>" + _clean(header) + "</div>";
        details += "<div class='event-details-description'>";
        if ( description ) details += _clean(description);
        if ( additional_information ) details += _clean(additional_information);
        details += "</div>";
        details += "<div class='event-details-info'>";
        if ( active ) details += active;
        if ( updated ) details += updated;
        details += "</div>";

        // Parse Event Tokens
        details = _parseTokens(details);

        // Set event
        let event = {
          id: id,
          status: status,
          details: details
        };
        
        // Return the parsed routes and event
        return {
          routes: routes,
          event: event
        }

      }
    }
  }

  // Entity should not be displayed
  return false;
}


/**
 * Clean the specified HTML
 * - set hidden sections as visible
 * - replace leading and trailing breaks
 * - replace empty links
 * @param {String} html HTML to clean
 * @returns {String} cleaned HTML
 */
function _clean(html) {
  html = html.replace(/display: ?none/g, "display:block");    // replace hidden sections
  html = html.replace(/^(<br ?(\/)?>\s*)+/g, "");             // replace leading breaks
  html = html.replace(/(<br ?(\/)?>\s*)+$/g, "");             // replace trailing breaks
  html = html.replace(/<a ([^>]+)>\s<\/a>/g, "<a $1><i class='material-icons' style='font-size: 14px; padding: 5px'>open_in_new</i></a>");    
  return html;
}


/**
 * Find and replace icon tokens in the event details
 * @param {String} details The details to parse
 * @returns {String} parsed details
 */
function _parseTokens(details) {
  
  // Replace Event Tokens
  for ( let i = 0; i < CONFIG.eventTokens.length; i++ ) {
    if ( details.indexOf(CONFIG.eventTokens[i].token) > -1 ) {
      let replace = CONFIG.eventTokens[i].token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      let regex = new RegExp(replace, 'g');
      details = details.replace(regex, CONFIG.eventTokens[i].replace);
    }
  }

  // Add Event Styles
  let style = "";
  for ( let i = 0; i < CONFIG.eventStyles.length; i++ ) {
    if ( details.indexOf(CONFIG.eventStyles[i].selector) > -1 ) {
      style += CONFIG.eventStyles[i].style;
    }
  }
  if ( style !== "" ) {
    style = "<style>" + style + "</style>";
    details = style + details;
  }

  // Return the parsed details
  return details;

}


/**
 * Download the MTA Status Feed
 * @param {Function} callback Callback function(body)
 * @param {Object} callback.body JSON-parsed response
 * @private
 */
function _download(callback) {

  // Set Request Options
  const parsed = new URL(CONFIG.url);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'GET',
    headers: {
       'x-api-key': CONFIG.apiKey
    }
  };

  // Make the get request
  https.get(options, function(response) {
    let body = "";
    response.on("data", function(data) {
      body += data;
    });
    response.on("end", function() {
      try {
        body = body.toString();
        body = JSON.parse(body);
      }
      catch (err) {
        console.log("ERROR: Could not parse MTA Transit Feed API Response [" + err + "]");
      }
      return callback(body);
    });
  }).on('error', function(err) {
    console.error(err);
    return callback();
  });

}


module.exports = loadFeed;
