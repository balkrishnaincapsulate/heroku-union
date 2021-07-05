let express = require('express');
let router = express.Router();
let multer = require('multer');
let request = require('request');
var mime = require('mime');
var async = require("async");

const config = require('../conf/default');

var upload = multer({ storage: multer.memoryStorage() });

/* GET home page. */
router.post('/', upload.single('cFile'), async function(req, res, next) {
  console.log('----> Request File:');
  console.log(req.file);
  console.log('----> Request Body:');
  console.log(req.body);

  if (!req.body.api_key) {
    res.status(404).send('API Key not provided: Unable to create a file attachment');
  } else if (!req.file && !req.body.content_version && !req.body.content_version_id) {
    res.status(400).send('No file detected. Please attach a file and re-submit.');
  } else if(req.file && !req.body.service_request_id) {
	  retrieveToken(req.headers) //login
    .then((tokenJson) => {
      return verifyAPIToken(req, tokenJson);
    }).then((tokenJson) => {
      return createExternalFile(req, tokenJson);
    })
    .then((resultsJson) => {
      return postFileToChatter(res, req, resultsJson.community_user_token, resultsJson.token, resultsJson.FileId);    
    }).then((result) => {
      return createContentDist(result);
    }).then((result) => {
		var mimeType = result.mime_type;
		var resType = result.resource_type;
		var format = result.format;
		if(result.format!='' && result.format.toLowerCase()=='heic')
		{
			mimeType = 'application/heic';
			resType = 'application - heic';
			format = 'heic';
		}
      /*const returnObj = {
        filename: result.filename,
        public_url: result.public_url,
        format: result.format,
        resource_type: result.resource_type,
        content_version_id: result.content_version_id,
        mime_type: result.mime_type
      }*/
	  
	  const returnObj = {
        filename: result.filename,
        public_url: result.public_url,
        format: format,
        resource_type: resType,
        content_version_id: result.content_version_id,
        mime_type: mimeType
      }
      res.status(200).send(returnObj);
    })
    .catch((err) => {
      console.log('----> Catch triggered from reject. Returned Error: ' + JSON.stringify(err));
	    console.log('----> Catch triggered from reject. Returned Error: ' +err.stack);
      res.status(err.code || 500).send(JSON.stringify(err.message) || JSON.stringify(err));
    });
  } else if (req.content_version && !req.body.service_request_id) {
    res.status(400).send('No service_request_id detected.');
  } else if (!req.file && req.body.content_version) {
     retrieveToken(req.headers) //login
    .then((tokenJson) => {
      return verifyAPIToken(req, tokenJson);
    }).then((tokenJson) => {
      return retrieveServiceRequestId(req, tokenJson);
    }).then((result) => {
      var resultOut = {results : []};
      
      async.eachSeries(req.body.content_version, async (value, callback) =>{
        console.log('====== value =========', JSON.stringify(value));
        if(value) {
          result.contentVersionId = value;
          console.log('======= result ========== ' + JSON.stringify(result));
          var filedetails = await getFileName(result);
          console.log('========= filedetails ==========', JSON.stringify(filedetails));
          result.filename = filedetails.filename;
          try {
            result = await createContentDist(result);
            var CheckEfr = await checkExternalfileExists(result);
            if(!CheckEfr) {
              await createExternalFileAndLink(result);
            }
            await createDocumentLink(result);
            // await createContentDist(result).then(async (result) => {
            //   console.log('Processing Version Type '+JSON.stringify(result));
            //   await checkExternalfileExists(result).then(async (res) => {
            //     if(!res) {
            //       await createExternalFileAndLink(result).then(async () => {
            //         await createDocumentLink(res);
            //       });
            //     } else {
            //        await createDocumentLink(res);
            //     }
            //   });
            // });
            console.log('============= Ending process======================');
            // result2.token = result.token;
            //result3 = createDocumentLink(result2);
            const returnObj = {
              filename: result.filename,
              public_url: result.public_url,
              content_version_id: value
            }
            resultOut.results.push(returnObj);
          } catch(err)  {
            console.log('----> Catch triggered from reject. Returned Error: ' + JSON.stringify(err));
            console.log('----> Catch triggered from reject. Returned Error: ' +err.stack);
            resultOut.results.push(err);
          }
        }
      })
      return resultOut;
    }).then((result) => {
      res.status(200).send(result);
    })
  } else {
    console.log('Processing as a a File ');
    retrieveToken(req.headers) //login
    .then((tokenJson) => {
      return verifyAPIToken(req, tokenJson);
    })
    .then((tokenJson) => {
      return retrieveServiceRequestId(req, tokenJson);
    })
    .then((resultsJson) => {
      return postFileToChatter(res, req, resultsJson.community_user_token, resultsJson.token, resultsJson.srid);    
    })
    .then((result) => {
      return createContentDist(result);
    })
    .then((result) => {
      return createExternalFileAndLink(result);
    })
    .then((result) => {
      const returnObj = {
        filename: result.filename,
        public_url: result.public_url,
        format: result.format,
        resource_type: result.resource_type,
        content_version_id: result.content_version_id
      }
      res.status(200).send(returnObj);
    })
    .catch((err) => {
      console.log('----> Catch triggered from reject. Returned Error: ' + JSON.stringify(err));
	    console.log('----> Catch triggered from reject. Returned Error: ' +err.stack);
      res.status(err.code || 500).send(JSON.stringify(err.message) || JSON.stringify(err));
    });
  }
});

