const logger = require('winston');
const transports = {console: new logger.transports.Console};
const log = logger.createLogger({level:'info',transports:[transports.console]});

module.exports = {
    logger: logger,
    log:log,
    transports:transports
}