/*
 *
 * Honeyside
 * Acacia Proxy Server
 * Version 1.2.0
 * July 29th, 2019
 * License: MIT
 *
 */

// General dependencies
const Power = require('koa-power');
const {log} = Power;
const fs = require('fs');
const url = require('url');
const tls = require('tls');
const cluster = require('cluster');
const options = require('./options');
let Greenlock = require('greenlock');
const validator = require('validator');
let greenlock;

if (!options.powerOptions.enableConsole) {
    console.log = () => {};
    process.stdout.write = () => {};
}

if (!options.phpOptions) {
    options.phpOptions = {};
}

let defaultPHPOptions = {
    fpmPort: 9000,
    serverPort: 8080
};

options.phpOptions = {
    ...defaultPHPOptions,
    ...options.phpOptions
};

const globalOptions = options;

// Let's Encrypt Storage
let leStore = require('greenlock-store-fs').create({
    configDir: `${__dirname}/acme/certs`,
    debug: false
});

// Master process
if (cluster.isMaster) {

    // Load master config
    let config;

    if (fs.existsSync(`${__dirname}/config.js`)) {
        log('Using JS config file.'.green);
        config = require(`${__dirname}/config.js`);
    }
    else if (fs.existsSync(`${__dirname}/config.json`)) {
        log('Using JSON config file.'.green);
        config = JSON.parse(fs.readFileSync(`${__dirname}/config.json`, 'utf8'));
    }
    else {
        log('No config file found!'.red);
        process.exit(0);
    }

    !config.aliases && (config.aliases = {});
    !config.redirects && (config.redirects = {});
    !config.certs && (config.certs = {});
    !config.servers && (config.servers = {});
    !config.standard && (config.standard = []);
    !config.ssl && (config.ssl = []);
    !config.certs.default && (config.ssl = []);
    !config.panel && (config.panel = {});

    // Master dependencies
    const Koa = require('koa');
    const serve = require('koa-static');

    /* BEGIN Let's Encrypt generator */

    greenlock = Greenlock.create({
        packageAgent: 'Acacia/2.0.0',
        maintainerEmail: 'acacia@honeyside.it',
        staging: true,
        notify: (event, details) => {
            if ('error' === event) {
                // `details` is an error object in this case
                console.error(details);
            }
        },
        debug: true,
        configDir: `${__dirname}/acme/certs`,
        store: leStore,
    });

    greenlock.manager.defaults({
        agreeToTerms: true,
        subscriberEmail: 'subscriber@example.com'
    });

    let keys = Object.keys(config.certs);

    let pending = 0;

    const finaliseLetsEncrypt = domain => {
        config.certs[domain] = {
            ...config.certs[domain],
            key: `acme/certs/live/${domain}/privkey.pem`,
            cert: `acme/certs/live/${domain}/cert.pem`,
            ca: `acme/certs/live/${domain}/chain.pem`
        };
    };

    const app = new Koa();

    // or use absolute paths
    app.use(serve(__dirname + '/acme/webroot', {hidden: true}));

    const _server = app.listen(80, async () => {
        // keys.forEach(domain => {
        for (let i = 0; i < keys.length; i++) {
            let domain = keys[i];
            switch (config.certs[domain].type) {
                case 'path':
                    break;
                case 'letsencrypt':

                    if (validator.isIP(domain)) {
                        log(`Let's Encrypt does not support IP certificate generation, only domains. SSL certificate error on ${domain}.`.red);
                        return;
                    }

                    if (!validator.isFQDN(domain)) {
                        log(`Let's Encrypt can generate certificates only on valid domains. SSL certificate error on ${domain}.`.red);
                        return;
                    }

                    if (!config.certs[domain].email) {
                        log(`In order to generate a Let's Encrypt certificate, you must specify an email. SSL certificate error on ${domain}.`.red);
                        return;
                    }

                    if (!validator.isEmail(config.certs[domain].email)) {
                        log(`The email specified is invalid. SSL certificate error on ${domain}.`.red);
                        return;
                    }

                    log(`Generating Let's Encrypt certificate for ${domain}...`.yellow);

                    pending++;
                    await greenlock.add({
                        subject: domain,
                        subscriberEmail: config.certs[domain].email,
                        agreeToTerms: true,
                        challenges: {
                            "http-01": {
                                module: "acme-http-01-webroot",
                                webroot: `${__dirname}/acme/webroot/.well-known/acme-challenge`,
                            },
                        },
                        store: leStore,
                        debug: true,
                    });
                    log(`Added ${domain} to automatic Let's Encrypt certificate management system`.green);
                    pending--;
                    finaliseLetsEncrypt(domain);
                    break;
                default:
                    log(`Warning: cert type not set for ${domain}`.yellow);
            }
        }

        !config.certs.default && log('Warning: no default SSL certificate.'.yellow + ' ' + 'SSL ports array will be emptied.'.red);
        let ports = Object.keys(config.servers);
        ports.forEach(port => {
            !config.standard.includes(parseInt(port)) && !config.ssl.includes(parseInt(port)) && log(`Port ${port} is not included in SSL nor standard ports array.`.yellow + ' ' + `Server on port ${port} will not boot.`.red)
        });

        let interval = setInterval(() => {
            if (pending === 0) {
                _server.close();
                clearInterval(interval);
                Object.keys(cluster.workers).forEach(index => {
                    cluster.workers[index].send({config});
                })
            }
        }, 200);
    });

    /* END Let's Encrypt generator */

    /* BEGIN Dns Proxy */

    if (config.dns && typeof config.dns === 'object') {

        log('Initializing DNS Proxy...'.cyan);

        const dgram = require('dgram');
        const packet = require('native-dns-packet');
        const wildcard = require('wildcard2');
        const utils = require('./modules/utils.js');

        let dnsConfig;

        let defaults = {
            port: 53,
            host: 'localhost',
            nameservers: [
                '8.8.8.8',
                '8.8.4.4'
            ],
            servers: {},
            hosts: {},
            domains: {
                'xdev': '127.0.0.1'
            },
            fallback_timeout: 350
        };

        if (utils.isArray(config.dns)) {
            dnsConfig = {...defaults, nameservers: config.dns};
        } else {
            dnsConfig = {...defaults, ...config.dns};
        }

        const dnsServer = dgram.createSocket('udp4');

        dnsServer.on('listening', () => {
            log(`DNS Proxy listening at ${dnsConfig.host} port ${dnsConfig.port}`.green);
        });

        dnsServer.on('error', err => {
            log(`DNS UDP error`.red);
            // log(err)
        });

        dnsServer.on('message', (message, rinfo) => {
            let returner = false;
            let nameserver = dnsConfig.nameservers[0];

            const query = packet.parse(message);
            const domain = query.question[0].name;
            const type = query.question[0].type;

            log(`DNS Query: ${domain} ${type}`.cyan);

            Object.keys(dnsConfig.hosts).forEach(h => {
                if (domain === h) {
                    let answer = dnsConfig.hosts[h];
                    if (typeof dnsConfig.hosts[dnsConfig.hosts[h]] !== 'undefined') {
                        answer = dnsConfig.hosts[dnsConfig.hosts[h]];
                    }

                    log(`DNS Result - type: host, domain: ${domain}, answer: ${dnsConfig.hosts[h]}, source: ${rinfo.address}:${rinfo.port}, size: ${rinfo.size}`.green);

                    let res = utils.createAnswer(query, answer);
                    dnsServer.send(res, 0, res.length, rinfo.port, rinfo.address);

                    returner = true;
                }
            });

            if (returner) {
                return;
            }

            Object.keys(dnsConfig.domains).forEach(s => {
                let sLen = s.length;
                let dLen = domain.length;

                if ((domain.indexOf(s) >= 0 && domain.indexOf(s) === (dLen - sLen)) || wildcard(domain, s)) {
                    let answer = dnsConfig.domains[s];
                    if (typeof dnsConfig.domains[dnsConfig.domains[s]] !== 'undefined') {
                        answer = dnsConfig.domains[dnsConfig.domains[s]];
                    }

                    log(`DNS Result - type: server, domain: ${domain}, answer: ${dnsConfig.domains[s]}, source: ${rinfo.address}:${rinfo.port}, size: ${rinfo.size}`.green);

                    let res = utils.createAnswer(query, answer);
                    dnsServer.send(res, 0, res.length, rinfo.port, rinfo.address);

                    returner = true;
                }
            });

            if (returner) {
                return;
            }

            Object.keys(dnsConfig.servers).forEach(s => {
                if (domain.indexOf(s) !== -1) {
                    nameserver = dnsConfig.servers[s];
                }
            });
            let nameParts = nameserver.split(':');
            nameserver = nameParts[0];
            let port = nameParts[1] || 53;
            let fallback;
            (function queryns(message, nameserver) {
                const sock = dgram.createSocket('udp4');
                sock.send(message, 0, message.length, port, nameserver, () => {
                    fallback = setTimeout(() => {
                        queryns(message, dnsConfig.nameservers[0])
                    }, dnsConfig.fallback_timeout);
                });
                sock.on('error', err => {
                    log('Socket Error: %s', err);
                    process.exit(5);
                });
                sock.on('message', response => {
                    clearTimeout(fallback);
                    log(`DNS Result - type: primary, nameserver: ${nameserver}, query: ${domain}, type: ${utils.records[type] || 'unknown'}, answer: ${utils.listAnswer(response)}, source: ${rinfo.address}:${rinfo.port}, size: ${rinfo.size}`.green);
                    dnsServer.send(response, 0, response.length, rinfo.port, rinfo.address);
                    sock.close();
                })
            }(message, nameserver));
        });

        dnsServer.bind(dnsConfig.port, dnsConfig.host);

    }

    /* END Dns Proxy */

}

