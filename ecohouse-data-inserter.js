var BigQuery = require('@google-cloud/bigquery'); 
var projectId = 'ecohouse-9136c'; 
 
var bigquery = new BigQuery({ 
  projectId: projectId, 
}); 
 
var datasetName = 'ecohouse_dataset'; 
var tableName = 'house_data'; 
 
exports.pubsubToBQ = function(event, callback) { 
  console.log("event", event);
//  var msg = event.textPayload; 
  var data = JSON.parse(Buffer.from(event.data, 'base64').toString()); 
   console.log(data); 
  
  bigquery 
    .dataset(datasetName) 
    .table(tableName) 
    .insert(data) 
    .then(function() { 
      console.log('Inserted rows'); 
      callback(); // task done 
    }) 
    .catch(function(err) { 
      if (err && err.name === 'PartialFailureError') { 
        if (err.errors && err.errors.length > 0) { 
          console.log('Insert errors:'); 
          err.errors.forEach(function(err) { 
            console.error(err); 
          }); 
        } 
      } else { 
        console.error('ERROR:', err); 
      } 
 
      callback(); // task done 
    }); 
};
