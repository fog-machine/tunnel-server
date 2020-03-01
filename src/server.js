const Joi = require('@hapi/joi');
const express = require('express');
const bodyParser = require('body-parser');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const server = require('http').createServer();
const rpn = express();
const db = require('./database').getDb();
const tunneler = require('./tunnel-manager');
const eol = require('os').EOL;

/* TODO: need to log all requests that come through this server
  Requests are infrequent and change critical stuff */

exports.setup = port => {
  // Magic Middleware Things
  rpn.use(bodyParser.json());
  rpn.use(bodyParser.urlencoded({ extended: true }));

  // Auth System
  // The key is made with the install script
  const jwtSecret = fs.readFileSync(path.join(__dirname, '../../api-key/jwt.key'), 'utf8').trim();
  rpn.use((req, res, next) => {
    // check header or url parameters or post parameters for token
    const token = req.body.token || req.query.token || req.headers['x-access-token'];
    if (!token) { return res.status(403).json({ error: 'Access Denied' }); }
  
    // verifies secret and checks exp
    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) { return res.status(403).json({ error: 'Access Denied' }); }
      next();
    });
  });

  rpn.get('/', (req, res) => {
    const domainFile = fs.readFileSync(path.join(__dirname, '../../domain-info/wildcards'), 'utf8').trim();
    res.json({ domains: domainFile.trim().split(eol) }); 
  });

  rpn.get('/connections/info', async (req, res) => {
    res.json(await db.allAsync('SELECT * FROM connections'));
  });

  rpn.post('/connection/add', async (req, res) => {
    const schema = Joi.object().keys({
      domain: Joi.string().required(),
      subdomain: Joi.string().pattern(/^([a-zA-Z0-9][a-zA-Z0-9-_]*[a-zA-Z0-9])+$/).required(),
      userId: Joi.string().required(),
      frpPassword: Joi.string().default(crypto.randomBytes(24).toString('base64'))
    });

    const { error, value } = schema.validate(req.body, { allowUnknown: true });
    if (error) { return res.status(500).json({ error: 'Input Validation Error' }); }

    const fullDomain = value.subdomain + '.' + value.domain; 

    // Make sure domain doesn't conflict with api domain
    if (fullDomain === fs.readFileSync(path.join(__dirname, '../../domain-info/api'), 'utf8').trim()) {
      return res.status(422).json({ error: 'Cannot register the api domain' });
    }

    // Make sure we support the domain
    const supportedDomains = fs.readFileSync(path.join(__dirname, '../../domain-info/wildcards'), 'utf8').trim().split(eol);
    if (supportedDomains.indexOf(value.domain) === -1) {
      return res.status(422).json({ error: 'Domain not supported' });
    }

    try {
      const row = await db.getAsync('SELECT * FROM connections WHERE full_domain = ?', [fullDomain]);
      // Domain already register, re-enable it
      if (row) {
        await db.runAsync('UPDATE connections SET disabled = 0, management_server_user_id = ?, frp_password = ? WHERE full_domain = ?', [value.userId, value.frpPassword, fullDomain]);
        tunneler.initiateTunnel(value.subdomain, value.domain, row.frp_bind_port, row.https_port, value.frpPassword, row.port_port);
        return res.json({
          rpnPassword: value.frpPassword,
          rpnPort: row.frp_bind_port,
          rawPort: row.port_port
        });
      }
    } catch (err) {
      return res.status(500).status({ error: 'Critical Error.  Check the logs for more information' });
    }

    // Domain Does Not Exist
    try {
      const tempDB = require('./database').getFreshSql();
      await tempDB.runAsync('BEGIN');
      const conId = await tempDB.runAsync('INSERT INTO connections (full_domain, domain, subdomain, management_server_user_id) VALUES (?, ?, ?, ?)', [fullDomain, value.domain, value.subdomain, value.userId]);
      // NOTE: This is a lazy algorithm that let's us easily manage 20,000 accounts, and fails with anything more than that
      // A better algorithm would also randomize ports
      const httpsPort = conId.lastID + 1000;
      const portPort = conId.lastID + 21000;
      const frpBindPort = conId.lastID + 41000;

      await tempDB.runAsync('UPDATE connections SET https_port = ?, port_port = ?, frp_bind_port = ?, frp_password = ? WHERE connection_id = ?', [httpsPort, portPort, frpBindPort, value.frpPassword, conId.lastID]);
      
      tunneler.initiateTunnel(value.subdomain, value.domain, frpBindPort, httpsPort, value.frpPassword, portPort);
      
      return res.json({
        rpnPassword: value.frpPassword,
        rpnPort: frpBindPort, // port for FRP
        rawPort: portPort
      });
    } catch (err) {
      await tempDB.runAsync('ROLLBACK');
      return res.status(500).status({ error: 'Critical Error.  Check the logs for more information' });
    }
  });

  rpn.post('/connection/disable', async (req, res) => {
    // Basic input validation
    if (!req.body.fullDomain) { return res.status(422).json({ error: 'Input Validation Error' }); }

    try {
      const row = await db.getAsync('SELECT * FROM connections WHERE full_domain = ?', [req.body.fullDomain]);
      if (!row) { return res.status(422).json({ error: 'Domain not registered with this server' }); }
      await db.runAsync('UPDATE connections SET disabled = 1 WHERE full_domain = ?', [req.body.fullDomain]);
    } catch (err) {
      winston.error('Critical DB Error on /connection/disable');
      return res.status(500).json({ error: 'DB Write Error' });
    }

    try {
      fs.unlinkSync(path.join('/etc/nginx/sites-enabled', req.body.fullDomain));
    } catch (err) {
      winston.error(`Failed to delete nginx config for ${req.body.fullDomain}.  Maybe it was already deleted?`);
    }

    // Remove frps.ini
    // NOTE: Removing this before killing frps will throw an error
    // fs.unlinkSync(path.join(__dirname, `../../frp-config/${req.body.fullDomain}.ini`));

    tunneler.restartNginx(req.body.fullDomain);
    res.json({ });

    // shutdown FRP instance
    axios.get(`http://localhost:900/reload`).catch(err => {
      winston.error('Axios request error on /connection/disable');
    });
  });

  server.on('request', rpn);
  server.listen(port, () => {
    winston.info(`Server Booted on Port: ${port}`);
  });
}
