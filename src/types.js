const TEXT = 'text';
const BOOLEAN = 'boolean';
const SMALLINT = 'smallint';
const INTEGER = 'integer';
const BIGINT = 'bigint';
const VARCHAR = (size = 255) => `varchar(${size})`;
const NUMERIC = (prec = 8, scale = 4) => `numeric(${prec},${scale})`;


module.exports = {
  TEXT,
  BOOLEAN,
  SMALLINT,
  INTEGER,
  BIGINT,
  VARCHAR,
  NUMERIC
};
