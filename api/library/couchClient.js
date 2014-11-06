var env   = process.env.NODE_ENV || "development",
  winston = require('winston');

function init (url) {
  var client = require('nano')(url);
  
  client.parentView = client.view;
  client.view       = function(doc, view, options, callback) {
    var label = "", d = Date.now(), tags; //tracking elapsed time
    
    if (options.label) {
      label         = options.label;
      options.label = undefined;  
    } 
    
    tags = ["view:"+doc+"/"+view, "node_env:"+env];
    datadog.increment('stellar_data_api.couchDB_requests', null, tags);
    return client.parentView(doc, view, options, function(error, response){
      d = (Date.now()-d)/1000;
      if (DEBUG) winston.info("CouchDB - "+doc+"/"+view, label, d+"s");
      
      datadog.histogram('stellar_data_api.couchDB_responseTime', d, null, tags);    
      callback(error, response);
    });
  }
  
  return client;
}

module.exports = init;