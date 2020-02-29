## Modify Install Script

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
- Delete all files inf /etc/nginx/conf/sites-enabled
    - EXCEPT FOR `default`
    - EXCEPT FOR `api.YOUR-DOMAIN`
- `pm2 restart all`

## Setup Firewall

You will want to block all incoming connections for ports below 21000. Ports above 21000 should allow all incoming traffic.  Ports 22, 80, and 443 need to allow incoming connections as well.

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