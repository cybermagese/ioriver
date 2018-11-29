const logger = require('winston');
const log = logger.createLogger({level:'debug',transports:[new logger.transports.Console]});

module.exports = {
    logger: logger,
    log:log
}