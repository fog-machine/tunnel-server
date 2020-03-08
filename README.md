## Fog Machine Tunnel Server

A tunnel server is a server that clients behind firewalls and NATs can connect to.  The tunnel server forwards incoming traffic to the client through a tunnel.  Anyone can then connect to the client's computer as if it where publicly available.


## Features

* Tunnels all TCP and UDP traffic
* Can upgrade HTTP to HTTPS
* Supports multiple tunnels at one time
* Forwards incoming traffic to the correct tunnel based off the domain/subdomain of the request
* Can tunnel through firewalls and 4G networks
* Managed with a HTTP API
* Designed as a service than can be deployed in a fleet for easy scalability.  Tunnel servers are designed to be [coordinated with a management service](https://github.com/fog-machine/manager-server)


## Setup and Install

Install script is in `/bash/install.sh`

The install script has a portion at the bottom commented out.  The commented out code sets up the SSL certificates for the server using a DNS verification method.

I use DynuDNS in this script.  If you use DynuDNS as well, you can just add in your keys and it will work. If you have another DNS provider or want to install the certs manually, [check out the documentation for acme.sh to see how.](https://github.com/acmesh-official/acme.sh)

To setup a new server from scratch, follow these steps:

- ssh into server as root
- copy install script to `~/install.sh`
- `chmod 755 install.sh`
- `./install.sh`
- check that script was successful
    - `pm2 list all` and `pm2 logs` to make sure the server is running
    - check of nginx config files
    - check `crontab -l` to make sure acme.sh add a certificate renewal job


## Platforms

This install script was designed to work on Ubuntu 18.04 on Digital Ocean servers.


## Manually Reset A Server

- Delete all files ~/frp-config
- Delete SQLite file `rpn.db`
- Delete all files in /etc/nginx/conf/sites-enabled
    - EXCEPT FOR `default`
    - EXCEPT FOR your API domain config
- `pm2 restart all`
- `service nginx restart`


## Configure Firewall

You will want to block all incoming connections for ports below 21000. Ports above 21000 should allow all incoming traffic.  Ports 22, 80, and 443 need to allow incoming connections as well.


## API

Tunnel servers are meant to be used in a fleet and coordinated by a separate management service.  As a result, the API is really simple.  

There is an authentication system, but no fine grained permissions systems. If you have the auth key you have admin level access.  You're key is generated with the install script and saved to `~/api-key/jwt.key`.  To access the API sign an empty JWT with that key and attach it to the `x-access-token` header.

The API endpoints are:

* `/` GET - Gets server info, which is just a list of domains the server supports
* `/connections/info` GET - Gets status of all tunnels registered with server
* `/connection/add` POST - Adds or re-enables a tunnel
* `/connection/disable` POST - Disables a tunnel


## Connecting You're First Tunnel

This is just for testing purposes. The manager service handles all accounts and tunnel creation and destruction. 

This script will show you how to add a new tunnel and connect to it.  You will need to get the key from the `~/api-key/jwt.key` file on your tunnel server before doing starting.

```javascript
// Sign a token
const jwt = require('jsonwebstoken');
const serverKey = 'KEY YOU GOT FROM ~/api-key/jwt.key';
const token = jwt.sign({}, serverKey);
console.log(token); // prints out the jwt

// Send a add tunnel request to the tunnel server
const axios = require('axios');
const res = axios({
    method: 'post',
    url: `https://YOUR-DOMAIN.COM/connection/add`, 
    headers: { 'accept': 'application/json', 'x-access-token': token },
    responseType: 'json',
    data: {
        "subdomain": 'test',
        "domain": 'YOUR-DOMAIN.COM',
        "userId": '5', // used by manager service. It doesn't matter what you put in here
        "frpPassword": 'YOUR_FRP_PASSWORD'
    }
}).catch(err => console.log(err));

// The response contains info on your tunnel configuration
console.log(res);
```

Then you have to make an FRP config file.  There are many ways to setup the FRP config.  The way shown here sets up the config to convert HTTP to HTTPS traffic:

```ini
[common]
server_addr = 100.000.000.000 # Tunnel server IP
server_port = 5555 # this is returned in the tunnel creation responses
token = YOUR_FRP_PASSWORD

[web]
type = http
local_ip = 127.0.0.1
custom_domains = test.YOUR_DOMAIN.COM
local_port = 2000 # port your webserver is running on
```

And finally launch frp with:

```bash
./frpc -c /path/to/frpc.conf
```

The FRP client can be [downloaded from the FRP github page](https://github.com/fatedier/frp/releases)

FRP configuration is [automated in the Fog Machine client](https://github.com/fog-machine/basic-client).


## Limitations

Let's encrypt only let's you install 5 of the same certificates each week. This means you can only setup 5 tunnel servers a week.  There is a workaround where you can get an extra 5 certificates a week by changing the install script:

```bash
# original script
./.acme.sh/acme.sh --issue --dns dns_dynu -d *.${i}
```

```bash
# modified script
./.acme.sh/acme.sh --issue --dns dns_dynu -d *.${i} -d ${i}
```


## TODO

This project is still in the early stages of development.  There's a lot of improvements to be made:

* Setup IP tables on install
* Add support for Wireguard.  When tunnels are created the user should be able to choose between FRP and Wireguard
* Tunnel processes are managed by a NodeJS program.  This was done to get the program finished as fast as possible.  There are better ways to do this
* Improve installation method to support more platforms
* Need scripts to add new domains, change API domain, etc.