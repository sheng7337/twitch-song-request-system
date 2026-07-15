let last = null;

module.exports = {
  setLast(payload) { last = payload; },
  getLast() { return last; },
};