const retrieveToken = (reqHeader) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.oauth_url_ext),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      form: config.oauth
    };
    console.log('----> Obtaining OAuth Token...');
    console.log('org_url', JSON.stringify(options));
    request.post(options, (err, resp, body) => {
      const resultJson = JSON.parse(body);
      resultJson.token = resultJson.access_token
      
      //If Bearer token is paased for community user
      if(reqHeader && reqHeader.authorization) {
        resultJson.community_user_token = reqHeader.authorization.replace("Bearer ", "");
      }
      
      if (!err) {
        console.log('----> Token Obtained. Verifying that API Key present and valid with server...' + JSON.stringify(resultJson));
        resolve(resultJson);
      } else {
        console.log('Error from retrieveToken: ' + err);
        reject({ code: 400, message: 'Unable to save file to server. Please try again later.' });
      }
    });
  });
};

const verifyAPIToken = (req, resultJson) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.x311_security_url_ext) + req.body.api_key.trim(),
      headers: {
        'Authorization': 'Bearer ' + (resultJson.community_user_token ? resultJson.community_user_token : resultJson.access_token),
      }
    }
    console.log('----> Options[Query]: ' + JSON.stringify(options));
    // Obtain the SR ID using the Case Number
    request.get(options, (err, resp, body) => {
	  try {
		  const queryResultJson = body ? JSON.parse(body) : null;
      resultJson.token = resultJson.token;
		  console.log("verifyAPIToken response: ", JSON.stringify(queryResultJson));
		  if(queryResultJson.can_upload){
        console.log('----> API Key Verifyed. Proceed to get SR ID for file upload...');
			  resolve(resultJson);
		  }else{
			  console.log(JSON.stringify(err));
				reject({ code: 400, message: 'API Key provided cannot upload' });
		  }
			
	  } catch(err) {
      console.log(JSON.stringify(err));
      reject({ code: 400, message: 'API Key provided is not valid' });
    }

      //if (!err && queryResultJson.totalSize > 0) {

        // TODO: Do verifications of API key limits, etc? Needs verification.
		
      //} else {
      //  console.log('----> Error: ' + err);
      //  reject({ code: 400, message: 'API Key provided is not valid.' });
      //} 
    });
  });
};

const retrieveServiceRequestId = (req, resultJson) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.query_url_ext) + '?q=' + ("Select Id From Case Where CaseNumber = '" + req.body.service_request_id.trim() + "'"),
      headers: {
        'Authorization': 'Bearer ' + (resultJson.community_user_token ? resultJson.community_user_token : resultJson.access_token),
      }
    }
    // Obtain the SR ID using the Case Number
    request.get(options, (err, resp, body) => {
      console.log('retrieveServiceRequestId options: ', options);

      const queryResultJson = body ? JSON.parse(body) : null;
      const srid = queryResultJson && queryResultJson.totalSize > 0 ? queryResultJson.records[0].Id : null;

      if (!err && srid) {
        console.log('----> Case ID obtained. Proceeded to upload file to Chatter...');
        const combinedResults = {
          token: resultJson.access_token,
          community_user_token: resultJson.community_user_token,
          srid: srid
        }
        resolve(combinedResults);
      } else {
        console.log('Error from retrieveServiceRequestId: ' + err);
        reject({ code: 400, message: 'Service Request Id was not provided or is not valid.' });
      } 
    });
  });
};

