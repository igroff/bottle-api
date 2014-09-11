var express         = require('express');
var morgan          = require('morgan');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');
var connect         = require('connect');
var connectTimeout  = require('connect-timeout');
var log             = require('simplog');
var AWS             = require('aws-sdk');
var _               = require('lodash');

// yup, it's a global variable to hold the last ping we received
// it's for diagnostic, and screw it...
// We check for the last time we recieved a message, and if it's not recent
// enough, we'll indicate that so we start with a really old date
lastMessage = {Date: new Date(0)}

var app = express();
AWS.config.update({region: process.env.AWS_REGION || "us-east-1"});

app.use(connect());
app.use(morgan('combined'));
app.use(cookieParser());
// parse application/json
app.use(bodyParser.json())
// parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }))

function sendMessage(res, messageBody, callback){
  function sendMessageCallback(err, data){
    if ( err ){
      log.error("error sending message to router: " + err);
      message.Error = "error sending message to router: " + err;
      data = message;
      res.status(500);
    }
    if ( callback ){
      callback();
    } else {
      res.send(data);
    }
  }
  message = {
    QueueUrl: process.env.ROUTER_QUEUE_URL,
    MessageBody: messageBody
  };
  var sqs = new AWS.SQS();
  sqs.sendMessage(message, sendMessageCallback);
}

function returnBasedOnLastMessageAge(res){
  // if our last message was received more than 5 minutes ago
  // we'll return a 500 indicating an issue
  if ( new Date().getTime() - lastMessage.Date.getTime() > (5 * 60 * 1000) ){
    res.status(500).send(lastMessage);
  } else {
    res.send(lastMessage);
  }
}

app.get("/diagnostic",
  function(req, res) { res.end(); }
);

app.get("/ping",
  function(req, res) {
    sendMessage( res, '{"source": "/bottle/ping"}', function(){returnBasedOnLastMessageAge(res);});
  }
); 

app.get("/ping/lastReceived", function(req, res){
  returnBasedOnLastMessageAge(res);
});

app.post("/ping/receive",
  function(req, res) {
    lastMessage.Date = new Date();
    res.send({});
  }
);

app.post("/send", function(req, res){
  if ( ! req.body || _.isEmpty(req.body) ){
    log.error("no request body ( message ) found in request");
    res.status(400).end();
  } else {
    sendMessage(res, JSON.stringify(req.body));
  }
});

if ( ! process.env.ROUTER_QUEUE_URL ){
  throw new Error("no router queue url specified");
}
listenPort = process.env.PORT || 3000;
log.info("starting app " + process.env.APP_NAME);
log.info("listening on " + listenPort);
app.listen(listenPort);