// Path Helper
const getPath = path => {
    if (path.startsWith('/'))
        return path;
    else
        return `${__dirname}/${path}`;
};

// Worker process
const main = app => {
    process.on('message', msg => {
        // Worker config
        let config;
        let secureContext = {};
        if (msg.config) {
            config = msg.config;
        }
        else {
            return;
        }

        Object.keys(config.certs).forEach(domain => {
            secureContext[domain] = tls.createSecureContext({
                key: config.certs[domain].key ? fs.readFileSync(getPath(config.certs[domain].key), 'utf8') : undefined,
                cert: config.certs[domain].cert ? fs.readFileSync(config.certs[domain].cert, 'utf8') : undefined,
                ca: config.certs[domain].ca ? fs.readFileSync(config.certs[domain].ca, 'utf8') : undefined
            });
        });

        // Worker dependencies
        const httpProxy = require('http-proxy');
        const http = require('http');
        const https = require('https');
        const Koa = require('koa');
        const serve = require('koa-static');
        const mount = require('koa-mount');
        const send = require('koa-send');

        // 404 fallback
        app.use(serve(`${__dirname}/web/404`));
        app.use(async (ctx, next) => {
            await send(ctx, `/web/404/index.html`);
            return next();
        });

        let proxy = httpProxy.createProxyServer({});

        let match = null;

        const icingEnd = request => {
            log(`Acacia request end: ${request}`.cyan);
        };

        // Proxy middleware
        proxy.on('proxyReq', (proxyReq, req, res, options) => {
            const protocol = req.connection.encrypted ? 'https' : 'http';
            if ( match && match.rewrite && typeof match.rewrite === 'object') {
                let rewrite = match.rewrite;
                !rewrite.regex && (rewrite.regex = '.*');
                !rewrite.output && (rewrite.output = "");
                let regExp = new RegExp(rewrite.regex);
                proxyReq.path = req.url.replace(regExp, rewrite.output);
                log(`Path rewrite with regex ${rewrite.regex} and output ${rewrite.output}`);
                log(`Rewrite from ${req.url.toString().green} to ${proxyReq.path.toString().green}`);
            }
            proxyReq.setHeader('X-Forwarded-Proto', protocol);
            if ( match && match.headers && typeof match.headers === 'object' && match.headers.length) {
                match.headers.forEach(obj => {
                    proxyReq.setHeader(obj.header, obj.value);
                });
            }
            if (match.php) {
                proxyReq.setHeader('host', proxyReq.getHeader('x-forwarded-host'));
            }
        });

        proxy.on('proxyRes', (proxyReq, req, res, options) => {
            const protocol = req.connection.encrypted ? 'https' : 'http';
            const pathname = url.parse(req.url).pathname;
            const request = `${req.method} ${protocol}://${req.headers.host}${pathname}`;
            icingEnd(request);
        });

        proxy.on('error', (err, req, res) => {
            if (typeof err === 'object' && ['ECONNREFUSED', 'ENOTFOUND'].includes(err.code)) {
                res.statusCode = 502;
                res.end(fs.readFileSync(`${__dirname}/web/502/index.html`, 'utf8'));
            }
            else {
                res.statusCode = 500;
                res.end(fs.readFileSync(`${__dirname}/web/500/index.html`, 'utf8'));
            }
            log(`Proxy failure with status code ${res.statusCode.toString().red}`);
            log(`Error code ${err.code.toString().red}`);
            icingEnd(req.requestString);
        });

        // Proxy
        const proxyServerCallback = (req, res) => {
            const protocol = req.connection.encrypted ? 'https' : 'http';
            const pathname = url.parse(req.url).pathname;
            const request = `${req.method} ${protocol}://${req.headers.host}${pathname}`;
            req.requestString = request;

            log(`Acacia request begin: ${request}`.cyan);

            if (pathname.startsWith('/.well-known')) {
                log(`Serving available ACME challenges.`);
                let server = new Koa();
                server.use(serve(`${__dirname}/acme/webroot`, {hidden: true}));
                let mounter = new Koa();
                mounter.use(mount('/', server));
                mounter.callback()(req, res);
                icingEnd(request);
                return;
            }

            const splitHost = req.headers.host ? req.headers.host.split(':') : [];
            let hostname = (splitHost[0] && splitHost[0] !== 'undefined') ? splitHost[0] : 'fallback';
            const port = splitHost[1] || (protocol === 'http' ? 80 : 443);

            if (config.aliases[hostname]) {
                hostname = config.aliases[hostname];
            }

            let originalHostname = req.headers.host ? req.headers.host.split(':')[0] : 'fallback';
            if (config.redirects[originalHostname]) {
                log(`Redirect ${originalHostname.yellow} to ${config.redirects[originalHostname].green}`);
                res.writeHead(301, {
                    'Location': `${protocol}://${config.redirects[originalHostname]}${pathname}`
                });
                res.end();
                icingEnd(request);
                return;
            }

            log(`Current hostname ${hostname.green} and port ${port.toString().green}`);

            const notFound = () => {
                log(`Hostname ${hostname.red} with pathname ${pathname.red} does not match any servers.`);
                app.callback()(req, res)
                    .then(() => {
                        icingEnd(request);
                    });
            };

            if (!config.servers[port] || !config.servers[port][hostname]) {
                notFound();
            }
            else {
                let servers = config.servers[port][hostname];

                match = null;

                for (let i = 0; i < servers.length; i++) {
                    let server = servers[i];
                    !server.regex && (server.regex = '.*');
                    let regExp = new RegExp(server.regex);
                    if (regExp.test(pathname)) {
                        log(`Pathname ${pathname.green} matches regex ${server.regex.green}`);
                        match = server;
                        match.index = i;
                        break;
                    }
                }

                if (!match) {
                    notFound();
                } else {
                    if (match.forceSSL) {
                        log(`Match ${'force SSL'.green} ${req.headers.host}`);
                        res.writeHead(301, {
                            'Location': `https://${req.headers.host}${pathname}`
                        });
                        res.end();
                        icingEnd(request);
                        return;
                    }

                    if (match.redirect) {
                        if (typeof match.redirect === 'string') {
                            log(`Match redirect 301 to ${match.redirect.green}`);
                            res.writeHead(301, {
                                'Location': match.redirect
                            });
                        }
                        else {
                            log(`Match redirect ${match.redirect.status} to ${match.redirect.location.green}`);
                            res.writeHead(match.redirect.status, {
                                'Location': match.redirect.location
                            });
                        }
                        res.end();
                        icingEnd(request);
                        return;
                    }

                    if (globalOptions.phpSupport && match.php) {
                        log(`Checking if PHP file...`.green);
                        let options = match.options || {};
                        proxy.web(req, res, {
                            target: 'http://localhost:' + globalOptions.phpOptions.serverPort,
                            changeOrigin: true,
                            secure: false,
                            ws: true,
                            xfwd: true,
                            headers: {
                                'PHP-Location': getPath(match.location),
                                'PHP-WordPress': !!match.wordpress,
                                'PHP-Rewrite-To-Index': !!match.rewriteToIndex,
                            },
                            ...options
                        });
                        return;
                    }

                    if (match.location) {
                        log(`Serving ${getPath(match.location)} on ${match.mount || '/'}`);
                        let server = new Koa();
                        server.use(serve(getPath(match.location)));
                        let mounter = new Koa();
                        mounter.use(mount(match.mount || '/', server));
                        mounter.callback()(req, res);
                        icingEnd(request);
                        return;
                    }

                    if (match.balance) {
                        // TODO enhance load balancer: check response time and status code from target

                        let targets = match.balance;
                        typeof config.servers[port][hostname][match.index].balanceCounter !== 'number' && (config.servers[port][hostname][match.index].balanceCounter = -1);

                        log(config.servers[port][hostname][match.index].balanceCounter);
                        log(`Balancing through ${targets.length.toString().green} targets`);

                        let current = config.servers[port][hostname][match.index].balanceCounter + 1;
                        current === targets.length && (current = 0);
                        config.servers[port][hostname][match.index].balanceCounter = current;

                        let target = targets[current];

                        log(`Proxying to ${target.green}`);
                        let options = match.options || {};
                        proxy.web(req, res, {
                            target: target,
                            changeOrigin: !!match.changeOrigin,
                            secure: !!match.secure,
                            ws: !!match.ws,
                            xfwd: !!match.xfwd,
                            ...options
                        });
                        return;
                    }

                    if (match.proxy) {
                        log(`Proxying to ${match.proxy.green}`);
                        let options = match.options || {};
                        proxy.web(req, res, {
                            target: match.proxy,
                            changeOrigin: !!match.changeOrigin,
                            secure: !!match.secure,
                            ws: !!match.ws,
                            xfwd: !!match.xfwd,
                            ...options
                        });
                        return;
                    }

                    notFound();
                }
            }
        };

        let server;

        // Standard proxy servers
        if (config.standard.length > 0) {
            server = http.createServer((req, res) => {
                proxyServerCallback(req, res);
            });

            config.standard.forEach(port => {

                // Start Listening
                server.listen(port, () => {
                    log(`Proxy server online on port ${port.toString()}`.green);
                });
            });
        }

        // SSL proxy servers
        if (config.ssl.length > 0) {
            const options = {
                SNICallback: (domain, cb) => {
                    if (secureContext[domain]) {
                        log(`SNI Callback for ${domain.green}`);
                        if (cb) {
                            cb(null, secureContext[domain]);
                        } else {
                            // compatibility for older versions of node
                            return secureContext[domain];
                        }
                    } else {
                        if (cb) {
                            cb(null, secureContext['default']);
                        } else {
                            // compatibility for older versions of node
                            return secureContext['default'];
                        }
                    }
                },
                key: fs.readFileSync(getPath(config.certs['default'].key), 'utf8'),
                cert: fs.readFileSync(getPath(config.certs['default'].cert), 'utf8')
            };

            server = https.createServer(options,(req, res) => {
                proxyServerCallback(req, res);
            });

            config.ssl.forEach(port => {

                // Start Listening
                server.listen(port, () => {
                    log(`Proxy server online on port ${port.toString()}`.green);
                });
            });
        }

        /* BEGIN PHP Server */

        if(options.phpSupport) {

            const express = require("express");
            const epf = require("./modules/mod-php-fpm").default;

            const phpApp = express();
            phpApp.use("/", (req, res, next) => {

                const phpOptions = {
                    // root of your php files
                    documentRoot: req.get('PHP-Location'),

                    // not found callback
                    notFound: (req, res, next) => {
                        if (req.url.endsWith('php')) {
                            req.url = '/index.html';
                            res.status(404);
                            express.static(`${__dirname}/web/404`)(req, res, next);
                        } else next();
                    },

                    // extra env variables
                    env: {},

                    // connection to your php-fpm server
                    // https://nodejs.org/api/net.html#net_socket_connect_options_connectlistener
                    socketOptions: {port: options.phpOptions.fpmPort},
                };

                epf(phpOptions)(req, res, next);
            });
            phpApp.listen(options.phpOptions.serverPort, () => log(`PHP Server listening on port ${options.phpOptions.serverPort}, FPM port ${options.phpOptions.fpmPort}`.green));

        }

        /* END PHP Server */
    });
};

Power.load(main, options.powerOptions);
