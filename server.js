var express         = require('express');
var morgan          = require('morgan');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');
var connect         = require('connect');
var connectTimeout  = require('connect-timeout');
var log             = require('simplog');
var AWS             = require('aws-sdk');
var _               = require('lodash');


var app = express();
AWS.config.update({region: process.env.AWS_REGION || "us-east-1"});

app.use(connect());
app.use(morgan('combined'));
app.use(cookieParser());
// parse application/json
app.use(bodyParser.json())
// parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }))


// respond
app.post("/notify", function(req, res){
  if ( ! req.body || _.isEmpty(req.body) ){
    log.error("no request body ( message ) found in request");
    res.status(400).end("no message found, invalid content type?");
  } else {
    sqs = new AWS.SQS();
    function sendCallback(err, data){
      if ( err ){
        log.error("error sending mssage to router: " + err);
        res.status(500);
      }
      res.end(data);
    }
    log.info("sending %s to router q", JSON.stringify(req.body));
    res.end(JSON.stringify(req.body));
    sqs.sendMessage(
      {
        QueueUrl: process.env.ROUTER_QUEUE_URL,
        MessageBody: JSON.stringify(req.body)
      }, sendCallback);
  }
});

if ( ! process.env.ROUTER_QUEUE_URL ){
  throw new Error("no router queue url specified");
}
listenPort = process.env.PORT || 3000;
log.info("starting app " + process.env.APP_NAME);
log.info("listening on " + listenPort);
app.listen(listenPort);
