var moment = require('moment'),
  payshares   = require('payshares-lib'),
  async    = require('async'),
  _        = require('lodash'),
  utils    = require('../utils');

/**
 *  exchangeRates returns the exchange rate(s) between two or more currencies
 *  for a given time range, returning both a volume weighted average and last price
 *
 *  expects params to have:
 *  {
 *    pairs    : [
 *      {
 *        base    : {currency:"USD","issuer":"bitstamp"},
 *        counter : {currency:"BTC","issuer":"bitstamp"}
 *      },
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"},
 *        counter : {currency:"XPS"}
 *      }
 *    ]
 *  
 *    base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}, //required if "pairs" not present, for a single currency pair exchange rate
 *    counter : {currency:"XPS"}, //require if "pairs" not present, for a single currency pair exchange rate
 *    range   : "hour", "day", "week", "month", year",  //time range to average the price over, defaults to "day"
 *    last    : (boolean) retreive the last traded price only (faster query)  
 *  }
 * 
 *  response :
 *  {
 *    pairs : [
 *      {
 *        base    : {currency:"CNY","issuer":"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK","name":"paysharesCN"},
 *        counter : {currency:"XPS"},
 *        rate    : //volume weighted average price
 *        last    : //last trade price
 *        range   : "hour", "day", "month", year" - from request
 *      },
 * 
 *      ....
 *    ] 
 *  }
 * 
  curl -H "Content-Type: application/json" -X POST -d '{
    "pairs" : [{
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XPS"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XPS"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XPS"}
    },
    {
      "base":{"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "counter":{"currency":"XPS"}
    }] 
  }' http://localhost:5993/api/exchangerates

  curl -H "Content-Type: application/json" -X POST -d '{

    "base"    : {"currency":"BTC","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
    "counter" : {"currency":"XPS"},
    "last"    : true
 
  }' http://localhost:5993/api/exchangerates
    
 */

function exchangeRates (params, callback) {
  var pairs, list = [];
  var endTime = moment.utc();
  var range   = params.range || "day"; 
  
  if (params.last)         startTime = moment.utc("Jan 1 2013 z");
  else if (range=="hour")  startTime = moment.utc().subtract("hours", 1);
  else if (range=="day")   startTime = moment.utc().subtract("days", 1);
  else if (range=="week")  startTime = moment.utc().subtract("weeks", 1);
  else if (range=="month") startTime = moment.utc().subtract("months", 1);
  else if (range=="year")  startTime = moment.utc().subtract("years", 1);
  else { 
    
    //invalid range
    return callback('invalid time range'); 
  }
  
  if (params.pairs && Array.isArray(params.pairs)) 
    pairs = params.pairs;
  else if (params.base && params.counter) 
    pairs = [{base:params.base,counter:params.counter}];
  else {
    //pairs or base and counter required
    return callback('please specify a list of currency pairs or a base and counter currency');
  }
  
  pairs.forEach(function(pair){
    var currencyPair = parseCurrencyPair(pair);
    
    if (currencyPair) list.push(currencyPair);
    else { 
      //invalid currency pair
      return callback('invalid currency pair: ' + JSON.stringify(pair));
    }
  });
  
  if (pairs.length>50) return callback("Cannot retrieve more than 50 pairs");
  
//call offersExercised for each asset pair
  async.mapLimit(list, 50, function(pair, asyncCallbackPair){

    var options = {
      base      : pair.base,
      counter   : pair.counter,
      startTime : startTime,
      endTime   : endTime,      
    }
    
    if (params.last) {
      options.reduce     = false;
      options.limit      = 1,
      options.descending = true;
    } else {
      options.timeIncrement = 'all';  
    }
    
    require("./offersExercised")(options, function(error, data) {

      if (error) return asyncCallbackPair(error);

      if (params.last) {
          pair.last = data && data.length > 1 ? data[1][1] : 0;
        
      } else {
        if (data && data.length > 1) {
          pair.rate = data[1][8]; // volume weighted average price
          pair.last = data[1][7]; // close price
        } else {
          pair.rate = 0;
        }
      }
      asyncCallbackPair(null, pair);
    });

  }, function(error, results){
    if (error) return callback(error);

    var finalResults = _.filter(results, function(result){ return result.rate !== 0; });
    return callback (null, finalResults);
  });
}

/* HELPER FUNCTIONS */

//format valid currency pairs, reject invalid
function parseCurrencyPair (pair) {
  var base, counter;
  
  if (!pair.base|| !pair.counter) return;
  
  base  = parseCurrency(pair.base);
  counter = parseCurrency(pair.counter); 
  
  if (!base || !counter) return;
  return {base:base,counter:counter};
}

//format valid currency-issuer combinations, reject invalid
function parseCurrency (c) {
  var currency,name,issuer;
    
  if (!c.currency) return;
  else {
    currency = c.currency.toUpperCase();
    
    if (currency == "XPS") {
      if (c.issuer) return null;   //XPS should not have an issuer
      return {currency:"XPS"};
    }
    
    else if (currency != "XPS" && !c.issuer) return null;  //IOUs must have an issuer
    else if (payshares.UInt160.is_valid(c.issuer)) {
    
      issuer = c.issuer;
      name   = utils.getGatewayName(issuer);
      
    } else {  
      
      name   = c.issuer;
      issuer = utils.gatewayNameToAddress(name, currency);
      if (!issuer) return null; //invalid issuer name or address
    } 
  } 
  
  return {currency:currency, issuer:issuer, name:name}; 
}



module.exports = exchangeRates;