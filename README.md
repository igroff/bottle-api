## bottle http api


### What?

This is the REST-y interface to send messages via bottle.  It's (hopefully) pretty straight-forward. 


### What are we talking about?

Well, there's some definitions over at [bottle](http://github.com/igroff/bottle.git) that may
be helpful.

Once you've got that we can talk about the interesting things exposed via HTTP (RESTy), there
are a couple but first the only one you need to know...

### Interfaces

``` /send ```

Send is the endpoint to which you will POST your messages.  Messages sent to this endpoint need to be JSON
documents in the body of the request, and the Content-Type header of the request must be set to `application/json`. For a 
painfully simple example:

        curl http://some.bottle.http.server.com/send --data '{"sequence":1}' -H 'Content-Type:application/json'

``` /diagnostic ```

Provides the standard 'up at all' endpoint for health checking.

``` /ping* ```

There are a few endpoints that start with `ping`, they're all for monitoring and you probably don't care that much. If you do care, read the code.


