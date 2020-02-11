module.exports = {
    aliases: {
        "localhost": "127.0.0.1",
        "www.example.com": "example.com"
    },
    redirects: {
        "example.com": "www.example.com"
    },
    certs: {
        default: {
            type: "path",
            cert: "certs/127.0.0.1.cert",
            key: "certs/127.0.0.1.key"
        },
        "127.0.0.1": {
            type: "path",
                cert: "certs/127.0.0.1.cert",
                key: "certs/127.0.0.1.key"
        },
        // "example.com": {
        //     type: "letsencrypt",         // DO NOT REQUEST LET'S ENCRYPT CERTIFICATES FOR DOMAINS THAT YOU DO NOT OWN
        //     email: "admin@example.com"   // TOO MANY FAILURES MAY RESULT IN A LET'S ENCRYPT BAN
        // }
    },
    standard: [80],
    ssl: [443],
    servers: {
        "80": {
            "127.0.0.1": [
                {
                    forceSSL: true
                }
            ],
            "example.com": [
                {
                    location: "/root/example.com"
                }
            ]
        },
        "443": {
            "127.0.0.1": [
                {
                    location: "/root/static",
                    regex: "^\/static.*"
                },
                {
                    mount: "/admin",
                    location: "web/admin",
                    regex: "^\/admin.*"
                },
                {
                    location: "/root/public/sad.group",
                    proxy: "https://jsonplaceholder.typicode.com/todos/1",
                    regex: "^\/todos.*",
                    rewrite: {
                        regex: "/[0-8]*$",
                        output: ""
                    },
                    changeOrigin: true,
                    secure: false,
                    ws: true
                },
                {
                    balance: ["http://s1.example.com", "http://s2.example.com"],
                    secure: false,
                    regex: "^\/balance.*"
                },
                {
                    proxy: "http://localhost:3000"
                }
            ]
        }
    }
};
