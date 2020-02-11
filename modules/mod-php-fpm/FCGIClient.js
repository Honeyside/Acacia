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
exports.FCGIClient = void 0;

var _net = _interopRequireDefault(require("net"));

var FCGI = _interopRequireWildcard(require("./FCGI"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class FCGIClient {
  constructor(socketOptions) {
    _defineProperty(this, "buffer", Buffer.alloc(0));

    _defineProperty(this, "reqId", 0);

    _defineProperty(this, "socket", void 0);

    this.onData = this.onData.bind(this);
    this.onError = this.onError.bind(this);
    this.onClose = this.onClose.bind(this);
    this.socket = _net.default.connect(socketOptions);
    this.socket.on("data", this.onData);
    this.socket.on("error", this.onError);
    this.socket.on("close", this.onClose);
  }

  send(msgType, content) {
    for (let offset = 0; offset < content.length || offset === 0; offset += 0xffff) {
      const chunk = content.slice(offset, offset + 0xffff);
      const header = FCGI.createHeader(FCGI.VERSION_1, msgType, this.reqId, chunk.length, 0);
      this.socket.write(header);
      this.socket.write(chunk);
    }
  }

  onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length) {
      const record = FCGI.parseHeader(this.buffer);

      if (!record) {
        break;
      }

      this.buffer = this.buffer.slice(record.recordLength);
      this.onRecord(record);
    }
  }

  onError(e) {}

  onClose(hadError) {}

  onRecord(record) {}

}

exports.FCGIClient = FCGIClient;
