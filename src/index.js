const pgPromise = require('pg-promise');

const makeCreateModel = require('./createModel');
const types = require('./types');

module.exports = function (dbConfig, pgConfig) {
  const pgp = pgPromise(pgConfig);
  const db = pgp(dbConfig);

  return {
    pgp,
    db,
    createModel: makeCreateModel(db),
    types
  };
};
