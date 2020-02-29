const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const util = require('util');
const bodyParser = require('body-parser');
const exec = util.promisify(require('child_process').exec);
const express = require('express');
const server = require('http').createServer();
const rpn = express();
const logger = require('./src/logger');
logger.init();
const winston = require('winston');

const db = new sqlite3.Database('./rpn.db');
const tunnels = {};

// Kill all processes
process.on('exit', (code) => {
  // kill all workers
  // tunnels.forEach((tunnel) => {  
  //   tunnel.stdin.pause();
  //   tunnel.kill();
  // });
});

// Option to force kill all tunnels on boot
async function pKill() {
  try {
    const { stdout, stderr } = await exec('pkill frps');
    winston.info('pkill stdout:', stdout);
    winston.info('pkill stderr:', stderr);
  } catch (err) {
    winston.info('pkill done: nothing to kill');
  }
}
pKill();

// Pull in database
getRecords();
function getRecords() {
  db.all("SELECT * FROM connections WHERE disabled = 0", (err, rows) => {
    const mapConnections = {};
    Object.assign(mapConnections, tunnels);

    rows.forEach(row => {
      if (mapConnections[row.full_domain]) {
        delete mapConnections[row.full_domain];
      }
      bootReverseProxy(row.full_domain);
    });

    // Kill remaining processes
    Object.keys(mapConnections).forEach(item => {
      delete tunnels[item];

      mapConnections[item].stdin.pause();
      mapConnections[item].kill();
    });
  });
}

function bootReverseProxy(fullDomain, keepGoing) {
  if (tunnels[fullDomain]) {
    // winston.warn('Auto DNS: Tunnel already setup');
    if (!keepGoing || keepGoing !== true) {
      return;
    }
  }

  try {
    tunnels[fullDomain] = spawn(path.join(__dirname, 'frp/frps'), ['-c', `./${fullDomain}.ini`], {
      cwd:  path.join(__dirname, `../../frp-config`)
    });

    tunnels[fullDomain].stdout.on('data', (data) => {
      winston.info(`${fullDomain}: ${data}`);
    });
    
    tunnels[fullDomain].stderr.on('data', (data) => {
      winston.warn(`${fullDomain}[STDERR]: ${data}`);
    });

    tunnels[fullDomain].on('close', (code) => {
      if (!tunnels[fullDomain]) {
        winston.info(`Auto DNS: Tunnel for ${fullDomain} has been disabled. Will not reboot!`);
        return;
      }
      winston.info(`Auto DNS: Tunnel Closed for ${fullDomain}. Attempting to reboot`);
      setTimeout(() => {
        winston.info('Auto DNS: Rebooting Tunnel');
        // delete tunnels[fullDomain];
        bootReverseProxy(fullDomain, true);
      }, 4000);
    });

    winston.info(`RPN: Secure Tunnel Established to ${fullDomain}`);
  }catch (err) {
    winston.error(`Failed to boot FRP`);
    winston.error(err.message);
    return;
  }
}

// Magic Middleware Things
rpn.use(bodyParser.json());
rpn.use(bodyParser.urlencoded({ extended: true }));

rpn.get('/reload', (req, res) => {
  res.json({});
  getRecords();
});

rpn.post('/force-reload/domain/', (req, res) => {
  if (!req.body.fullDomain) { return res.status(500).json({ error: 'Invalid Input' }); }
  
  if (!tunnels[req.body.fullDomain]) {
    console.log('Force Reload: tunnel not found')
    return res.status(500).json({ error: 'No running process found' });
  }

  tunnels[req.body.fullDomain].stdin.pause();
  tunnels[req.body.fullDomain].kill();

  res.json({});
});

// Start Server
server.on('request', rpn);
server.listen(900, () => {
  winston.info(`Server Booted on Port: 900`);
});