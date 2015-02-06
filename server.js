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
var lastPingMessage = {Date: new Date(0)};
var lastPingSentAt = new Date(0);
// here we store all the messages that we've received so we can see
// that we're receiving everything sent in a timely manner
var receivedPings = [];
// tracking a sequence number for the ping messages we send so that we
// can validate everyone's reception of the messages
var pingSequenceNumber = 0;
var pingsSent = [];

var sequencePrefix = process.env.INSTANCE_ID || (new Date().getTime() + "-" + process.pid)

var app = express();
AWS.config.update({region: process.env.AWS_REGION || "us-east-1"});

app.use(connect());
app.use(morgan('combined'));
app.use(cookieParser());
app.use(bodyParser.json());

function nextSequenceNumber(){
  return sequencePrefix + "-" + (pingSequenceNumber++);
}

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
  if (process.env.DO_NOT_QUEUE){
    log.info("not queueing message as per config");
    sendMessageCallback(null, {});
  }else{
    message = {
      QueueUrl: process.env.ROUTER_QUEUE_URL,
      MessageBody: messageBody
    };
    var sqs = new AWS.SQS();
    sqs.sendMessage(message, sendMessageCallback);
  }
}

function returnBasedOnLastMessageAge(res){
  // if our last message was received more than 5 minutes ago
  // we'll return a 500 indicating an issue
  if ( new Date().getTime() - lastPingMessage.Date.getTime() > (5 * 60 * 1000) ){
    res.status(500).send(
      {
        error:"last message received more than 5 minutes ago",
        dateOfLastMessage:lastPingMessage.Date
      }
    );
  } else {
    res.send(lastPingMessage);
  }
}

/*****************************************************************************/
//<diagnostic methods>
// the app does nothing at all that isn't wholly contained within this
// file, so if this returns the app is healthy
app.get("/diagnostic",
  function(req, res) { res.end(); }
);

function getQueueMessageCount(url, retVal, itemName, callback){
  if (!url){ return callback(null, retVal); }
  message = {
    QueueUrl: url, 
    AttributeNames: [ 'ApproximateNumberOfMessages' ]
  };
  var sqs = new AWS.SQS();
  sqs.getQueueAttributes(message, function(err, data){
    if (err){
      retVal[itemName] = {error: err};
      retVal['error'] = true
    } else {
      retVal[itemName] = data.Attributes.ApproximateNumberOfMessages;
    }
    callback(err, retVal);
  });
}

app.get("/messageCount",
  function(req, res){
    function done(err, data){
      if (err){ res.status(500); }
      res.send(data);
    }

    getQueueMessageCount(process.env.ROUTER_QUEUE_URL, {}, 'routerQueueCount',
      function(err, data){
        if(!err){
          getQueueMessageCount(process.env.TASK_QUEUE_URL, data, 'taskQueueCount',
            function(err, data){
              if(!err){
                getQueueMessageCount(process.env.DEAD_QUEUE_URL, data, 'deadQueueCount', done);
              } else {
                done(err, data);
              }
            }
          );
        } else {
          done(err, data);
        }
      }
    );  
  }
);
  

// short cut to sending a specific (/bottle/ping) message
app.get("/ping",
  function(req, res) {
    var message = {
      source: "/bottle/ping"
      ,sequence: nextSequenceNumber()
      ,sent: new Date()
    };
    sendMessage(res,
      JSON.stringify(message),
      function(){
        returnBasedOnLastMessageAge(res);
        pingsSent.push(message);
      }
    );
    lastPingSentAt = new Date();
  }
); 

app.get("/ping/lastReceived", function(req, res){
  returnBasedOnLastMessageAge(res);
});

app.get("/ping/currentSequenceNumber", 
  function(req, res){
    res.send({currentSequenceNumber: pingSequenceNumber, sent:lastPingSentAt});
});

app.post("/ping/receive",
  function(req, res) {
    var message = req.body;  
    log.debug("processing message: type %s %j", typeof(message),  message);
    if ( !message ){
      res.status(500).send({error:"No message found in request"});
      return;
    } else if ( typeof(message.sequence) === "undefined" ){
      res.status(500).send({error:"No message sequence number found"});
      return;
    }
    lastPingMessage.Date = new Date();
    // we want to track when this was received for our 'have we received
    // all messages greater than age' check
    message.received = lastPingMessage.Date;
    receivedPings.push(message);
    res.send({});
  }
);

// this method takes a list of sequence numbers and checks to see
// if it has received ping messages with those sequence numbers
app.post("/ping/didYouGetThese",
  function(req, res){
    var sequenceList = req.body;  
    var matchingReceivedMessages = [];
    if ( !sequenceList || !_.isArray(sequenceList) || sequenceList.length === 0){
      res.status(500).send({error:"No message found in request"});
      return;
    } 
    function findForSequenceNumber(number){
      return function(message) { return message.sequence === number; };
    }
    for (var i=0;i<sequenceList.length;i++){
      var gotIt = _.find(receivedPings, findForSequenceNumber(sequenceList[i].sequence));
      if (gotIt === undefined){
        res.status(500).send({error:"Missing message", sequenceNumber: sequenceList[i]}); 
        return;
      } else {
        matchingReceivedMessages.push(gotIt);
      }
    }
    res.send({message:"got 'em all", sequenceNumbers:matchingReceivedMessages});
  }
);

app.post("/ping/clearReceived",
  function(req, res){ 
    receivedPings = [];
    res.send({message:"ok"});
  }
);

app.get("/ping/showReceived",
  function(req,res){
    res.send(receivedPings);
  }
);

app.post("/ping/clearSent",
  function(req,res){
    pingsSent = [];
    res.send({message:"ok"});
  }
);

app.get("/ping/showSent",
  function(req,res){
    res.send(pingsSent);
  }
);
// </diagnostic methods>
/*****************************************************************************/
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
