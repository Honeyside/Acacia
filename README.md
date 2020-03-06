# Acacia – The Node.js Proxy Server

Acacia is the Node.js proxy server. Entirely written in Node.js, it supports reverse proxy, static file serving, PHP server via PHP-FPM (FastCGI), DNS proxy, load balancing, Let’s Encrypt automatic free SSL certificates, pathname rewriting, changing origin, custom headers, path mounting and much much more! Also, it supports WebSockets and can run WordPress.

## Honeyside Support
Welcome to the Honeyside experience! You can access the full [Acacia documentation online](https://acacia.honeyside.it) and the [Honeyside Support Forum](https://forum.honeyside.it) is here for you. Also take a look at our landing page, because… well, it’s nice ❤

Please be aware that open source support is low priority. Paid products come first! Nonetheless, the Honeyside community will always be there to answer your questions and challenge your proposals.

### Support Us
Support us by buying one of our [paid products](https://www.honeyside.it/), too!
* [Clover](https://codecanyon.net/item/clover-realtime-messaging-audio-video-conferencing-web-app-nodejs-react-webrtc-socketio/25737452) is an instant messaging & conferencing web app with audio / video capabilities, both in one-to-one calls and in group calls with multiple remote peers! - [Available on CodeCanyon](https://codecanyon.net/item/clover-realtime-messaging-audio-video-conferencing-web-app-nodejs-react-webrtc-socketio/25737452)

## Features
Acacia offers the following features:
* Listens on any port of choice, either with or without SSL. By default, 80 and 443.
* Hostname / IP matching & default hostname.
* Hostname / IP aliasing (serve same content as another configured hostname, without redirecting).
* Path regex matching.
* SSL certificates, manual or provided by Let’s Encrypt. Let’s Encrypt certificates require port 80 to be publicly exposed, but provide automatic renewal.
* Hostname redirects with matching port and protocol.
* Redirects, both temporary and permanent.
* Reverse proxy.
* Static file serving from a specified location.
* SSL redirect to 443.
* Path rewrite when proxying requests.
* Change origin feature to forward or not forward the hostname to the target.
* WebSocket reverse proxying.
* Mount static directories on a specific path.
* Balance load by sequentially proxying to different targets.
* Log everything to file.
* DNS proxy.
* PHP server via PHP-FPM (FastCGI).
* WordPress support.
* WordPress permalinks supported.

## Contributing
We are looking for contributors! Feel free to open an issue, write on [the Honeyside forum](https://forum.honeyside.it) or send us a pull request.

## Versioning
We use SemVer for versioning. For the versions available, see the tags on this repository.

## License
This project is licensed under the MIT license - see the LICENSE file for details.