const postFileToChatter = (res, req, community_user_token, token, srId) => {
  return new Promise((resolve, reject) => {
    const file = req.file;
    const json = {
      "body": {"messageSegments":[{"type":"Text","text":""}]},
      "capabilities":{
        "content":{
           "title": file.originalname,
           "description": (req.body.description ? req.body.description : '')
        }
      },
      "feedElementType":"FeedItem",
      "subjectId": srId,
      "visibility": "AllUsers"
    };

    let data = {
      "feedElementFileUpload": {
        "value": file.buffer,
        "options": {
          "filename": file.originalname,
          "contentType": file.mimetype
        }
      },
      "feedElement": JSON.stringify(json)
    };

    const options = {
      url: (config.org_url + (community_user_token ? config.community_chatter_url_ext : config.chatter_url_ext)),
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + (community_user_token ? community_user_token : token),
        'Content-Type': 'application/json;charset=UTF-8'
      },
      formData: data
    }
    
    request.post(options, (err,resp,body) => {
      if (!err && body) {
        body = JSON.parse(body);
        console.log('----> File to chatter successful. Proceeding in creating ContentDistribution...'+JSON.stringify(body));
        var contentVersionId = '';
        if("capabilities" in body){
          if("content" in body.capabilities){
            contentVersionId = body.capabilities.content.versionId
          }
        }
        const resultsJson = {
          "token": token,
          "srid": srId,
          "filename": req.file.originalname,
          "contentVersionId": contentVersionId,
          "mime_type": body.capabilities.content.mimeType,
          "format" : body.capabilities.content.fileExtension,
          "resource_type": body.capabilities.content.fileType
        };
        resolve(resultsJson);
      } else {
        console.log('Error while uploading file: ' + err);
        reject({code: 400, message: 'Failed to upload file. Please try again later.'});
      }
    });
  });
};

const createContentDist = (resultsJson) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.sobjects_url_ext) + '/ContentDistribution',
      headers: {
        'Authorization': 'Bearer ' + resultsJson.token,
        "Content-Type": "application/json"
      },
      json: {
        "ContentVersionId": resultsJson.contentVersionId, 
        "Name": resultsJson.filename,
        "RelatedRecordId": resultsJson.srid,
        "PreferencesNotifyOnVisit": false
      }
    }
	
	  console.log('============ createContentDist ===========: ' + JSON.stringify(options));
    request.post(options, (err, resp, body) => {
		  console.log('----> body[Query]: ========= ' + JSON.stringify(body));
      if (!err && body) {
        const options = {
          url: (config.org_url + config.query_url_ext) + '?q=' + ("Select id,ContentDocumentId, DistributionPublicUrl From ContentDistribution Where Id = '" + body.id + "'"),
          headers: {
            'Authorization': 'Bearer ' + resultsJson.token,
          }
        }
		
		
		    console.log('----> Options[Query]: ' + JSON.stringify(options));
        // Get the distribution public url.
        request.get(options, (err, resp, body) => {
          console.log('========== Result ========== ' + JSON.stringify(body));
          if (!err && body) {
            body = JSON.parse(body);
            const dist = body.records[0];
			      resultsJson.ContentDocumentId = dist.ContentDocumentId;
            const endpeice = dist.DistributionPublicUrl.substring(dist.DistributionPublicUrl.indexOf('/a/'),dist.DistributionPublicUrl.length);
            const frontPeice = dist.DistributionPublicUrl.substring(0,dist.DistributionPublicUrl.indexOf('.com')+4);
            resultsJson.public_url = frontPeice + '/sfc/dist/version/download/?oid=' + config.org_id + '&ids=' + resultsJson.contentVersionId + '&d=' + endpeice;
            resultsJson.content_version_id = resultsJson.contentVersionId;
            //resultsJson.ContentDocumentId = dist.id;
            resultsJson.token = resultsJson.token;
            console.log('========== Result of Create Content Dist: resultsJson ========== ', resultsJson);
            resolve(resultsJson);
          } else {
            reject({ code: 400, message: 'Unable to obtain public facing url for distribution.'})
          }
        });
      } else {
        console.log('Error from createContentDist: ' + err);
        reject({ code: 400, message: 'Unable to generate public facing url for distribution of file.' });
      } 
    });
  });
};

