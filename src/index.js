'use strict';

const RightTrackTransitAgency = require('right-track-transit');
const feed = require('./feed.js');
const props = require('../agency.json');


class MTA extends RightTrackTransitAgency {

  constructor() {
    super(props.id, props.name, props.description);
  }

  loadFeed(callback) {
    feed(callback);
  }

}


module.exports = new MTA();