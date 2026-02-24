#!/bin/sh

set -e

isUrl() {
    if curl --head --silent --fail $1 2> /dev/null;
    then
        return 0
    else
        return 1
    fi
}

download(){
    curl -o $1 $2 -L
}

escape_js_string() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

API_BASE_VALUE="${API_BASE:-http://localhost:8080/api/db}"
API_BASE_ESCAPED="$(escape_js_string "$API_BASE_VALUE")"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__AGROREPORT_CONFIG__ = {
  apiBase: "$API_BASE_ESCAPED",
};
EOF

if [ "$config" != "" ] 
    then echo $config > /usr/share/nginx/html/config; 
fi

if [ "$favicon" != "" ] 
    then echo $favicon > /usr/share/nginx/html/favicon.svg; 
fi

if isUrl $logo -eq 0;
    then download "/usr/share/nginx/html/logo.png" $logo;
fi