const createDocumentLink = (resultsJson) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.sobjects_url_ext) + '/ContentDocumentLink',
      headers: {
        'Authorization': 'Bearer ' + (resultsJson.community_user_token ? resultsJson.community_user_token : resultsJson.token),
        "Content-Type": "application/json"
      },
      json: {
        "ContentDocumentId" : resultsJson.ContentDocumentId,
        "LinkedEntityId" : resultsJson.srid,
        "ShareType" : 'I'
      }
    }
    // console.log('----> resultsJson[Query]: ' + JSON.stringify(resultsJson));
    console.log('========== createDocumentLink Options[Query]: ============  ' + JSON.stringify(options));
    request.post(options, (err, resp, body) => {
		console.log('=========== ContentDocumentLink Response =============== ' + JSON.stringify(body));
      
    if (!err && body) {
       
        const options = {
          url: (config.org_url + config.query_url_ext) + '?q=' + ("Select DistributionPublicUrl From ContentDistribution Where Id = '" + body.id + "'"),
          headers: {
            'Authorization': 'Bearer ' + (resultsJson.community_user_token ? resultsJson.community_user_token : resultsJson.token),
          }
        }
		
		    console.log(' ========== ContentDisribution Options  =========' + JSON.stringify(options));
        // Get the distribution public url.
        request.get(options, (err, resp, body) => {
          if (!err && body ) {
            body = JSON.parse(body);
            console.log('=======  ContentDisribution Response =======', body);
            if(body.records && body.records.length >0) {
              const link = body.records[0];
              if(resultsJson.ContentDocumentLink){
                resultsJson.ContentDocumentLink = [];
              }
              resultsJson.ContentDocumentLink.push(link);
              resolve(resultsJson);
            } else {
              resolve(resultsJson);
            }
          } else {
            reject({ code: 400, message: 'Unable to obtain public facing url for distribution.'})
          }
        });
      } else {
        console.log('Error while generating public facing URL:  ' + err);
        reject({ code: 400, message: 'Unable to generate public facing url for distribution of file.' });
      } 
    });
  });
};

const createExternalFileAndLink = (resultsJson) => {
  return new Promise((resolve, reject) => {

    /*
      Generating mimeType, to resolve mimetype Issue with IOS From client, always sending img/jpeg from client for all file format.//#endregion
    */
   
    var re = /(?:\.([^.]+))?$/;
    var ext = re.exec(resultsJson.filename)[1];

    const options = {
      url: (config.org_url + config.sobjects_url_ext) + '/Filelink__External_File__c',
      headers: {
        'Authorization': 'Bearer ' + (resultsJson.community_user_token ? resultsJson.community_user_token : resultsJson.token),
      },
      json: {
        "FileLInk__External_ID__c": resultsJson.contentVersionId,
        "FileLInk__Public_URL__c": resultsJson.public_url,
        "FileLInk__Service__c": "Salesforce",
        "FileLink__Tags__c": "Create",
        "FileLInk__Filename__c" : resultsJson.filename,
        "FileLink__Mime_Type__c":  mime.getType(ext)
      }
    }
    request.post(options, (err, resp, body) => {
      const queryResultJson = body;

      if (!err && queryResultJson) {
        console.log('----> FileLink External File created. Proceeding to create custom External Files Related Link record...');
        const options = {
          url: (config.org_url + config.sobjects_url_ext) + '/Filelink__External_File_Relationship__c',
          headers: {
            'Authorization': 'Bearer ' + (resultsJson.community_user_token ? resultsJson.community_user_token : resultsJson.token),
          },
          json: {
            "FileLInk__Object_ID__c": resultsJson.srid,
            "FileLInk__External_File__c": queryResultJson.id,
            "FileLInk__Tags__c": "Create",
          }
        }  

        request.post(options, (err, resp, body) => {
          const queryResultJson = body;
          if (!err && queryResultJson) {
            console.log('----> FileLink External File Relation created. Returning final object result to the user.');
            resolve(resultsJson);    
          } else {
            reject({ code: 400, message: 'An error occured when syncing the external file relations. Please try again later.' });
          }
        });
      } else {
        console.log('Error while syncing external files: ' + err);
        reject({ code: 400, message: 'An error occured when syncing the external files. Please try again later.' });
      } 
    });
  });
};

