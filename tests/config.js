module.exports = {
  test: {
    host: 'localhost',
    port: 5432,
    user: 'node',
    password: 'password',
    database: 'pglize'
  },
  travis: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'travis_ci_test'
  }
};
