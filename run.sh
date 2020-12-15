#!/bin/bash

echo "PORT:             $PORT"
echo "DSTU2_HOST:       $DSTU2_HOST"
echo "DSTU3_HOST:       $DSTU3_HOST"
echo "DATA_SERVER_HOST: $DATA_SERVER_HOST"
echo "UI_HOST:          $UI_HOST"


sed -e s@DSTU2_HOST@$DSTU2_HOST@g -e s@DSTU3_HOST@$DSTU3_HOST@g config/providers.json.template > providers.json

# echo 'providers.js:\n' && cat providers.json


sed -e s@DATA_SERVER_HOST@$DATA_SERVER_HOST@g -e s@UI_HOST@$UI_HOST@g config/config.js.template > config.js

# echo 'config.js:\n' && cat config.js


/usr/local/bin/node DiscoveryData
