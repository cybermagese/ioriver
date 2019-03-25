'use strict';
var fs = require('fs');
var path = require('path');



module.exports = getVersion();

function getVersion() {
  var packageJSONPath = path.join(__dirname, '../package.json');
  var packageJSON = JSON.parse(fs.readFileSync(packageJSONPath));
  return packageJSON.version;
}