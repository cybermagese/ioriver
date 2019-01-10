var program = require('commander');
var version = require('./version');
var Server = require('./server').Server;
const {log,transports} = require('./logger');

'use strict';

module.exports = function() {

    var serverOptions = {};

    program
    .version(version)
    //.option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as the default locations', function(p) { Plugin.addPluginPath(p); })
    .option('-U, --user-storage-path [path]', 'look for user files at [path] instead of the default location (~/.ioriver)', function(p) { serverOptions.customPath=p; })
    .option('-D, --debug', 'turn on debug level logging', function() { transports.console.level='debug'; })
    .parse(process.argv);

    var server = new Server(serverOptions);

    var signals = { 'SIGINT': 2, 'SIGTERM': 15 };
    Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
      log.info("Got %s, shutting down Ioriver...", signal);

      server.stop();
      setTimeout(function (){
        process.exit(128 + signals[signal]);
      }, 5000)
      //server._api.emit('shutdown')
    });
  });

  server.run();
}