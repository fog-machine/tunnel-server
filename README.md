## Tunnel Server

A tunnel server is a server that clients behind firewalls and NATs can connect to.  The tunnel server forwards incoming traffic to the client through a tunnel.  Anyone can then connect to the client's computer as if it where publicly available.

Features Include:
* Tunnels all TCP and UDP traffic
* Can upgrade HTTP to HTTPS
* Supports multiple tunnels at one time
* Forwards incoming traffic to the correct tunnel based off domain and subdomain
* Can tunnel through restrictive firewalls and 4G networks
* Managed with a HTTP API
* Designed as a service than can be deployed in a fleet for easy scalability.  Tunnel servers are designed to be coordinated with a management service.


## Setup and Install

Install script is in `/bash/install.sh`

The install script has a potion at the bottom commented out.  The commented out code sets up the SSL certificates for the server using a DNS verification method.

I use DynuDNS in this script.  If you use DynyDNS as well, you can just add in your keys and it will work. If you have another DNS provider or want to install the certs manually, [check out the documentation for acme.sh to see how.](https://github.com/acmesh-official/acme.sh)


## Platforms

This install script was designed to work on Ubuntu 18.04 on Digital Ocean servers.


## Setup New Tunnel Server

- ssh into server as root
- copy install script
- `chmod 755 install.sh` for permissions
- run script
- check that script was successful
    - `pm2 list all` and `pm2 logs` to make sure the server is running
    - check of nginx config files
    - check `crontab -l`


## Manually Reset A Server

- Delete all files ~/frp-config
- Delete SQLite file `rpn.db`
- Delete all files inf /etc/nginx/conf/sites-enabled
    - EXCEPT FOR `default`
    - EXCEPT FOR `api.YOUR-DOMAIN`
- `pm2 restart all`
- `service nginx restart`


## Configure Firewall

You will want to block all incoming connections for ports below 21000. Ports above 21000 should allow all incoming traffic.  Ports 22, 80, and 443 need to allow incoming connections as well.


## API

Tunnel servers are meant to be used in a fleet and coordinated by a separate management service.  As a result, the API is really simple.  

Their is an authentication system, but there are no accounts or permissions system. If you have the auth key you have admin level access.  You're key is generated on install and saved to `~/api-key/jwt.key`.  To access the API sign an empty JWT with that key and attach it to the `x-access-token` header.

The API endpoints are:

* `/` GET - Gets server info, which is just a list of domains the server supports
* `/connections/info` GET - Gets status of all tunnels registered with server
* `/connection/add` POST - Adds or re-enables a tunnel
* `/connection/disable` POST - Disables a tunnel


## Connecting You're First Tunnel

First you need to register a tunnel through the API

```javascript
// Coming Soon

```

Then you have to connect FRP with a config like:

```bash
# Coming Soon
```


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

* Setup IP tables on install so a firewall is not needed
* Add support for Wireguard.  When tunnels are created the user should be able to choose between FRP and Wireguard
* Tunnel processes are managed by a nodeJS program.  This was done to get the program finished as fast as possible.  There are better ways to do this
* Improve installation method to support more platforms
* Need scripts to add new domains, change API domain, etc.