const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "server-only-stub.cjs");
  }
  return orig.call(this, request, parent, isMain, options);
};
