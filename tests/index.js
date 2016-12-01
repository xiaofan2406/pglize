const pg = require('../src')({
  host: 'localhost',
  port: 5432,
  username: 'node',
  password: 'password',
  database: 'pglize'
});

// do manual test here

const genTable = require('../src/table');

const tableName = 'test';
const schema = {
  id: {
    type: 'serial',
    primary: true
  },
  email: {
    type: pg.types.VARCHAR(),
    required: true,
    unique: true
  },
  username: {
    type: pg.types.VARCHAR(),
    default: 'username'
  },
  createdAt: {
    type: pg.types.TIMESTAMP
  },
  credit: {
    type: pg.types.INTEGER,
    default: 100
  }
};


const result = genTable(tableName, schema);

pg.db.none(result.query, result.values)
.then(console.log)
.catch(console.log);
