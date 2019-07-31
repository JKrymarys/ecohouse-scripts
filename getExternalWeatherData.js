var BigQuery = require("@google-cloud/bigquery");
var axios = require("axios"); // sure?

var projectId = "ecohouse-9136c";

var bigquery = new BigQuery({
  projectId: projectId
});

var datasetName = "ecohouse_dataset";
var tableName = "weather_forecast";

exports.getExternalWeatherData = (req, res) => {
  let fiveDays3hoursApi =
    "https://api.openweathermap.org/data/2.5/forecast?id=3093133&appid=3c786bff59e49394d1d9b34220351622&units=metric";
  let currentWatherApi =
    "https://api.openweathermap.org/data/2.5/weather?id=3093133&appid=3c786bff59e49394d1d9b34220351622&units=metric";

  axios.get(fiveDays3hoursApi).then(data => {
    let tempData = data.data.list;
    console.log("tempData", tempData);

    let values = tempData.map(x => {
      return {
        datetime: new Date(x.dt*1000).toISOString().slice(0, 19).replace('T', ' '), 
        // datetime: new Date(x.dt*1000).toISOString().slice(0, 19).replace('T', ' '), 
       // datetime: x.dt,
        temp: x.main.temp,
        pressure: x.main.pressure,
        humidity: x.main.humidity
      };
    });

    bigquery
      .dataset(datasetName)
      .table(tableName)
      .insert(values)
      .then(function() {
        console.log("Inserted rows");
        callback(); // task done
      })
      .catch(function(err) {
        if (err && err.name === "PartialFailureError") {
          if (err.errors && err.errors.length > 0) {
            console.log("Insert errors:");
            err.errors.forEach(function(err) {
              console.error(err);
            });
          }
        } else {
          console.error("ERROR:", err);
        }

        callback(); // task done
      });
  });
};


