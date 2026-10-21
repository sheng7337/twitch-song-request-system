// server/messages.js
// Messages the web pages show to the streamer. Each has a `code` (+ `params`) that the
// pages translate with shared/i18n-server.js; the English text stays for logs and as a
// fallback for anything a page doesn't know yet.

// An error whose message the pages show translated.
class UserError extends Error {
  constructor(code, params, message) {
    super(message);
    this.messageCode = code;
    this.messageParams = params || {};
  }
}

// JSON body for an error response: { error, code?, params? }
function errorBody(err) {
  return err && err.messageCode
    ? { error: err.message, code: err.messageCode, params: err.messageParams }
    : { error: err && err.message ? err.message : String(err) };
}

// JSON body for a known message without throwing: res.status(400).json(message(...))
function message(code, params, text) {
  return { error: text, code, params: params || {} };
}

module.exports = { UserError, errorBody, message };
