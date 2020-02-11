/*
 *
 * Honeyside
 * Acacia Proxy Server
 *
 * Unauthorized distribution of this software is not allowed. You must own a license.
 *
 */

"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = init;
exports.Handler = void 0;

var _express = _interopRequireDefault(require("express"));

var _Responder = require("./Responder");

var fs = require("fs");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function init(opt) {
  return new Handler(opt).router;
}

class Handler {
  constructor(opt) {
    this.opt = opt;

    _defineProperty(this, "connections", new Array(100));

    _defineProperty(this, "router", _express.default.Router());

    _defineProperty(this, "root", opt.documentRoot);

    this.router.use(this.handle.bind(this));
    this.router.use(opt.notFound);
    this.router.use(_express.default.static(opt.documentRoot));
  }

  handle(req, res, next) {
    let file = withoutQueryString(req.url);

    if (file.endsWith("/")) {
      file += "index.php";
    }

    if (!file.endsWith(".php")) {
      next();
      return;
    }

    if (!fs.existsSync(this.root + file)) {
      if ((req.get('PHP-WordPress') === 'true' || req.get('PHP-Rewrite-To-Index') === 'true')) {
          file = "/index.php";
      }
      else {
        next();
        return;
      }
    }

    new _Responder.Responder(this, file, req, res, next);
  }

  getFreeReqId() {
    let i = 0;

    while (this.connections[++i]) {}

    this.connections[i] = true;
    return i;
  }

  freeUpReqId(reqId) {
    this.connections[reqId] = false;
  }

}

exports.Handler = Handler;

function withoutQueryString(url) {
  const sep = url.indexOf("?");
  return sep === -1 ? url : url.substr(0, sep);
}
