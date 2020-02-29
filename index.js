const logger = require('./src/logger');
logger.init();
const winston = require('winston');
const path = require('path');

require('./src/database').setup(path.join(process.cwd(), 'rpn.db'));
require('./src/server').setup(999);
