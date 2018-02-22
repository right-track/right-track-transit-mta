Metropolitan Transportation Authority
=====================================

**node module:** [right-track-transit-mta](https://www.npmjs.com/package/right-track-transit-mta)<br />
**GitHub repo:** [right-track/right-track-transit-mta](https://github.com/right-track/right-track-transit-mta)

---

This module is an implementation of a [Right Track Transit Agency](https://github.com/right-track/right-track-agency)
used to create a real-time Transit Feed for the **MTA** in New York City, which is used in the various
[Right Track Projects](https://github.com/right-track).


### Documentation

Documentation about the `RightTrackTransitAgency` class and `TransitFeed` classes can be found in the
[right-track-transit](https://github.com/right-track/right-track-transit) project
and online at [https://docs.righttrack.io/right-track-transit](https://docs.righttrack.io/right-track-transit).

### Usage

This example builds a `TransitFeed` for the MTA:

```javascript
const mta = require('right-track-transit-mta');

mta.loadFeed(function(err, feed) {
  if ( !err ) {
    console.log(JSON.stringify(feed, null, 2));
  }
});
```