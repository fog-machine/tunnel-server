# For Ubuntu 18.04 ONLY
# TODO: Setup IP tables
# TODO: setup SQLite DB before installing PM2

echo
echo Welcome to the RPN Server Install Script
echo
echo 'Press any key to continue'
read 

stopAskingUser=no
domains=()

while [ "$stopAskingUser" = no ]
do
    tput reset
    echo
    stopAskingUser=yes
    echo 'What domain is this server for? (ex: "fogmachine.io")'
    read newDomain
    domains+=("$newDomain")

    tput reset
    echo

    read -r -p "Add Another Domain? [y/N]" response
    echo $response
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        stopAskingUser=no
    fi
done

tput reset
echo
echo 'What is your API Domain? (ex: api-00.fogmachine.io)'
echo
echo
read apiDomain

tput reset
echo
echo 'Domains this server will register wildcard SSL certificates for:'
echo ${domains[*]}
echo
echo 'server api domain:'
echo $apiDomain
echo

read -r -p "Is that correct? [Y/n]" response
echo $response
if [[ $response =~ ^([nN][oO]|[nN])$ ]]; then
    exit 1
fi

# Update system
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
apt update -y
apt upgrade -y
apt autoremove -y

# APT Install
apt install -y curl git nginx

# Install Node JS
apt install -y nodejs

# For FRP ini files
mkdir frp-config
mkdir api-key
mkdir domain-info

# initiate file
touch domain-info/wildcards

# Generate API key
echo $(openssl rand -base64 128) > api-key/jwt.key

# Clone Repo
git clone git@github.com:fog-machine/tunnel-server.git

# Install
cd tunnel-server
npm install
chmod 755 frp/frps

# Setup NGINX Config
allDomainString=""
defaultProxyString=""

for i in "${domains[@]}"
do
    allDomainString+=" *.${i}"
    defaultProxyString+="
server {
    listen       443 ssl;
    server_name  *.${i};
    ssl_certificate /etc/ssl/certs/${i}.pem;
    ssl_certificate_key /etc/ssl/private/${i}.key;

    return       404;
}
"
done

echo "
server {
    listen 80;
    server_name ${allDomainString};
    rewrite     ^   https://\$host\$request_uri? permanent;
}
${defaultProxyString}" > /etc/nginx/sites-enabled/default

echo "
server {
    listen 443 ssl;
    server_name ${apiDomain};

    ssl_certificate /etc/ssl/certs/api.pem;
    ssl_certificate_key /etc/ssl/private/api.key;

    # Turn on OCSP stapling as recommended at
    # https://community.letsencrypt.org/t/integration-guide/13123
    # requires nginx version >= 1.3.7
    ssl_stapling on;
    ssl_stapling_verify on;

    location / {
        proxy_pass http://localhost:999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
    }
}" > /etc/nginx/sites-enabled/${apiDomain}

# Install pm2
cd ../..
npm install -g pm2

# config pm2
echo "module.exports = {
  apps : [{
    name   : 'rpn-tunnel-server',
    script : './index.js',
    cwd    : './tunnel-server',
    args   : []
  }, {
    name   : 'rpn-tunnel-manager',
    script : './tunnel-manager.js',
    cwd    : './tunnel-server',
    args   : []
  }]
}" > pm2.config.js

pm2 start pm2.config.js
pm2 startup systemd
pm2 save

# The rest of this script manages SSL certifcates with acme.sh
# Check out the documentation on DNS verification and modify this portion accordingly
# https://github.com/acmesh-official/acme.sh

# # Install acme.sh
# curl https://get.acme.sh | sh
# export Dynu_ClientId="XXXXXXXXXXXXXXXXXXXX"
# export Dynu_Secret="YYYYYYYYYYYYYYYYYYYY"
# # Restart terminal after installing acme.sh
# tset

# # Register wildcard certs for all domains
# for i in "${domains[@]}"
# do
#   # Run ACME.SH
#   ./.acme.sh/acme.sh --issue --dns dns_dynu -d *.${i}
# 	# Move Certs
#   ./.acme.sh/acme.sh --install-cert -d *.${i} --key-file  /etc/ssl/private/${i}.key  --fullchain-file /etc/ssl/certs/${i}.pem --reloadcmd "service nginx force-reload"
#   # log domain
#   echo "${i}" >> domain-info/wildcards
# done

# # Run ACME.SH
# ./.acme.sh/acme.sh --issue --dns dns_dynu -d ${apiDomain}
# # Move Certs
# ./.acme.sh/acme.sh --install-cert -d ${apiDomain} --key-file  /etc/ssl/private/api.key  --fullchain-file /etc/ssl/certs/api.pem --reloadcmd "service nginx force-reload"

# log domains
echo "${apiDomain}" > domain-info/api

# # Restart NGINX
# service nginx restart
