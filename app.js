var express = require('express');
var proxyMiddleware = require('http-proxy-middleware');
var bodyParser = require('body-parser');
var cors = require('cors');
var app = express();
const fs = require('fs');
var index = require('./routes/index');
app.use(cors());

require('dotenv').config()



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// apply CORS headers
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, inauth");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  return next();
});

// handle OPTIONS calls
app.use(function(req, res, next) {
  if(req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return next();
});

app.post('/', index);


var UPDATE_CONTENT_TYPES = ['application/json', 'application/json; charset=utf-8', 'application/x-www-form-urlencoded', 'application/x-www-form-urlencoded; charset=utf-8'];

var buildProxyEndpoint = function (target, pathRewrite) {
  console.log(process.env.APEX_REST_CITIZEN_CONFIG_ENDPOINT, "dddddddddddddddddddddd")

  return {
    target: target,
    changeOrigin: true,
    xfwd: false,
    pathRewrite: pathRewrite,
    onProxyReq(proxyReq, req, res) {
      proxyReq.removeHeader('sfdc_stack_depth');

   //console.log(proxyReq.getHeader('incap-token'));
      var cTypeHeader = proxyReq.getHeader('Content-Type');

      if(UPDATE_CONTENT_TYPES.indexOf(cTypeHeader) >= 0) {
        var body = req.body;
        delete req.body;
 
        if(body.long) {
          body.lng = body.long;
          delete body.long;
        }
 
        var serializedBody = JSON.stringify(body);
 
        // Update header
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(serializedBody)); ////[IS-785] Not able to submit one SR with guest & citizen both.
 
        const activityUpdateRegex = /\/v[3-4]\/requests\/[A-Za-z0-9-]*\/activities\/[A-Za-z0-9-]*\.json/gi;
        const caseCreationRegex =   /\/v[3-4]\/request[a-zA-Z]*\/[A-Za-z0-9-]*.json/gi;
        const transferRegex =       /\/v[3-4]\/request[a-zA-Z]*\/[A-Za-z0-9-]*\/transfer.json/gi;
        const reallocateRegex =       /\/v[3-4]\/request[a-zA-Z]*\/[A-Za-z0-9-]*\/reallocate.json/gi;
        const activityReallocateRegex = /\/v[3-4]\/requests\/[A-Za-z0-9-]*\/activities\/[A-Za-z0-9-]*\/reallocate.json/gi;
 
        if((proxyReq.method === 'PUT' || proxyReq.method === 'PATCH') && (proxyReq.path.match(activityUpdateRegex) || proxyReq.path.match(caseCreationRegex) || proxyReq.path.match(transferRegex) || proxyReq.path.match(reallocateRegex) || proxyReq.path.match(activityReallocateRegex))) {
          console.log('<=================> in headers <================>');
          proxyReq.setHeader('sforce-auto-assign', false);
        }
 
 
        // Write out body changes to the proxyReq stream
        proxyReq.write( serializedBody );
        proxyReq.end();
      }
    }
  }
}

// create the proxy
// use the configured `proxy` in web server


// fire up the proxy

app.use(proxyMiddleware(
  '/311/v3/citizenapp/*/config',
  buildProxyEndpoint(
    process.env.APEX_REST_CITIZEN_CONFIG_ENDPOINT || 'https://incapsulate311-sat-dev-ed.my.salesforce.com/services/apexrest/Incap311CZ',
    { '^/311': '/' }
  )
));

app.use(proxyMiddleware(
  '/311/v4/citizenapp/*/config',
  buildProxyEndpoint(
    process.env.APEX_REST_CITIZEN_CONFIG_ENDPOINT || 'https://incapsulate311-sat-dev-ed.my.salesforce.com/services/apexrest/Incap311CZ',
    { '^/311': '/' }
  )
));

app.use(proxyMiddleware(
  '/311/v3/citizenapp/*/config',
  buildProxyEndpoint(
    process.env.APEX_REST_BASE_ENDPOINT || 'https://incap311-sat-citizen-developer-edition.na53.force.com/citizen/services/apexrest',
    { '^/311': '/' }
  )
));

app.use(proxyMiddleware(
  '/311/v4/citizenapp/*/config',
  buildProxyEndpoint(
    process.env.APEX_REST_BASE_ENDPOINT || 'https://incap311-sat-citizen-developer-edition.na53.force.com/citizen/services/apexrest',
    { '^/311': '/' }
  )
));

app.use(proxyMiddleware(
  '/311',
  buildProxyEndpoint(
    process.env.APEX_REST_311_ENDPOINT || 'https://311-public-dev-api-developer-edition.na35.force.com/services/apexrest/Incap311',
    { '^/311': '/' }
  )
));

app.use(proxyMiddleware(
  '/surveys',
  buildProxyEndpoint(
    process.env.APEX_REST_SURVEY_ENDPOINT || 'https://311-public-dev-api-developer-edition.na35.force.com/services/apexrest/IncapGetSurvey',
    { '^/surveys': '/' }
  )
));

app.use(proxyMiddleware(
  '/*/services/oauth2/token',
  buildProxyEndpoint(
    process.env.LOGIN_BASE_ENDPOINT || 'https://demo-servicecloudtrial-155c0807bf-1581cb64df5.cs77.force.com'
  )
));

app.use(proxyMiddleware(
  '/',
  buildProxyEndpoint(
    process.env.APEX_REST_BASE_ENDPOINT || 'https://c.na35.visual.force.com/services/apexrest'
  )
));





// 311-deeplink-proxy-********************


function handleRedirect(req, res) {
  const targetUrl = process.env.TARGET_URL + req.originalUrl;
  setTimeout(() => {
    res.redirect(targetUrl);
  }, 1000);
}

app.set('port', (process.env.PORT || 5000));

const aasa = fs.readFileSync(__dirname + '/static/apple-app-site-association', 'utf8');

app.get('/apple-app-site-association', function(req, res) {
    var result = aasa.replace(':appID', process.env.APPLE_APP_ID);
    res.set('Content-Type', 'application/json');
    res.status(200).send(result);
});

// const assetlinks = fs.readFileSync(__dirname + '/static/assetlinks.json');

// app.get('/.well-known/assetlinks.json', function(req, res, next) {
//   res.set('Content-Type', 'application/json');
//   res.status(200).send(assetlinks);
// });

app.get('/*/requests/:requestId', handleRedirect);

app.get('/*/request/:serviceCode', handleRedirect);


app.use(function(req, res, next) {
  const targetUrl = process.env.TARGET_URL + req.originalUrl;
  res.redirect(targetUrl);
});





// start on the passed in port, or use the default
app.listen(process.env.PORT || 3000);