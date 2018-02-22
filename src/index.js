'use strict';

const path = require('path');
const RightTrackTransitAgency = require('right-track-transit');
const feed = require('./feed.js');
const props = require('../agency.json');
const propsDir = path.dirname(require.resolve('../agency.json'));

/**
 * `RightTrackTransitAgency` implementation for the
 * **Metropolitan Transportation Authority (MTA)**.
 *
 * For more information, see:
 * - Right Track Transit Agency project ({@link https://github.com/right-track/right-track-transit})
 * - Right Track Transit Agency documentation ({@link https://docs.righttrack.io/right-track-transit})
 *
 * @class
 */
class MTA extends RightTrackTransitAgency {

  /**
   * Create a `RightTrackTransitAgency` for the MTA
   */
  constructor() {
    super(
      props.id,
      props.name,
      props.description,
      path.normalize(propsDir + '/' + props.icon)
    );
  }

  /**
   * Load the Transit Feed for the MTA
   * @param {function} callback Callback function
   * @param {Error} callback.error Transit Feed Error. The Error's message will be a pipe (|) separated
   * string in the format of: Error Code|Error Type|Error Message that will be parsed out by the Right
   * Track API Server into a more specific error Response.
   * @param {TransitFeed} [callback.feed] The built Transit Feed for the MTA
   */
  loadFeed(callback) {
    feed(callback);
  }

}


module.exports = new MTA();