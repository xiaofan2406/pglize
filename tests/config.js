module.exports = {
  test: {
    host: 'localhost',
    port: 5432,
    username: 'node',
    password: 'password',
    database: 'pglize'
  },
  travis: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: 'travis_ci_test'
  }
};
