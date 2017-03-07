module.exports = {
  test: {
    host: 'localhost',
    port: 5432,
    user: 'pglize_test',
    password: 'password',
    database: 'pglize_local_test'
  },
  travis: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'travis_ci_test'
  }
};
