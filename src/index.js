'use strict';

const path = require('path');
const RightTrackTransitAgency = require('right-track-core/modules/classes/RightTrackTransitAgency');
const feed = require('./feed.js');

const moduleDirectory = __dirname + "/../";

/**
 * `RightTrackTransitAgency` implementation for the
 * **Metropolitan Transportation Authority (MTA)**.
 *
 * For more information, see:
 * - Right Track core project ({@link https://github.com/right-track/right-track-core})
 * - Right Track core documentation ({@link https://docs.righttrack.io/right-track-core})
 *
 * @class
 */
class MTA extends RightTrackTransitAgency {

  /**
   * Create a `RightTrackTransitAgency` for the MTA
   */
  constructor() {
    super(path.normalize(moduleDirectory));
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
    feed(this.config, callback);
  }

}


module.exports = new MTA();