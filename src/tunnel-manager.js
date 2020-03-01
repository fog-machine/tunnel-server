const fs = require('fs');
const path = require('path');
const util = require('util');
const winston = require('winston');
const axios = require('axios');
const exec = util.promisify(require('child_process').exec);
const eol = require('os').EOL;

exports.initiateTunnel = async (subdomain, domain, frpPort, httpsPort, frpPassword, portPort) => {
  const fullDomain = subdomain + '.' + domain; 
  
  // Update NGINX file
  try{
    let conf = fs.readFileSync(path.join(__dirname, '../nginx-conf/https.conf'), 'utf8');
    conf = conf.replace('__PORT__', httpsPort);
    conf = conf.replace(new RegExp('__DOMAIN__', 'g'), domain);
    conf = conf.replace('__FULLDOMAIN__', fullDomain);

    fs.writeFileSync(path.join('/etc/nginx/sites-enabled/', fullDomain), conf);
  } catch (err) {
    winston.error(`Failed to update NGINX config for ${fullDomain}`);
    winston.error(err.message);
  }

  // Restart NGINX
  this.restartNginx(fullDomain)

  // setup frps.ini file
  try{
    const iniString = `[common]${eol}bind_port = ${frpPort}${eol}vhost_http_port = ${httpsPort}${eol}allow_ports = ${portPort}${eol}token = ${frpPassword}${eol}custom_404_page = ${path.join(__dirname, '../frp/404.html')}`
    fs.writeFileSync(path.join(__dirname, `../../frp-config/${fullDomain}.ini`), iniString);
  } catch(err) {
    winston.error(`Failed to write FRP ini to ${fullDomain}`);
    winston.error(err.message);
  }

  // boot frps
  axios.get(`http://localhost:900/reload`).catch(err => {
    winston.error('Axios request error on /connection/add');
  });
}

exports.restartNginx = async (domain) => {
  // Restart NGINX
  try {
    const { stdout, stderr } = await exec('sudo service nginx reload');
    winston.info(stdout);
    if(stderr) {
      winston.error(stderr);
    }
  }catch (err) {
    // NOTE: This is a SERIOUS error that should be handled immediately 
    // TODO: This error should be email directly to an admin user.
    winston.error(`Failed to restart NGINX after adding domain ${domain}`);
    winston.error(err.message);
  }
}