const createExternalFile = (req, resultsJson) => {
  return new Promise((resolve, reject) => {
    
    /*
      Generating mimeType, to resolve mimetype Issue with IOS From client, always sending img/jpeg from client for all file format.//#endregion
    */
    var re = /(?:\.([^.]+))?$/;
    var ext = re.exec(req.file.originalname)[1];

    const options = {
      url: (config.org_url + config.sobjects_url_ext) + '/Filelink__External_File__c',
      headers: {
        'Authorization': 'Bearer ' + (resultsJson.community_user_token ? resultsJson.community_user_token : resultsJson.access_token),
      },
      json: {
        //"FileLInk__External_ID__c": resultsJson.contentVersionId,
       // "FileLInk__Public_URL__c": resultsJson.public_url,
        "FileLInk__Service__c": "Salesforce",
        "FileLink__Tags__c": "Create",
        "FileLink__Mime_Type__c": mime.getType(ext),
        "FileLInk__Filename__c" : req.file.originalname
      }
    }
	  console.log('options External File ');
    request.post(options, (err, resp, body) => {
      const queryResultJson = body;
	    console.log('============= Created External File =========' + JSON.stringify(queryResultJson));

      if (!err && queryResultJson) {
        resultsJson.FileId = queryResultJson.id;
        resultsJson.token = resultsJson.access_token;
        resolve(resultsJson);    
      } else {
        console.log('Error while syncing external files: ' + err);
        reject({ code: 400, message: 'An error occured when syncing the external files. Please try again later.' });
      } 
    });
  });
};

const checkExternalfileExists = (resultJson) => {
  console.log('=========== Calling CheckExternalFile ==============');
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.query_url_ext) + '?q=' + ("SELECT Id, ContentDocumentId, Title, FirstPublishLocationId FROM ContentVersion WHERE id = '" + resultJson.contentVersionId.trim() + "'"),
      headers: {
        'Authorization': 'Bearer ' + resultJson.token,
      }
    }
    console.log('----- Fetching Content Version ----- ', options);
    request.get(options, (err, resp, body) => {
      console.log('------ Content Version Fetched -------- ' , JSON.parse(body));
      if(!err) {
        var body = JSON.parse(body);
        
        const EFoptions = {
          url: (config.org_url + config.query_url_ext) + '?q=' + ("SELECT Id, FileLInk__External_ID__c FROM FileLInk__External_File__c WHERE FileLInk__External_ID__c = '" + body.records[0].ContentDocumentId.trim() + "'"),
          headers: {
            'Authorization': 'Bearer ' + resultJson.token,
          }
        }
  
        console.log('======= EOptions ======', EFoptions);
        request.get(EFoptions, (err, resp, body) => {
          console.log('===== Result EFL ======', JSON.parse(body));
          var EFLbody = JSON.parse(body);
          if (!err && EFLbody.records.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          } 
          if(err) {
            console.log('Error with ContentVersionId: ' + err);
            reject({ code: 400, message: 'Content Version Id was not provided or is not valid.' });
          }
        });
      } else {
        console.log('Error with ContentVersionId: ' + err);
        reject({ code: 400, message: 'Content Version Id was not provided or is not valid.' });
      }
    });
  });
}

const getFileName = (resultJson) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: (config.org_url + config.query_url_ext) + '?q=' + ("SELECT Id, ContentDocumentId, Title, FirstPublishLocationId FROM ContentVersion WHERE id = '" + resultJson.contentVersionId.trim() + "'"),
      headers: {
        'Authorization': 'Bearer ' + resultJson.token,
      }
    }
    console.log('----- Fetching Content Version ----- ', options);

    request.get(options, (err, resp, body) => {
      console.log('------FileName Content Version Fetched -------- ' , JSON.parse(body));
        if (!err && body) {
        var body = JSON.parse(body);
          var object = {
            filename: body.records[0].Title
          };
          resolve(object);
        } else {
          console.log('Error with ContentVersionId: ' + err);
          reject({ code: 400, message: 'Content Version Id was not provided or is not valid.' });
        }
    });
  });
}

module.exports = router;
