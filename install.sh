#!/bin/bash
# Discovery Data Server installer
# 20200821/SK

# Get component locations
THIS_ADDR=`dig @resolver1.opendns.com ANY myip.opendns.com +short`
echo -n 'DNS/IP address of the Discovery FHIR Demo Data Providers [localhost]: '
read DEMODATA_ADDR
if [ -z $DEMODATA_ADDR ]; then
   DEMODATA_ADDR=localhost
fi
echo -n 'DNS/IP address & (optional) port of the Discovery App Server (address:port): '
read APP_ADDR
if ! [[ $APP_ADDR =~ .+:.+ ]]; then
   APP_ADDR=$APP_ADDR:3000
fi

# Install prerequisites
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install node modules
sudo npm install

# Rewrite service file to reference install dir
SUBST=s@WORKINGDIR@$PWD@g
sed $SUBST DiscoveryData.service.template > DiscoveryData.service

# Rewrite providers file to reference demo data server
SUBST=s@DEMODATA@$DEMODATA_ADDR@g
sed $SUBST providers.json.template > providers.json

# Rewrite config file to reference above values
SUBST1=s@THIS@$THIS_ADDR@g
SUBST2=s@APP@$APP_ADDR@g
sed -e $SUBST1 -e $SUBST2 config.js.template > config.js

# Setup and start service
sudo systemctl stop DiscoveryData.service
sudo systemctl disable DiscoveryData.service
sudo systemctl enable $PWD/DiscoveryData.service
sudo systemctl start DiscoveryData.service

# Done
echo
echo Installation complete!
