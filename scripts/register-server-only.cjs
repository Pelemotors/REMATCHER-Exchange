const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "stub-server-only.cjs");
  }
  return orig.call(this, request, parent, isMain, options);
};
